import { useCallback, useEffect, useRef, useState } from 'react'
import type { CustomizerFaceAppearance } from '../../../../shared/customizer'
import { resolveEditorV6TalkMouthId } from '../../../../shared/editorV6'
import type { FaceCatalogItem, FaceCatalogItemSummary } from '../../../../shared/fabricator'
import { editorV6FaceDetailIds, editorV6FaceDetailsAreLoading, editorV6FaceSheetKind, editorV6SelectedFaceCatalogItemId, type EditorV6FaceCategory } from './editorV6FaceSelection'
import { rememberEditorV6FaceCatalogItem } from './editorV6FaceDetailCache'

type FaceCatalogErrorHandler = (reason: unknown) => void

export function useEditorV6FaceCatalog(
  modelSlot: number | null,
  category: EditorV6FaceCategory,
  mode: 'idle' | 'blink' | 'talk' | 'talk-blink',
  appearance: CustomizerFaceAppearance | undefined,
  onError: FaceCatalogErrorHandler
) {
  const [items, setItems] = useState<FaceCatalogItemSummary[]>([])
  const [details, setDetails] = useState<Record<string, FaceCatalogItem>>({})
  const [loading, setLoading] = useState(false)
  const [loadingDetails, setLoadingDetails] = useState<ReadonlySet<string>>(() => new Set())
  const detailsRef = useRef(details)
  const detailRequestsRef = useRef(new Map<string, Promise<FaceCatalogItem | null>>())
  const loadingDetailsRef = useRef(new Set<string>())
  const modelItems = modelSlot === null ? [] : items.filter((item) => item.modelSlot === modelSlot)
  const openMouthId = resolveEditorV6TalkMouthId(appearance, modelItems)
  const sheetKind = editorV6FaceSheetKind(category, mode)
  const selectedItemId = editorV6SelectedFaceCatalogItemId(category, mode, appearance, openMouthId)

  const loadItem = useCallback((slot: number, id: string): Promise<FaceCatalogItem | null> => {
    const key = `${slot}:${id}`
    const cached = detailsRef.current[key]
    if (cached) {
      detailsRef.current = rememberEditorV6FaceCatalogItem(detailsRef.current, key, cached)
      return Promise.resolve(cached)
    }
    const pending = detailRequestsRef.current.get(key)
    if (pending) return pending

    const nextLoading = new Set(loadingDetailsRef.current).add(key)
    loadingDetailsRef.current = nextLoading
    setLoadingDetails(nextLoading)

    const request = Promise.resolve()
      .then(() => window.desktop.fabricator.loadFaceCatalogItem(slot, id))
      .then((item) => {
        if (item) {
          const next = rememberEditorV6FaceCatalogItem(detailsRef.current, key, item)
          detailsRef.current = next
          setDetails(next)
        }
        return item
      })
      .finally(() => {
        detailRequestsRef.current.delete(key)
        const remaining = new Set(loadingDetailsRef.current)
        remaining.delete(key)
        loadingDetailsRef.current = remaining
        setLoadingDetails(remaining)
      })

    detailRequestsRef.current.set(key, request)
    return request
  }, [])

  useEffect(() => {
    let cancelled = false
    setItems([])
    if (modelSlot === null) {
      setLoading(false)
      return () => { cancelled = true }
    }
    setLoading(true)
    void window.desktop.fabricator.listFaceCatalog(modelSlot).then((catalog) => {
      if (!cancelled) setItems(catalog)
    }).catch((reason: unknown) => {
      if (!cancelled) onError(reason)
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [modelSlot, onError])

  const requiredItemIds = editorV6FaceDetailIds(selectedItemId, openMouthId)
  const requiredItemIdsKey = requiredItemIds.join('\u0000')
  const loadingRequiredDetails = editorV6FaceDetailsAreLoading(modelSlot, requiredItemIds, loadingDetails)
  useEffect(() => {
    if (modelSlot === null || !requiredItemIdsKey) return
    let cancelled = false
    const requests = requiredItemIdsKey.split('\u0000').map((id) => loadItem(modelSlot, id))
    void Promise.allSettled(requests).then((results) => {
      if (cancelled) return
      const failure = results.find((result): result is PromiseRejectedResult => result.status === 'rejected')
      if (failure) onError(failure.reason)
    })
    return () => { cancelled = true }
  }, [modelSlot, requiredItemIdsKey, loadItem, onError])

  return { items: modelItems, details, loading, loadingRequiredDetails, loadItem, openMouthId, selectedItemId, sheetKind }
}

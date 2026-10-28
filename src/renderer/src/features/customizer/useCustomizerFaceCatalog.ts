/** Carrega catálogos faciais do Fabricador e detalhes faciais legados usados pelo personagem. */
import { useEffect } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { CustomizerCharacter } from '../../../../shared/customizer'
import type { FaceCatalogItem, FaceCatalogItemSummary, FaceComponentAsset, FaceComponentAssetSummary, FaceSet } from '../../../../shared/fabricator'
import { loadStandardExpressionEffects, type StandardExpressionEffects } from '../../characters/characterRenderer'

export function useCustomizerFaceCatalog(deps: {
  selectedModelSlot: number | null
  activeModule: string | null
  appearance: CustomizerCharacter['customization']['faceAppearance']
  faceDetails: Record<string, FaceSet>
  setFaceCatalogItems: Dispatch<SetStateAction<FaceCatalogItemSummary[]>>
  setFaceCatalogDetails: Dispatch<SetStateAction<Record<string, FaceCatalogItem>>>
  setStandardExpressionEffects: Dispatch<SetStateAction<StandardExpressionEffects>>
  setFaceComponentAssets: Dispatch<SetStateAction<FaceComponentAssetSummary[]>>
  setFaceComponentDetails: Dispatch<SetStateAction<Record<string, FaceComponentAsset>>>
  setFaceDetails: Dispatch<SetStateAction<Record<string, FaceSet>>>
  setFaceLoading: Dispatch<SetStateAction<boolean>>
  setFaceComponentLoading: Dispatch<SetStateAction<boolean>>
  setCatalogError: Dispatch<SetStateAction<string>>
}) {
  const {
    selectedModelSlot, activeModule, appearance, faceDetails,
    setFaceCatalogItems, setFaceCatalogDetails, setStandardExpressionEffects,
    setFaceComponentAssets, setFaceComponentDetails, setFaceDetails,
    setFaceLoading, setFaceComponentLoading, setCatalogError
  } = deps

  useEffect(() => {
    if (selectedModelSlot === null) { setFaceCatalogItems([]); return }
    let cancelled = false
    setFaceLoading(true)
    void window.desktop.listFaceCatalog(selectedModelSlot).then(async (summaries) => {
      if (cancelled) return
      setFaceCatalogItems(summaries)
      const loaded = await Promise.all(summaries.map(async (summary) => ({ key: `${summary.modelSlot}:${summary.id}`, item: await window.desktop.loadFaceCatalogItem(summary.modelSlot, summary.id) })))
      if (cancelled) return
      setFaceCatalogDetails((current) => {
        const next = { ...current }
        for (const entry of loaded) if (entry.item) next[entry.key] = entry.item
        return next
      })
    }).catch((reason: unknown) => {
      if (!cancelled && activeModule === 'Cabeça') setCatalogError(reason instanceof Error ? reason.message : 'Não foi possível carregar os rostos salvos.')
    }).finally(() => { if (!cancelled) setFaceLoading(false) })
    return () => { cancelled = true }
  }, [selectedModelSlot, activeModule])

  useEffect(() => {
    if (selectedModelSlot === null) { setStandardExpressionEffects({}); return }
    let cancelled = false
    void loadStandardExpressionEffects(selectedModelSlot).then((effects) => {
      if (!cancelled) setStandardExpressionEffects(effects)
    }).catch((reason: unknown) => {
      if (!cancelled) setCatalogError(reason instanceof Error ? reason.message : 'Não foi possível carregar os ajustes das expressões.')
    })
    return () => { cancelled = true }
  }, [selectedModelSlot])

  useEffect(() => {
    if (selectedModelSlot === null) { setFaceComponentAssets([]); setFaceComponentDetails({}); setFaceComponentLoading(false); return }
    let cancelled = false
    setFaceComponentLoading(true)
    void window.desktop.listFaceComponentAssets(selectedModelSlot).then(async (summaries) => {
      const details = await Promise.all(summaries.map((summary) => window.desktop.loadFaceComponentAsset(selectedModelSlot, summary.id)))
      if (cancelled) return
      setFaceComponentAssets(summaries)
      setFaceComponentDetails(Object.fromEntries(details.filter((item): item is FaceComponentAsset => Boolean(item)).map((item) => [item.id, item])))
    }).catch((reason: unknown) => { if (!cancelled) setCatalogError(reason instanceof Error ? reason.message : 'Não foi possível carregar os assets faciais.') }).finally(() => { if (!cancelled) setFaceComponentLoading(false) })
    return () => { cancelled = true }
  }, [selectedModelSlot])

  useEffect(() => {
    if (!appearance?.setId || appearance.modelSlot !== selectedModelSlot) return
    let cancelled = false
    const key = `${appearance.modelSlot}:${appearance.setId}`
    if (faceDetails[key]) return
    void window.desktop.loadFaceSet(appearance.modelSlot, appearance.setId).then((face) => {
      if (!cancelled && face) setFaceDetails((current) => ({ ...current, [key]: face }))
    }).catch((reason: unknown) => {
      if (!cancelled) setCatalogError(reason instanceof Error ? reason.message : 'Não foi possível carregar o rosto legado.')
    })
    return () => { cancelled = true }
  }, [appearance, faceDetails, selectedModelSlot])
}

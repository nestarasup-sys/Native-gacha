import { useEffect, type Dispatch, type SetStateAction } from 'react'
import type { FaceExpressionCollection, FaceExpressionPresetSummary } from '../../../shared/fabricator'

/** Loads the shared expression library and refreshes it when the app becomes visible again. */
export function useFaceExpressionCatalog({
  modelSlot,
  setCollections,
  setPresets,
  setLoading,
  setError,
  errorFallback
}: {
  modelSlot: number | null
  setCollections: Dispatch<SetStateAction<FaceExpressionCollection[]>>
  setPresets: Dispatch<SetStateAction<FaceExpressionPresetSummary[]>>
  setLoading: Dispatch<SetStateAction<boolean>>
  setError: Dispatch<SetStateAction<string | null>>
  errorFallback: string
}) {
  useEffect(() => {
    let cancelled = false
    let latestRequest = 0

    if (modelSlot === null) {
      setCollections([])
      setPresets([])
      setLoading(false)
      return () => { cancelled = true }
    }

    const refresh = () => {
      const request = ++latestRequest
      setLoading(true)
      void Promise.all([
        window.desktop.fabricator.listFaceExpressionCollections(modelSlot),
        window.desktop.fabricator.listFaceExpressionPresets(modelSlot)
      ]).then(([collections, presets]) => {
        if (cancelled || request !== latestRequest) return
        setCollections(collections)
        setPresets(presets)
      }).catch((reason: unknown) => {
        if (cancelled || request !== latestRequest) return
        setError(reason instanceof Error ? reason.message : errorFallback)
      }).finally(() => {
        if (!cancelled && request === latestRequest) setLoading(false)
      })
    }

    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    refresh()
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refreshWhenVisible)
    return () => {
      cancelled = true
      latestRequest += 1
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
    }
  }, [modelSlot, setCollections, setPresets, setLoading, setError, errorFallback])
}

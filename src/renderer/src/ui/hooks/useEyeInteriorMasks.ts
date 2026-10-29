import { useEffect, useMemo, useRef, useState } from 'react'
import { eyeInteriorMask } from '../image/eyeInteriorMask'

type EyeMaskAsset = { id: string; dataUrl: string }
type CachedEyeMask = { sourceDataUrl: string; maskDataUrl: string }

/** Keeps masks only for visible eyes and reuses completed masks for unchanged images. */
export function useEyeInteriorMasks(visibleEyes: readonly EyeMaskAsset[]): Record<string, string> {
  const [masks, setMasks] = useState<Record<string, CachedEyeMask>>({})
  const masksRef = useRef(masks)
  masksRef.current = masks

  useEffect(() => {
    let cancelled = false
    const visibleSources = new Map(visibleEyes.map((asset) => [asset.id, asset.dataUrl]))
    setMasks((current) => {
      const retained = Object.fromEntries(Object.entries(current)
        .filter(([id, mask]) => visibleSources.get(id) === mask.sourceDataUrl))
      return Object.keys(retained).length === Object.keys(current).length ? current : retained
    })

    const missingMasks = visibleEyes.filter((asset) => masksRef.current[asset.id]?.sourceDataUrl !== asset.dataUrl)
    if (missingMasks.length) {
      void Promise.all(missingMasks.map(async (asset) => ({
        id: asset.id,
        sourceDataUrl: asset.dataUrl,
        maskDataUrl: await eyeInteriorMask(asset.dataUrl)
      }))).then((entries) => {
        if (cancelled) return
        setMasks((current) => ({
          ...current,
          ...Object.fromEntries(entries.map(({ id, sourceDataUrl, maskDataUrl }) => [id, { sourceDataUrl, maskDataUrl }]))
        }))
      }).catch(() => undefined)
    }

    return () => { cancelled = true }
  }, [visibleEyes])

  return useMemo(() => Object.fromEntries(Object.entries(masks).map(([id, mask]) => [id, mask.maskDataUrl])), [masks])
}

import { useEffect, useState } from 'react'
import type { FabricatorPoseSummary } from '../../../../shared/fabricator'
import { loadEditorV6PoseThumbnails } from './editorV6PoseCatalog'

/** Owns the selected model's saved poses and their lightweight inspector previews. */
export function useEditorV6PoseCatalog(modelSlot: number | null, reportError: (message: string) => void) {
  const [poseSlots, setPoseSlots] = useState<Array<NonNullable<FabricatorPoseSummary>>>([])
  const [poseThumbnails, setPoseThumbnails] = useState<Record<number, string>>({})
  const [poseDimensions, setPoseDimensions] = useState<Record<number, { width: number; height: number }>>({})

  useEffect(() => {
    let cancelled = false
    setPoseSlots([])
    setPoseThumbnails({})
    setPoseDimensions({})
    if (modelSlot === null) return () => { cancelled = true }

    void window.desktop.fabricator.listFabricatorPoseSlots(modelSlot).then((poses) => {
      if (!cancelled) setPoseSlots(poses.filter((pose): pose is NonNullable<FabricatorPoseSummary> => Boolean(pose)))
    }).catch((reason: unknown) => {
      if (!cancelled) reportError(reason instanceof Error ? reason.message : 'Não foi possível carregar as poses do modelo.')
    })
    return () => { cancelled = true }
  }, [modelSlot, reportError])

  useEffect(() => {
    if (modelSlot === null || !poseSlots.length) {
      setPoseThumbnails({})
      setPoseDimensions({})
      return
    }

    let cancelled = false
    void (async () => {
      const { renderArtwork } = await import('../../characters/editorV6CharacterRenderer')
      const previews = await loadEditorV6PoseThumbnails({
        modelSlot,
        poses: poseSlots,
        isCancelled: () => cancelled,
        loadPose: (sourceModelSlot, poseSlot) => window.desktop.fabricator.loadFabricatorPose(sourceModelSlot, poseSlot),
        renderArtwork
      })
      if (cancelled) return
      setPoseThumbnails(Object.fromEntries(previews.map((preview) => [preview.slot, preview.thumbnail])))
      setPoseDimensions(Object.fromEntries(previews.map((preview) => [preview.slot, { width: preview.width, height: preview.height }])))
    })().catch(() => {
      if (!cancelled) {
        setPoseThumbnails({})
        setPoseDimensions({})
      }
    })
    return () => { cancelled = true }
  }, [modelSlot, poseSlots])

  return { poseSlots, poseThumbnails, poseDimensions }
}

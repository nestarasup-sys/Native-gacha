import type { FabricatorPose, FabricatorPoseSummary } from '../../../../shared/fabricator'
import { isPoseSnapshotForModel } from '../../../../shared/characterSourceContinuity.ts'
import { mapConcurrentItems } from '../../ui/mapConcurrentItems.ts'

export type EditorV6PoseThumbnail = { slot: number; thumbnail: string; width: number; height: number }

type LoadEditorV6PoseThumbnailsDependencies = {
  modelSlot: number
  poses: readonly NonNullable<FabricatorPoseSummary>[]
  isCancelled: () => boolean
  loadPose: (modelSlot: number, poseSlot: number) => Promise<FabricatorPose | null>
  renderArtwork: (artwork: FabricatorPose, maxSize: number) => Promise<string | null>
}

/** Loads a model's saved pose previews without allowing stale or unrelated snapshots into the catalog. */
export async function loadEditorV6PoseThumbnails({
  modelSlot,
  poses,
  isCancelled,
  loadPose,
  renderArtwork
}: LoadEditorV6PoseThumbnailsDependencies): Promise<EditorV6PoseThumbnail[]> {
  const modelPoses = poses.filter((pose) => pose.sourceModelSlot === modelSlot)
  const previews = await mapConcurrentItems(modelPoses, async (pose) => {
    try {
      const artwork = await loadPose(pose.sourceModelSlot, pose.slot)
      if (!isPoseSnapshotForModel(artwork, pose.sourceModelSlot, pose.slot)) return null
      const thumbnail = await renderArtwork(artwork, 180)
      return thumbnail ? { slot: pose.slot, thumbnail, width: artwork.width, height: artwork.height } : null
    } catch {
      return null
    }
  }, isCancelled)

  return previews.filter((preview): preview is EditorV6PoseThumbnail => preview !== null)
}

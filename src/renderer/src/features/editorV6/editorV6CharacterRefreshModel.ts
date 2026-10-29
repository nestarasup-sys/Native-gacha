import type { EditorV6Document } from '../../../../shared/editorV6'
import { fitElementToTrim, type TrimmedImage } from '../../characters/characterGeometry.ts'
import type { EditorV6CharacterRefreshResult } from './characterSnapshotRefresh'

export type EditorV6TimelineSnapshotPruner = (project: EditorV6Document) => EditorV6Document

/** Applies legacy transparent-border crops to every scene and timeline snapshot using that asset. */
export function applyEditorV6CharacterAssetCrops(
  project: EditorV6Document,
  crops: Array<{ assetId: string; crop: TrimmedImage }>,
  updatedAt = new Date().toISOString()
): EditorV6Document {
  const cropByAsset = new Map(crops.map(({ assetId, crop }) => [assetId, crop]))
  if (!cropByAsset.size) return project

  return {
    ...project,
    assets: project.assets.map((asset) => {
      const crop = cropByAsset.get(asset.id)
      return crop ? { ...asset, dataUrl: crop.dataUrl, mimeType: 'image/png' } : asset
    }),
    elements: project.elements.map((element) => {
      const crop = element.kind === 'character' && element.assetId ? cropByAsset.get(element.assetId) : undefined
      return crop ? fitElementToTrim(element, crop) : element
    }),
    timeline: {
      ...project.timeline,
      tracks: project.timeline.tracks.map((track) => ({
        ...track,
        blocks: track.blocks.map((block) => {
          const crop = block.state?.kind === 'character' && block.state.assetId
            ? cropByAsset.get(block.state.assetId)
            : undefined
          return crop && block.state ? { ...block, state: fitElementToTrim(block.state, crop) } : block
        })
      }))
    },
    updatedAt
  }
}

/** Applies refreshed snapshots, then delegates orphan snapshot collection to the timeline owner. */
export function applyEditorV6CharacterRefreshResult(
  project: EditorV6Document,
  result: EditorV6CharacterRefreshResult,
  pruneSnapshots: EditorV6TimelineSnapshotPruner,
  updatedAt = new Date().toISOString()
): EditorV6Document {
  const timeline = {
    ...project.timeline,
    tracks: project.timeline.tracks.map((track) => ({
      ...track,
      blocks: track.blocks.map((block) => {
        const state = result.nextBlocks.get(block.id)
        return state ? { ...block, state, label: state.text.trim().slice(0, 120) || block.label } : block
      })
    }))
  }
  return pruneSnapshots({
    ...project,
    elements: project.elements.map((element) => result.nextElements.get(element.id) ?? element),
    assets: [
      ...project.assets.map((asset) => result.staleAssetIds.has(asset.id) ? { ...asset, timelineSnapshot: true } : asset),
      ...result.refreshedAssets
    ],
    timeline,
    updatedAt
  })
}

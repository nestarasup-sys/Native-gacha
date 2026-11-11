import type { EditorV6Document } from '../../../../shared/editorV6'
import { fitElementToTrim } from '../../characters/characterGeometry.ts'
import type { TrimmedImage } from '../../characters/transparentImageTrim.ts'
import type { EditorV6CharacterRefreshResult } from './editorV6CharacterRefreshTypes'

export type EditorV6TimelineSnapshotPruner = (project: EditorV6Document) => EditorV6Document

/** Facial variants share one crop. Legacy normalization must not trim one of
 * those images independently when a project is reopened. */
export function editorV6LegacyCharacterCropAssetIds(project: EditorV6Document): Set<string> {
  const states = [...project.elements, ...project.timeline.tracks.flatMap(track => track.blocks.flatMap(block => block.state ? [block.state] : []))]
  const aligned = new Set(states.flatMap(state => state.kind === 'character' && Object.values(state.faceModeAssetIds ?? {}).some(Boolean)
    ? [state.assetId, ...Object.values(state.faceModeAssetIds ?? {})] : []))
  return new Set(project.elements.flatMap(element => element.kind === 'character' && element.assetId && !aligned.has(element.assetId) ? [element.assetId] : []))
}

/** Stable snapshot identity used to reject async refreshes based on an older scene state. */
export function editorV6CharacterRefreshStateSignature(state: EditorV6Document['elements'][number]): string {
  return JSON.stringify(state)
}

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
  const isCurrentElement = (id: string, state: EditorV6Document['elements'][number]) => {
    const expected = result.expectedElementStates?.get(id)
    return expected === undefined || editorV6CharacterRefreshStateSignature(state) === expected
  }
  const isCurrentBlock = (id: string, state: EditorV6Document['elements'][number]) => {
    const expected = result.expectedBlockStates?.get(id)
    return expected === undefined || editorV6CharacterRefreshStateSignature(state) === expected
  }
  const timeline = {
    ...project.timeline,
    tracks: project.timeline.tracks.map((track) => ({
      ...track,
      blocks: track.blocks.map((block) => {
        const state = result.nextBlocks.get(block.id)
        return state && block.state && isCurrentBlock(block.id, block.state)
          ? { ...block, state, label: state.text.trim().slice(0, 120) || block.label }
          : block
      })
    }))
  }
  return pruneSnapshots({
    ...project,
    elements: project.elements.map((element) => {
      const refreshed = result.nextElements.get(element.id)
      return refreshed && isCurrentElement(element.id, element) ? refreshed : element
    }),
    assets: [
      ...project.assets.map((asset) => result.staleAssetIds.has(asset.id) ? { ...asset, timelineSnapshot: true } : asset),
      ...result.refreshedAssets
    ],
    timeline,
    updatedAt
  })
}

import type { EditorV6Document } from '../../../../shared/editorV6'
import type { EditorV6CharacterRefreshResult } from './editorV6CharacterRefreshTypes'

export type EditorV6TimelineSnapshotPruner = (project: EditorV6Document) => EditorV6Document

/** Stable snapshot identity used to reject async refreshes based on an older scene state. */
export function editorV6CharacterRefreshStateSignature(state: EditorV6Document['elements'][number]): string {
  return JSON.stringify(state)
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

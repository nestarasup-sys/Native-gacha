import type { EditorV6Timeline as Timeline } from '../../../../shared/editorV6'
import { timelineClips } from '../../../../shared/editorV6TimelineCore'
import { duplicateEditorV6Block, splitEditorV6Block } from '../../../../shared/editorV6TimelineEdits'

type Dependencies = {
  getTimeline: () => Timeline
  getFrame: () => number
  changeTimeline: (update: (timeline: Timeline) => Timeline) => void
  closeMenu: () => void
}

/** Owns block editing actions while the timeline component maps input and renders menus. */
export function createEditorV6TimelineBlockCommands(dependencies: Dependencies) {
  const remove = (id: string) => {
    const found = timelineClips(dependencies.getTimeline()).find(({ block }) => block.id === id)
    if (!found || found.track.locked) return
    const removedEndFrame = found.block.startFrame + found.block.durationFrames
    const removedDurationFrames = found.block.durationFrames
    dependencies.changeTimeline((current) => ({ ...current, tracks: current.tracks.map((track) => ({
      ...track,
      blocks: track.blocks.flatMap((block) => {
        if (block.id === id) {
          if (track.kind !== 'character' || track.blocks.some((candidate) => candidate.id !== id && candidate.startFrame >= removedEndFrame)) return []
          return [{ ...block, id: crypto.randomUUID(), label: 'Vazio', state: block.state ? { ...block.state, visible: false } : undefined, emptyGap: true }]
        }
        if (block.parentBlockId === id) return []
        if (track.id === found.track.id && block.startFrame >= removedEndFrame) return [{ ...block, startFrame: Math.max(found.block.startFrame, block.startFrame - removedDurationFrames) }]
        return [block]
      })
    })) }))
    dependencies.closeMenu()
  }

  const split = (id: string) => {
    dependencies.changeTimeline((current) => splitEditorV6Block(current, id, dependencies.getFrame()))
    dependencies.closeMenu()
  }

  const duplicate = (id: string) => {
    dependencies.changeTimeline((current) => duplicateEditorV6Block(current, id))
    dependencies.closeMenu()
  }

  return { remove, split, duplicate }
}

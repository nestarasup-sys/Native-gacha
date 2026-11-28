import type { EditorV6Timeline as Timeline } from '../../../../shared/editorV6'
import { findEditorV6TimelineClip } from '../../../../shared/editorV6TimelineCore'
import { duplicateEditorV6Block, removeEditorV6TimelineBlock, splitEditorV6Block } from '../../../../shared/editorV6TimelineEdits'

type Dependencies = {
  getTimeline: () => Timeline
  getFrame: () => number
  changeTimeline: (update: (timeline: Timeline) => Timeline) => void
  closeMenu: () => void
}

/** Owns block editing actions while the timeline component maps input and renders menus. */
export function createEditorV6TimelineBlockCommands(dependencies: Dependencies) {
  const remove = (id: string) => {
    const found = findEditorV6TimelineClip(dependencies.getTimeline(), id)
    if (!found || found.track.locked) return
    dependencies.changeTimeline(current => removeEditorV6TimelineBlock(current, id))
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

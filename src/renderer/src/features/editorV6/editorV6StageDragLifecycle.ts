import type { EditorV6Document } from '../../../../shared/editorV6'
import { editorV6ClipAtFrame } from '../../../../shared/editorV6TimelineCore'
import type { EditorV6StageDrag } from './editorV6StageDrag'

type EditorV6StageDragLifecycleBaseDependencies = {
  updateActiveProject: (update: (project: EditorV6Document) => EditorV6Document) => void
  markUnsaved: () => void
  now: () => string
}

export type EditorV6StageDragRollbackDependencies = EditorV6StageDragLifecycleBaseDependencies & {
  setSelectedTimelineBlockId: (id: string | null) => void
}

export type EditorV6StageDragCommitDependencies = EditorV6StageDragLifecycleBaseDependencies & {
  recordHistory: (document: EditorV6Document) => void
}

/** Restores the document snapshot and selection after a moved drag is cancelled. */
export function rollbackEditorV6StageDrag(
  drag: EditorV6StageDrag,
  dependencies: EditorV6StageDragRollbackDependencies
): void {
  if (!drag.moved) return

  dependencies.updateActiveProject((project) => project.id === drag.before.id
    ? { ...drag.before, updatedAt: dependencies.now() }
    : project)
  dependencies.setSelectedTimelineBlockId(drag.target === 'background'
    ? null
    : drag.target === 'video'
      ? drag.blockId
      : editorV6ClipAtFrame(drag.before.timeline, drag.id, drag.frame)?.block.id ?? null)
  dependencies.markUnsaved()
}

/** Commits history for a moved drag while leaving the last transient position intact. */
export function commitEditorV6StageDrag(
  drag: EditorV6StageDrag,
  dependencies: EditorV6StageDragCommitDependencies
): void {
  if (!drag.moved) return

  dependencies.recordHistory(drag.before)
  dependencies.updateActiveProject((project) => project.id === drag.before.id
    ? { ...project, updatedAt: dependencies.now() }
    : project)
  dependencies.markUnsaved()
}

import type { EditorV6Document, EditorV6Timeline as Timeline } from '../../../../shared/editorV6'
import { normalizeEditorV6Timeline } from '../../../../shared/editorV6TimelineCore'
import { pruneEditorV6TimelineSnapshots } from '../../../../shared/editorV6TimelineEdits'

export function applyEditorV6TimelineUpdate(
  document: EditorV6Document,
  update: (timeline: Timeline) => Timeline,
  updatedAt: string
): EditorV6Document {
  return pruneEditorV6TimelineSnapshots({
    ...document,
    timeline: normalizeEditorV6Timeline(update(document.timeline)),
    updatedAt
  })
}

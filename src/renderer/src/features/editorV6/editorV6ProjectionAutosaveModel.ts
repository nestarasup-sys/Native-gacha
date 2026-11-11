export type EditorV6ProjectionAutosaveSignature = { projectId: string; value: string }
export type EditorV6ProjectionAutosaveAction = 'reset' | 'skip' | 'baseline' | 'save-now' | 'debounce'

export function getEditorV6ProjectionAutosaveAction(
  projectId: string | null,
  signature: string,
  previous: EditorV6ProjectionAutosaveSignature | null,
  dragActive: boolean
): EditorV6ProjectionAutosaveAction {
  if (!projectId) return 'reset'
  if (dragActive) return 'skip'
  if (previous?.projectId !== projectId) return 'baseline'
  return previous.value !== signature ? 'save-now' : 'debounce'
}

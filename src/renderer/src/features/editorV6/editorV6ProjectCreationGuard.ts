export type EditorV6ProjectCreationGuard = { current: boolean }

export async function runEditorV6ProjectCreationOnce(
  guard: EditorV6ProjectCreationGuard,
  setCreating: (creating: boolean) => void,
  createProject: () => Promise<void>
) {
  if (guard.current) return
  guard.current = true
  try {
    setCreating(true)
    await createProject()
  } finally {
    guard.current = false
    setCreating(false)
  }
}

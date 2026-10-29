import { join } from 'node:path'

/** Caminhos persistidos dos projetos e assets do Editor V6. */
export function createEditorV6Paths(userDataPath: () => string) {
  const editorV6LibraryPath = () => join(userDataPath(), 'studios', 'Editor V6')
  const editorV6Path = (id: string) => join(editorV6LibraryPath(), `editorV6-${id}`)
  return { editorV6LibraryPath, editorV6Path }
}

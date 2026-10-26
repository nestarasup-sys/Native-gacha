/** Índice de documentos do EditorV6 Principal. */
import type * as nodeFs from 'node:fs/promises'
import type { EditorV6ProjectSummary } from '../../../src/shared/editorV6'

type Files = Pick<typeof nodeFs, 'mkdir' | 'readdir'>

export function createEditorV6LibraryIndex(deps: {
  files: Files
  editorV6LibraryPath: () => string
  readEditorV6Summary: (id: string) => Promise<EditorV6ProjectSummary | null>
}) {
  async function listEditorV6s(): Promise<EditorV6ProjectSummary[]> {
    await deps.files.mkdir(deps.editorV6LibraryPath(), { recursive: true })
    const entries = await deps.files.readdir(deps.editorV6LibraryPath(), { withFileTypes: true })
    const documents = await Promise.all(entries
      .filter((entry) => entry.isDirectory() && /^editorV6-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(entry.name))
      .map((entry) => deps.readEditorV6Summary(entry.name.slice('editorV6-'.length))))
    return documents.filter((editorV6): editorV6 is EditorV6ProjectSummary => editorV6 !== null)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.title.localeCompare(right.title))
  }

  return { listEditorV6s }
}

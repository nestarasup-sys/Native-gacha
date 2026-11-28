/** Índice de documentos do EditorV6 Principal. */
import type * as nodeFs from 'node:fs/promises'
import type { EditorV6Document, EditorV6ProjectSummary } from '../../../src/shared/editorV6'

type Files = Pick<typeof nodeFs, 'mkdir' | 'readdir'>
type EditorV6PoseReferenceDocument = Pick<EditorV6Document, 'id' | 'title' | 'elements' | 'timeline'>

export function createEditorV6LibraryIndex(deps: {
  files: Files
  editorV6LibraryPath: () => string
  readEditorV6Summary: (id: string) => Promise<EditorV6ProjectSummary | null>
  readEditorV6PoseReferences: (id: string) => Promise<EditorV6PoseReferenceDocument | null>
}) {
  async function listEditorV6Ids(): Promise<string[]> {
    await deps.files.mkdir(deps.editorV6LibraryPath(), { recursive: true })
    const entries = await deps.files.readdir(deps.editorV6LibraryPath(), { withFileTypes: true })
    return entries
      .filter((entry) => entry.isDirectory() && /^editorV6-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(entry.name))
      .map((entry) => entry.name.slice('editorV6-'.length))
  }

  async function listEditorV6s(): Promise<EditorV6ProjectSummary[]> {
    const ids = await listEditorV6Ids()
    const results = await Promise.allSettled(ids.map((id) => deps.readEditorV6Summary(id)))
    const documents = results.flatMap((result, index): EditorV6ProjectSummary[] => {
      if (result.status === 'fulfilled' && result.value) return [result.value]
      const id = ids[index]
      const detail = result.status === 'rejected'
        ? result.reason instanceof Error ? result.reason.message : String(result.reason)
        : 'O manifesto do projeto não foi encontrado.'
      const reason = detail.trim() ? detail.slice(0, 1000) : 'O manifesto do projeto não pôde ser lido.'
      return [{
        id,
        title: `Projeto indisponível · ${id.slice(0, 8)}`,
        color: '#fff4e5',
        createdAt: '1970-01-01T00:00:00.000Z',
        updatedAt: '1970-01-01T00:00:00.000Z',
        unavailableReason: reason
      }]
    })
    return documents.sort((left, right) => {
      if (Boolean(left.unavailableReason) !== Boolean(right.unavailableReason)) return left.unavailableReason ? 1 : -1
      return left.createdAt.localeCompare(right.createdAt) || left.title.localeCompare(right.title)
    })
  }

  async function listEditorV6PoseReferenceDocuments(): Promise<EditorV6PoseReferenceDocument[]> {
    const documents = await Promise.all((await listEditorV6Ids()).map((id) => deps.readEditorV6PoseReferences(id)))
    return documents.filter((document): document is EditorV6PoseReferenceDocument => document !== null)
  }

  return { listEditorV6s, listEditorV6PoseReferenceDocuments }
}

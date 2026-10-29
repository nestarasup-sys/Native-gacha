/** Índice de documentos do Studio Principal. */
import type * as nodeFs from 'node:fs/promises'
import type { StudioDocument } from '../../../src/shared/studio'

type Files = Pick<typeof nodeFs, 'mkdir' | 'readdir'>
type StudioPoseReferenceDocument = Pick<StudioDocument, 'id' | 'title' | 'elements'>

export function createStudioLibraryIndex(deps: {
  files: Files
  studioLibraryPath: () => string
  readStudio: (id: string) => Promise<StudioDocument | null>
  readStudioPoseReferences?: (id: string) => Promise<StudioPoseReferenceDocument | null>
}) {
  async function listStudioIds(): Promise<string[]> {
    await deps.files.mkdir(deps.studioLibraryPath(), { recursive: true })
    const entries = await deps.files.readdir(deps.studioLibraryPath(), { withFileTypes: true })
    return entries
      .filter((entry) => entry.isDirectory() && /^studio-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(entry.name))
      .map((entry) => entry.name.slice('studio-'.length))
  }

  async function listStudios(): Promise<StudioDocument[]> {
    const documents = await Promise.all((await listStudioIds()).map((id) => deps.readStudio(id)))
    return documents.filter((studio): studio is StudioDocument => studio !== null)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.title.localeCompare(right.title))
  }

  async function listStudioPoseReferenceDocuments(): Promise<StudioPoseReferenceDocument[]> {
    const readPoseReferences = deps.readStudioPoseReferences ?? deps.readStudio
    const documents = await Promise.all((await listStudioIds()).map((id) => readPoseReferences(id)))
    return documents.filter((studio): studio is StudioPoseReferenceDocument => studio !== null)
  }

  return { listStudios, listStudioPoseReferenceDocuments }
}

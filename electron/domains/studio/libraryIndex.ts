/** Índice de documentos do Studio Principal. */
import type * as nodeFs from 'node:fs/promises'
import type { StudioDocument } from '../../../src/shared/studio'

type Files = Pick<typeof nodeFs, 'mkdir' | 'readdir'>

export function createStudioLibraryIndex(deps: {
  files: Files
  studioLibraryPath: () => string
  readStudio: (id: string) => Promise<StudioDocument | null>
}) {
  async function listStudios(): Promise<StudioDocument[]> {
    await deps.files.mkdir(deps.studioLibraryPath(), { recursive: true })
    const entries = await deps.files.readdir(deps.studioLibraryPath(), { withFileTypes: true })
    const documents = await Promise.all(entries
      .filter((entry) => entry.isDirectory() && /^studio-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(entry.name))
      .map((entry) => deps.readStudio(entry.name.slice('studio-'.length))))
    return documents.filter((studio): studio is StudioDocument => studio !== null)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.title.localeCompare(right.title))
  }

  return { listStudios }
}

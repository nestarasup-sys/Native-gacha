/** Casos de uso da biblioteca de vídeos compartilhada entre as áreas. */
import type { VideoLibraryItem } from '../../../src/shared/mediaLibrary'

type VideoLibraryAdapter = {
  list: () => Promise<VideoLibraryItem[]>
  importFile: (path: string) => Promise<VideoLibraryItem>
  finishImport: (id: string, durationFrames: number) => Promise<VideoLibraryItem>
  rename: (id: string, name: string) => Promise<VideoLibraryItem>
  delete: (id: string) => Promise<void>
}

export function createVideoLibraryService(deps: {
  library: VideoLibraryAdapter
  openImportDialog: () => Promise<string | null>
  enqueueWrite: <T>(operation: () => Promise<T> | T) => Promise<T>
  coordinateReferenceChange: <T>(operation: () => Promise<T> | T) => Promise<T>
  assertNoReferences: (id: string) => Promise<void>
}) {
  return {
    list: () => deps.library.list(),
    async import(): Promise<VideoLibraryItem | null> {
      const path = await deps.openImportDialog()
      return path ? deps.library.importFile(path) : null
    },
    finishImport: (id: string, durationFrames: number) => deps.library.finishImport(id, durationFrames),
    rename: (id: string, name: string) => deps.library.rename(id, name),
    delete: (id: string): Promise<void> => deps.enqueueWrite(() => deps.coordinateReferenceChange(async () => {
      await deps.assertNoReferences(id)
      await deps.library.delete(id)
    }))
  }
}

/** Casos de uso da biblioteca compartilhada de fundos. */
import type { VideoBackgroundLibraryItem } from '../../../src/shared/studio'

const BACKGROUND_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export type BackgroundLibraryServiceDependencies = {
  openImportDialog: () => Promise<string | null>
  library: {
    list: () => Promise<VideoBackgroundLibraryItem[]>
    importFile: (path: string) => Promise<VideoBackgroundLibraryItem>
    delete: (id: string) => Promise<void>
  }
  assertRoteiroUnreferenced: (id: string) => void
  enqueueWrite: <T>(operation: () => Promise<T> | T) => Promise<T>
}

export function createBackgroundLibraryService(deps: BackgroundLibraryServiceDependencies) {
  return {
    list: () => deps.library.list(),
    async import(): Promise<VideoBackgroundLibraryItem | null> {
      const path = await deps.openImportDialog()
      return path ? deps.library.importFile(path) : null
    },
    delete(value: unknown): Promise<void> {
      if (typeof value !== 'string' || !BACKGROUND_ID.test(value)) throw new Error('Identificador de fundo inválido.')
      return deps.enqueueWrite(async () => {
        deps.assertRoteiroUnreferenced(value)
        await deps.library.delete(value)
      })
    }
  }
}

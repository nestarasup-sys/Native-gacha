/** Casos de uso da biblioteca compartilhada de fundos. */
import type { VideoBackgroundLibraryItem } from '../../../src/shared/studio'

const BACKGROUND_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export type BackgroundLibraryServiceDependencies = {
  openImportDialog: () => Promise<string | null>
  library: {
    list: () => Promise<VideoBackgroundLibraryItem[]>
    importFile: (path: string) => Promise<VideoBackgroundLibraryItem>
    rename: (id: string, name: string) => Promise<void>
    delete: (id: string) => Promise<void>
  }
  assertRoteiroUnreferenced: (id: string) => void
  assertEditorV6Unreferenced: (id: string) => Promise<void>
  editorV6ReferencesForIds: (ids: readonly string[]) => Promise<Map<string, Array<{ id: string; title: string }>>>
  coordinateReferenceChange: <T>(operation: () => Promise<T>) => Promise<T>
  enqueueWrite: <T>(operation: () => Promise<T> | T) => Promise<T>
}

export function createBackgroundLibraryService(deps: BackgroundLibraryServiceDependencies) {
  return {
    async list() {
      const items = await deps.library.list()
      const references = await deps.editorV6ReferencesForIds(items.map((item) => item.id))
      return items.map((item) => ({ ...item, editorV6Projects: references.get(item.id) ?? [] }))
    },
    async import(): Promise<VideoBackgroundLibraryItem | null> {
      const path = await deps.openImportDialog()
      return path ? deps.library.importFile(path) : null
    },
    rename(id: unknown, name: unknown): Promise<void> {
      if (typeof id !== 'string' || !BACKGROUND_ID.test(id) || typeof name !== 'string') throw new Error('Dados de renomeação inválidos.')
      return deps.enqueueWrite(() => deps.library.rename(id, name))
    },
    delete(value: unknown): Promise<void> {
      if (typeof value !== 'string' || !BACKGROUND_ID.test(value)) throw new Error('Identificador de fundo inválido.')
      return deps.enqueueWrite(() => deps.coordinateReferenceChange(async () => {
        deps.assertRoteiroUnreferenced(value)
        await deps.assertEditorV6Unreferenced(value)
        await deps.library.delete(value)
      }))
    }
  }
}

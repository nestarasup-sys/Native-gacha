/** Casos de uso da biblioteca de GIFs do Roteiros, sem Electron ou filesystem. */
import type { RoteiroUiGifItem } from '../../../src/shared/roteiros'
import { isRoteiroId } from './validation.ts'

export type RoteiroUiGifsServiceDependencies = {
  getDefaultGifPath: () => string | undefined
  openImportDialog: () => Promise<string | null>
  library: {
    list: (defaultGifPath: string) => Promise<RoteiroUiGifItem[]>
    importFile: (path: string) => Promise<RoteiroUiGifItem>
    delete: (id: string) => Promise<void>
  }
  assertUnreferenced: (id: string) => void
  enqueueWrite: <T>(operation: () => Promise<T> | T) => Promise<T>
}

export function createRoteiroUiGifsService(deps: RoteiroUiGifsServiceDependencies) {
  return {
    list(): Promise<RoteiroUiGifItem[]> {
      const defaultGifPath = deps.getDefaultGifPath()
      if (!defaultGifPath) throw new Error('O GIF padrão do Gacha V5 não foi encontrado na instalação.')
      return deps.library.list(defaultGifPath)
    },
    async import(): Promise<RoteiroUiGifItem | null> {
      const path = await deps.openImportDialog()
      return path ? deps.library.importFile(path) : null
    },
    async delete(value: unknown): Promise<void> {
      if (!isRoteiroId(value)) throw new Error('Identificador de GIF inválido.')
      await deps.enqueueWrite(async () => {
        deps.assertUnreferenced(value)
        await deps.library.delete(value)
      })
    }
  }
}

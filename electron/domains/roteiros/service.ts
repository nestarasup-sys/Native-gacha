/** Coordena leitura e gravação dos documentos sem depender do processo Electron. */
import type { Database } from 'better-sqlite3'
import type { RoteiroDocument } from '../../../src/shared/roteiros'
import { collectRoteirosVideoReferenceIds } from './videoReferences.ts'
import { RoteirosRepository } from './repository.ts'
import { isRoteiroDocumentList } from './validation.ts'

export type RoteirosDocumentServiceDependencies = {
  getDatabase: () => Database | null
  waitForPendingWrites: () => Promise<void>
  enqueueWrite: <T>(operation: () => Promise<T> | T) => Promise<T>
  coordinateVideoReferenceChange: <T>(operation: () => Promise<T> | T) => Promise<T>
  assertLibraryVideoReferencesAvailable: (videoIds: readonly string[]) => Promise<void>
}

export function createRoteirosDocumentService(deps: RoteirosDocumentServiceDependencies) {
  const repository = () => {
    const db = deps.getDatabase()
    if (!db) throw new Error('Catálogo de dados não inicializado.')
    return new RoteirosRepository(db)
  }

  return {
    async list(): Promise<RoteiroDocument[]> {
      await deps.waitForPendingWrites()
      return repository().list()
    },
    save(value: unknown): Promise<void> {
      if (!isRoteiroDocumentList(value)) throw new Error('A lista de roteiros enviada para salvar é inválida.')
      const documents: RoteiroDocument[] = value
      return deps.enqueueWrite(() => deps.coordinateVideoReferenceChange(async () => {
        const data = repository()
        const existingVideoIds = data.listVideoReferenceIds()
        const addedVideoIds = [...collectRoteirosVideoReferenceIds(documents)].filter((id) => !existingVideoIds.has(id))
        await deps.assertLibraryVideoReferencesAvailable(addedVideoIds)
        data.save(documents)
      }))
    }
  }
}

/** Regras e fila dos logs de exportação de Roteiros. */
import type { Database } from 'better-sqlite3'
import type { RoteiroExportLog } from '../../../src/shared/roteiros'
import { RoteiroExportLogsRepository } from './exportLogsRepository.ts'
import { isRoteiroExportLog, isRoteiroId } from './validation.ts'

export type RoteiroExportLogsServiceDependencies = {
  getDatabase: () => Database | null
  waitForPendingWrites: () => Promise<void>
  enqueueWrite: <T>(operation: () => Promise<T> | T) => Promise<T>
}

export function createRoteiroExportLogsService(deps: RoteiroExportLogsServiceDependencies) {
  const repository = () => {
    const db = deps.getDatabase()
    if (!db) throw new Error('Catálogo de dados não inicializado.')
    return new RoteiroExportLogsRepository(db)
  }

  return {
    async list(value: unknown): Promise<RoteiroExportLog[]> {
      if (!isRoteiroId(value)) throw new Error('Identificador de roteiro inválido.')
      await deps.waitForPendingWrites()
      return repository().list(value)
    },
    append(roteiroId: unknown, value: unknown): Promise<void> {
      if (!isRoteiroId(roteiroId) || !isRoteiroExportLog(value, roteiroId)) throw new Error('Dados do log de exportação inválidos.')
      const data = repository()
      return deps.enqueueWrite(() => data.append(roteiroId, value))
    },
    clear(value: unknown): Promise<void> {
      if (!isRoteiroId(value)) throw new Error('Identificador de roteiro inválido.')
      const data = repository()
      return deps.enqueueWrite(() => data.clear(value))
    }
  }
}

/** SQL dos registros de exportação pertence ao catálogo de Roteiros. */
import type { Database } from 'better-sqlite3'
import type { RoteiroExportLog } from '../../../src/shared/roteiros'

export class RoteiroExportLogsRepository {
  constructor(private readonly db: Database) {}

  list(roteiroId: string): RoteiroExportLog[] {
    return (this.db.prepare('SELECT id, roteiro_id, created_at, action, status, details FROM roteiro_export_logs WHERE roteiro_id=? ORDER BY created_at DESC, id DESC LIMIT 50').all(roteiroId) as Array<{ id: string; roteiro_id: string; created_at: string; action: string; status: 'success' | 'error'; details: string }>).map((row) => ({ id: row.id, roteiroId: row.roteiro_id, createdAt: row.created_at, action: row.action, status: row.status, details: row.details }))
  }

  append(roteiroId: string, entry: RoteiroExportLog): void {
    this.db.transaction(() => {
      this.db.prepare('INSERT INTO roteiro_export_logs(id, roteiro_id, created_at, action, status, details) VALUES (?, ?, ?, ?, ?, ?)').run(entry.id, roteiroId, entry.createdAt, entry.action.trim(), entry.status, entry.details)
      this.db.prepare('DELETE FROM roteiro_export_logs WHERE roteiro_id=? AND id NOT IN (SELECT id FROM roteiro_export_logs WHERE roteiro_id=? ORDER BY created_at DESC, id DESC LIMIT 50)').run(roteiroId, roteiroId)
    })()
  }

  clear(roteiroId: string): void {
    this.db.prepare('DELETE FROM roteiro_export_logs WHERE roteiro_id=?').run(roteiroId)
  }
}

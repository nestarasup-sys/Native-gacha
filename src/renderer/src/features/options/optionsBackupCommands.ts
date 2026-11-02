import type {
  DataBackupDeleteResult, DataBackupRestoreResult, DataBackupSummary, DataBackupVerification
} from '../../../../shared/dataManagement'
import { formatBytes } from './optionsDiagnostics'

type OptionsBackupCommandDependencies = {
  createBackup: () => Promise<DataBackupVerification>
  verifyBackup: (id: string) => Promise<DataBackupVerification>
  restoreBackup: (id: string) => Promise<DataBackupRestoreResult>
  deleteBackup: (id: string) => Promise<DataBackupDeleteResult>
  refreshBackups: () => Promise<void>
  setBusy: (busy: boolean) => void
  setMessage: (message: string | null) => void
  setError: (message: string | null) => void
}

/** Owns backup action feedback while the data-management service retains persistence and recovery. */
export function createOptionsBackupCommands(dependencies: OptionsBackupCommandDependencies) {
  const begin = () => {
    dependencies.setBusy(true)
    dependencies.setError(null)
    dependencies.setMessage(null)
  }
  const fail = (reason: unknown, fallback: string) => {
    dependencies.setError(reason instanceof Error ? reason.message : fallback)
  }

  const create = async () => {
    begin()
    try {
      const created = await dependencies.createBackup()
      dependencies.setMessage(`Backup criado e verificado · ${created.fileCount.toLocaleString('pt-BR')} arquivos · ${formatBytes(created.byteLength)}.`)
      await dependencies.refreshBackups()
    } catch (reason) {
      fail(reason, 'Não foi possível criar o backup.')
    } finally {
      dependencies.setBusy(false)
    }
  }

  const verify = async (backup: DataBackupSummary) => {
    begin()
    try {
      const result = await dependencies.verifyBackup(backup.id)
      dependencies.setMessage(result.valid
        ? `Backup íntegro: ${result.fileCount.toLocaleString('pt-BR')} arquivos e catálogo SQLite verificados.`
        : 'O backup não passou na validação.')
      await dependencies.refreshBackups()
    } catch (reason) {
      fail(reason, 'A verificação falhou.')
    } finally {
      dependencies.setBusy(false)
    }
  }

  const restore = async (backup: DataBackupSummary) => {
    begin()
    try {
      const result = await dependencies.restoreBackup(backup.id)
      dependencies.setMessage(result.cancelled
        ? 'Restauração cancelada; os dados atuais não foram alterados.'
        : 'Backup preparado. O aplicativo vai reiniciar para aplicar e verificar a restauração.')
    } catch (reason) {
      fail(reason, 'Não foi possível preparar a restauração.')
    } finally {
      dependencies.setBusy(false)
    }
  }

  const remove = async (backup: DataBackupSummary) => {
    begin()
    try {
      const result = await dependencies.deleteBackup(backup.id)
      dependencies.setMessage(result.deleted ? 'Backup excluído.' : 'Exclusão cancelada.')
      await dependencies.refreshBackups()
    } catch (reason) {
      fail(reason, 'Não foi possível excluir o backup.')
    } finally {
      dependencies.setBusy(false)
    }
  }

  return { create, verify, restore, remove }
}

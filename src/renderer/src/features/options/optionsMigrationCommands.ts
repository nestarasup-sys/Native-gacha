import type { DataMigrationPauseResult, DataMigrationProgress, DataMigrationResult } from '../../../../shared/dataManagement'

type OptionsMigrationCommandDependencies = {
  runMigration: () => Promise<DataMigrationResult>
  pauseMigration: () => Promise<DataMigrationPauseResult>
  restartAfterMigration: () => Promise<void>
  refreshMigration: () => Promise<void>
  setBusy: (busy: boolean) => void
  setPauseRequested: (requested: boolean) => void
  setProgress: (progress: DataMigrationProgress | null) => void
  setError: (message: string | null) => void
}

/** Coordinates legacy migration actions while the page owns progress events and rendering. */
export function createOptionsMigrationCommands(dependencies: OptionsMigrationCommandDependencies) {
  const run = async () => {
    dependencies.setBusy(true)
    dependencies.setPauseRequested(false)
    dependencies.setError(null)
    dependencies.setProgress(null)
    try {
      await dependencies.runMigration()
      await dependencies.refreshMigration()
    } catch (reason) {
      dependencies.setError(reason instanceof Error
        ? reason.message
        : 'A migração foi interrompida; os dados de origem foram preservados.')
    } finally {
      dependencies.setBusy(false)
      dependencies.setPauseRequested(false)
      dependencies.setProgress(null)
    }
  }

  const pause = async () => {
    dependencies.setPauseRequested(true)
    try {
      await dependencies.pauseMigration()
    } catch (reason) {
      dependencies.setError(reason instanceof Error ? reason.message : 'Não foi possível pausar a migração.')
    }
  }

  const restart = async () => {
    dependencies.setError(null)
    try {
      await dependencies.restartAfterMigration()
    } catch (reason) {
      dependencies.setError(reason instanceof Error ? reason.message : 'Não foi possível reiniciar o aplicativo.')
    }
  }

  return { run, pause, restart }
}

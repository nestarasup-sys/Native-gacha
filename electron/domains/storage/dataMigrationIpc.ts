import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import type { DataMigrationOutcome, DataMigrationSummary } from '../../../src/shared/dataManagement'

type DataMigrationServicePort = {
  prepare: () => Promise<DataMigrationSummary>
  migrateDomain: (domainId: string) => Promise<DataMigrationOutcome>
}

export function registerDataMigrationHandlers(deps: {
  ipcMain: Pick<IpcMain, 'handle'>
  assertTrustedSender: (event: IpcMainInvokeEvent) => void
  getService: () => DataMigrationServicePort | null
  runMaintenance: <T>(operation: () => Promise<T>) => Promise<T>
  relaunch: () => void
  quit: () => void
}) {
  let running = false
  let pauseRequested = false
  let activeTask: Promise<unknown> | null = null

  deps.ipcMain.handle('app:data-migration:prepare', async (event) => {
    deps.assertTrustedSender(event)
    const service = deps.getService()
    if (!service) throw new Error('Serviço de migração ainda não inicializado.')
    return service.prepare()
  })
  deps.ipcMain.handle('app:data-migration:run-all', async (event) => {
    deps.assertTrustedSender(event)
    const service = deps.getService()
    if (!service) throw new Error('Serviço de migração ainda não inicializado.')
    if (running) throw new Error('Uma migração já está em andamento.')
    running = true
    pauseRequested = false
    const outcomes: DataMigrationOutcome[] = []
    const task = deps.runMaintenance(async () => {
      const prepared = await service.prepare()
      if (!prepared.hasEnoughSpace) throw new Error('Espaço livre insuficiente para validar os dados com segurança.')
      for (const domain of prepared.domains) {
        if (pauseRequested) break
        if (domain.state === 'active' || domain.state === 'verified') continue
        outcomes.push(await service.migrateDomain(domain.domainId))
      }
      return { outcomes, paused: pauseRequested, summary: await service.prepare() }
    })
    activeTask = task
    try { return await task }
    finally { running = false; activeTask = null }
  })
  deps.ipcMain.handle('app:data-migration:pause', async (event) => {
    deps.assertTrustedSender(event)
    pauseRequested = true
    return { paused: running }
  })
  deps.ipcMain.handle('app:data-migration:restart', async (event) => {
    deps.assertTrustedSender(event)
    if (running) throw new Error('Aguarde a migração atual terminar antes de reiniciar.')
    const summary = await deps.getService()?.prepare()
    if (!summary || summary.domains.some((domain) => domain.state !== 'active' && domain.state !== 'verified')) throw new Error('Ainda há domínios que não foram migrados.')
    deps.relaunch()
    deps.quit()
  })

  return { getActiveTask: () => activeTask }
}

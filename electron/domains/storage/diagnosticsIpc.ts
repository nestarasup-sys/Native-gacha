import type { IpcMain, IpcMainInvokeEvent, SaveDialogOptions } from 'electron'
import { basename } from 'node:path'
import { isDiagnosticEventIdListWithinBridgeLimits } from '../../application/diagnosticEventInput'
import type {
  DataBackupSummary, DataStorageSummary, DiagnosticEventExportResult, DiagnosticsReportSaveResult,
  LocalDiagnosticEvent, LocalDiagnosticEventInput, RuntimeDiagnosticsSnapshot
} from '../../../src/shared/dataManagement'

export function registerDiagnosticsHandlers(deps: {
  ipcMain: Pick<IpcMain, 'handle'>
  assertTrustedSender: (event: IpcMainInvokeEvent) => void
  log: {
    list: () => Promise<LocalDiagnosticEvent[]>
    recordRenderer: (event: unknown) => Promise<void>
  }
  getRuntimeDiagnostics: (event: IpcMainInvokeEvent) => Promise<RuntimeDiagnosticsSnapshot>
  getStorageSummary: () => Promise<DataStorageSummary>
  listBackups: () => Promise<DataBackupSummary[]>
  getAppVersion: () => string
  showSaveDialog: (event: IpcMainInvokeEvent, options: SaveDialogOptions) => Promise<{ canceled: boolean; filePath?: string }>
  writeFile: (path: string, data: string) => Promise<void>
}) {
  deps.ipcMain.handle('app:diagnostics:list', async (event): Promise<LocalDiagnosticEvent[]> => {
    deps.assertTrustedSender(event)
    return deps.log.list()
  })

  deps.ipcMain.handle('app:diagnostics:record', async (event, input: LocalDiagnosticEventInput): Promise<void> => {
    deps.assertTrustedSender(event)
    await deps.log.recordRenderer(input)
  })

  deps.ipcMain.handle('app:diagnostics:runtime', async (event): Promise<RuntimeDiagnosticsSnapshot> => {
    deps.assertTrustedSender(event)
    return deps.getRuntimeDiagnostics(event)
  })

  deps.ipcMain.handle('app:diagnostics:export', async (event): Promise<DiagnosticsReportSaveResult> => {
    deps.assertTrustedSender(event)
    const defaultPath = `Native-gacha-diagnostico-${new Date().toISOString().slice(0, 10)}.json`
    const choice = await deps.showSaveDialog(event, {
      title: 'Salvar relatório de diagnóstico',
      defaultPath,
      filters: [{ name: 'Relatório JSON', extensions: ['json'] }]
    })
    if (choice.canceled || !choice.filePath) return { saved: false }

    const [runtime, storage, backups, events] = await Promise.all([
      deps.getRuntimeDiagnostics(event), deps.getStorageSummary(), deps.listBackups(), deps.log.list()
    ])
    const report = {
      format: 'native-gacha-diagnostics-v1',
      generatedAt: new Date().toISOString(),
      privacy: {
        eventMessagesAreFreeText: true,
        localPathsAndUrlsSanitized: true,
        reviewBeforeSharing: true
      },
      app: { name: 'Native-gacha', version: deps.getAppVersion(), runtime },
      storage: { ...storage.disk, catalog: storage.catalog },
      backups: {
        count: backups.length,
        verifiedCount: backups.filter((backup) => backup.verifiedAt !== null).length,
        totalBytes: backups.reduce((total, backup) => total + backup.byteLength, 0),
        totalFiles: backups.reduce((total, backup) => total + backup.fileCount, 0)
      },
      events: events.slice(-250)
    }
    await deps.writeFile(choice.filePath, JSON.stringify(report, null, 2))
    return { saved: true, fileName: basename(choice.filePath) }
  })

  deps.ipcMain.handle('app:diagnostics:export-events', async (event, input: unknown): Promise<DiagnosticEventExportResult> => {
    deps.assertTrustedSender(event)
    if (!isDiagnosticEventIdListWithinBridgeLimits(input)) throw new Error('Seleção de eventos de diagnóstico inválida.')

    const availableEvents = new Map((await deps.log.list()).map((diagnosticEvent) => [diagnosticEvent.id, diagnosticEvent]))
    const selectedEvents = [...new Set(input)].map((id) => availableEvents.get(id)).filter((item): item is LocalDiagnosticEvent => !!item)
    if (!selectedEvents.length) return { saved: false, eventCount: 0 }

    const defaultPath = `Native-gacha-eventos-${new Date().toISOString().slice(0, 10)}.json`
    const choice = await deps.showSaveDialog(event, {
      title: 'Exportar eventos de diagnóstico',
      defaultPath,
      filters: [{ name: 'Eventos JSON', extensions: ['json'] }]
    })
    if (choice.canceled || !choice.filePath) return { saved: false, eventCount: selectedEvents.length }

    const report = {
      format: 'native-gacha-diagnostic-events-v1',
      generatedAt: new Date().toISOString(),
      privacy: { eventMessagesAreFreeText: true, pathsAndCredentialsSanitized: true, reviewBeforeSharing: true },
      events: selectedEvents
    }
    await deps.writeFile(choice.filePath, JSON.stringify(report, null, 2))
    return { saved: true, fileName: basename(choice.filePath), eventCount: selectedEvents.length }
  })
}

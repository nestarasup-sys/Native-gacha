/** Handlers IPC das exportações de Roteiros e propriedade dos jobs por janela. */
import type { IpcMain, IpcMainInvokeEvent } from 'electron'

type RoteiroExportService = {
  exportAssets: (request: unknown) => Promise<{ path: string; files: number }>
  ensureExportFolder: (request: unknown) => Promise<string>
  startCharacterExport: (request: unknown) => Promise<{ jobId: string; folderName: string; assetCountLimit: number }>
  writeCharacterExportAsset: (jobId: string, asset: unknown) => Promise<void>
  finishCharacterExport: (jobId: string) => Promise<{ folderName: string; path: string; characters: number; files: number }>
  cancelCharacterExport: (jobId: string) => Promise<void>
}

export function registerRoteiroExportHandlers(deps: {
  ipcMain: Pick<IpcMain, 'handle'>
  assertTrustedSender: (event: IpcMainInvokeEvent) => void
  openPath: (path: string) => Promise<string>
  service: RoteiroExportService
}): void {
  const jobOwners = new Map<string, number>()

  function assertExportOwner(event: IpcMainInvokeEvent, jobId: unknown): asserts jobId is string {
    if (typeof jobId !== 'string' || jobOwners.get(jobId) !== event.sender.id) throw new Error('Esta exportação não pertence a esta janela.')
  }

  deps.ipcMain.handle('roteiros:assets-export', async (event, request: unknown) => {
    deps.assertTrustedSender(event)
    return deps.service.exportAssets(request)
  })

  deps.ipcMain.handle('roteiros:export-folder:open', async (event, request: unknown) => {
    deps.assertTrustedSender(event)
    const folder = await deps.service.ensureExportFolder(request)
    const error = await deps.openPath(folder)
    if (error) throw new Error(`Não foi possível abrir a pasta: ${error}`)
  })

  deps.ipcMain.handle('roteiros:characters-export:start', async (event, request: unknown) => {
    deps.assertTrustedSender(event)
    const result = await deps.service.startCharacterExport(request)
    jobOwners.set(result.jobId, event.sender.id)
    event.sender.once('destroyed', () => {
      const abandoned = [...jobOwners].filter(([, owner]) => owner === event.sender.id).map(([id]) => id)
      for (const id of abandoned) {
        jobOwners.delete(id)
        void deps.service.cancelCharacterExport(id).catch(() => undefined)
      }
    })
    return result
  })

  deps.ipcMain.handle('roteiros:characters-export:asset', async (event, jobId: unknown, asset: unknown) => {
    deps.assertTrustedSender(event)
    assertExportOwner(event, jobId)
    await deps.service.writeCharacterExportAsset(jobId, asset)
  })

  deps.ipcMain.handle('roteiros:characters-export:finish', async (event, jobId: unknown) => {
    deps.assertTrustedSender(event)
    assertExportOwner(event, jobId)
    const result = await deps.service.finishCharacterExport(jobId)
    jobOwners.delete(jobId)
    return result
  })

  deps.ipcMain.handle('roteiros:characters-export:cancel', async (event, jobId: unknown) => {
    deps.assertTrustedSender(event)
    assertExportOwner(event, jobId)
    try { await deps.service.cancelCharacterExport(jobId) }
    finally { jobOwners.delete(jobId) }
  })
}

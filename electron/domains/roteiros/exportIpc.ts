/** Handlers IPC das exportações de Roteiros e propriedade dos jobs por janela. */
import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import { createKeyedOperationQueue } from '../storage/keyedOperationQueue.ts'

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
}): { drain: () => Promise<void>; resumeAfterFailedShutdown: () => void } {
  const jobOwners = new Map<string, number>()
  const watchedSenders = new Set<number>()
  const activeTasks = new Set<Promise<unknown>>()
  const jobOperations = createKeyedOperationQueue({ retainFailures: true })
  let shuttingDown = false
  let drainTask: Promise<void> | null = null

  const track = <T>(operation: () => Promise<T>): Promise<T> => {
    const task = Promise.resolve().then(operation)
    activeTasks.add(task)
    void task.then(() => activeTasks.delete(task), () => activeTasks.delete(task))
    return task
  }

  const assertAvailable = () => {
    if (shuttingDown) throw new Error('O aplicativo está encerrando; tente novamente depois.')
  }

  const runJob = <T>(jobId: string, operation: () => Promise<T>): Promise<T> =>
    track(() => jobOperations.run(jobId, operation))

  const cancelJob = (jobId: string): Promise<void> => {
    if (!jobOwners.has(jobId)) return Promise.resolve()
    return runJob(jobId, async () => {
      if (!jobOwners.has(jobId)) return
      await deps.service.cancelCharacterExport(jobId)
      jobOwners.delete(jobId)
    })
  }

  const watchSender = (event: IpcMainInvokeEvent) => {
    const senderId = event.sender.id
    if (watchedSenders.has(senderId)) return
    watchedSenders.add(senderId)
    event.sender.once('destroyed', () => {
      watchedSenders.delete(senderId)
      const abandonedJobs = [...jobOwners]
        .filter(([, ownerId]) => ownerId === senderId)
        .map(([jobId]) => jobId)
      for (const jobId of abandonedJobs) {
        void cancelJob(jobId).catch((reason) => {
          console.warn('Não foi possível limpar a exportação de personagens abandonada:', reason)
        })
      }
    })
  }

  function assertExportOwner(event: IpcMainInvokeEvent, jobId: unknown): asserts jobId is string {
    assertAvailable()
    if (typeof jobId !== 'string' || jobOwners.get(jobId) !== event.sender.id) throw new Error('Esta exportação não pertence a esta janela.')
  }

  const drain = (): Promise<void> => {
    if (drainTask) return drainTask
    shuttingDown = true
    const current = (async () => {
      while (activeTasks.size || jobOwners.size) {
        const cancellations = [...jobOwners.keys()].map((jobId) => ({ jobId, task: cancelJob(jobId) }))
        const tasks = [...new Set([...activeTasks, ...cancellations.map(({ task }) => task)])]
        if (!tasks.length) continue
        const results = await Promise.allSettled(tasks)
        for (const { jobId, task } of cancellations) {
          const index = tasks.indexOf(task)
          const result = results[index]
          if (result?.status === 'rejected' && jobOwners.has(jobId)) throw result.reason
        }
      }
    })()
    drainTask = current
    void current.then(
      () => { if (drainTask === current) drainTask = null },
      () => { shuttingDown = false; if (drainTask === current) drainTask = null }
    )
    return current
  }

  deps.ipcMain.handle('roteiros:assets-export', async (event, request: unknown) => {
    deps.assertTrustedSender(event)
    assertAvailable()
    return track(() => deps.service.exportAssets(request))
  })

  deps.ipcMain.handle('roteiros:export-folder:open', async (event, request: unknown) => {
    deps.assertTrustedSender(event)
    assertAvailable()
    return track(async () => {
      const folder = await deps.service.ensureExportFolder(request)
      const error = await deps.openPath(folder)
      if (error) throw new Error(`Não foi possível abrir a pasta: ${error}`)
    })
  })

  deps.ipcMain.handle('roteiros:characters-export:start', async (event, request: unknown) => {
    deps.assertTrustedSender(event)
    assertAvailable()
    return track(async () => {
      const result = await deps.service.startCharacterExport(request)
      jobOwners.set(result.jobId, event.sender.id)
      watchSender(event)
      if (event.sender.isDestroyed()) {
        await cancelJob(result.jobId)
        throw new Error('A janela foi fechada durante a exportação de personagens.')
      }
      return result
    })
  })

  deps.ipcMain.handle('roteiros:characters-export:asset', async (event, jobId: unknown, asset: unknown) => {
    deps.assertTrustedSender(event)
    assertExportOwner(event, jobId)
    return runJob(jobId, () => deps.service.writeCharacterExportAsset(jobId, asset))
  })

  deps.ipcMain.handle('roteiros:characters-export:finish', async (event, jobId: unknown) => {
    deps.assertTrustedSender(event)
    assertExportOwner(event, jobId)
    return runJob(jobId, async () => {
      const result = await deps.service.finishCharacterExport(jobId)
      jobOwners.delete(jobId)
      return result
    })
  })

  deps.ipcMain.handle('roteiros:characters-export:cancel', async (event, jobId: unknown) => {
    deps.assertTrustedSender(event)
    assertExportOwner(event, jobId)
    return cancelJob(jobId)
  })

  return {
    drain,
    resumeAfterFailedShutdown: () => { shuttingDown = false; drainTask = null }
  }
}

import type { IpcMain, IpcMainInvokeEvent, MessageBoxOptions } from 'electron'
import type { DataBackupService } from '../../dataBackups.cjs'
import type { DataStorageSummary } from '../../../src/shared/dataManagement'

type DataBackupServicePort = Pick<DataBackupService, 'createBackup' | 'listBackups' | 'verifyBackup' | 'stageRestore' | 'deleteBackup'>

export function registerDataBackupHandlers(deps: {
  ipcMain: Pick<IpcMain, 'handle'>
  assertTrustedSender: (event: IpcMainInvokeEvent) => void
  getStorageSummary: () => Promise<DataStorageSummary>
  getService: () => DataBackupServicePort | null
  flushPendingWrites: (event: IpcMainInvokeEvent) => Promise<void>
  runMaintenance: <T>(operation: () => Promise<T>) => Promise<T>
  showConfirmation: (event: IpcMainInvokeEvent, options: MessageBoxOptions) => Promise<{ response: number }>
  relaunch: () => void
  quit: () => void
}) {
  const activeTasks = new Set<Promise<unknown>>()
  const trackTask = <T>(operation: () => Promise<T>): Promise<T> => {
    const task = Promise.resolve().then(operation)
    activeTasks.add(task)
    void task.then(() => activeTasks.delete(task), () => activeTasks.delete(task))
    return task
  }

  deps.ipcMain.handle('app:data-storage-summary', async (event) => {
    deps.assertTrustedSender(event)
    return deps.getStorageSummary()
  })
  deps.ipcMain.handle('app:data-backups:list', async (event) => {
    deps.assertTrustedSender(event)
    const service = deps.getService()
    if (!service) throw new Error('Serviço de backup ainda não inicializado.')
    return service.listBackups()
  })
  deps.ipcMain.handle('app:data-backups:create', async (event) => {
    deps.assertTrustedSender(event)
    const service = deps.getService()
    if (!service) throw new Error('Serviço de backup ainda não inicializado.')
    return trackTask(async () => {
      await deps.flushPendingWrites(event)
      return deps.runMaintenance(() => service.createBackup())
    })
  })
  deps.ipcMain.handle('app:data-backups:verify', async (event, id: string) => {
    deps.assertTrustedSender(event)
    const service = deps.getService()
    if (!service) throw new Error('Serviço de backup ainda não inicializado.')
    return trackTask(() => deps.runMaintenance(() => service.verifyBackup(id)))
  })
  deps.ipcMain.handle('app:data-backups:restore', async (event, id: string) => {
    deps.assertTrustedSender(event)
    const service = deps.getService()
    if (!service) throw new Error('Serviço de backup ainda não inicializado.')
    const options: MessageBoxOptions = {
      type: 'warning', title: 'Restaurar dados',
      message: 'O app será reiniciado usando este backup. Antes disso, criará uma cópia de segurança do estado atual. A restauração só será concluída após o novo app abrir.',
      detail: 'Esse processo substitui as bibliotecas e os projetos atuais pelos dados do backup escolhido.',
      buttons: ['Restaurar e reiniciar', 'Cancelar'], defaultId: 1, cancelId: 1
    }
    const choice = await deps.showConfirmation(event, options)
    if (choice.response !== 0) return { cancelled: true }
    return trackTask(async () => {
      await deps.flushPendingWrites(event)
      return deps.runMaintenance(async () => {
        const safety = await service.createBackup()
        const staged = await service.stageRestore(id)
        deps.relaunch()
        deps.quit()
        return { cancelled: false, safetyBackupId: safety.id, ...staged }
      })
    })
  })
  deps.ipcMain.handle('app:data-backups:delete', async (event, id: string) => {
    deps.assertTrustedSender(event)
    const service = deps.getService()
    if (!service) throw new Error('Serviço de backup ainda não inicializado.')
    const options: MessageBoxOptions = {
      type: 'warning', title: 'Excluir backup', message: 'Excluir este backup permanentemente?',
      detail: 'A exclusão não altera os dados atuais do aplicativo.', buttons: ['Excluir backup', 'Cancelar'], defaultId: 1, cancelId: 1
    }
    const choice = await deps.showConfirmation(event, options)
    if (choice.response !== 0) return { deleted: false }
    return trackTask(async () => {
      await deps.runMaintenance(() => service.deleteBackup(id))
      return { deleted: true }
    })
  })

  return { getActiveTasks: () => [...activeTasks] }
}

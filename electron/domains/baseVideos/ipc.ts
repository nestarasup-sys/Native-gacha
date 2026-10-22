/** Adaptador fino: autenticação da origem permanece obrigatória por chamada. */
import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import { BaseVideoService } from './service.ts'

export function registerBaseVideoHandlers(
  ipc: Pick<IpcMain, 'handle'>,
  assertTrustedSender: (event: IpcMainInvokeEvent) => void,
  service: BaseVideoService
): void {
  ipc.handle('base-videos:list-details', async (event) => {
    assertTrustedSender(event)
    return service.listDetails()
  })
  ipc.handle('base-videos:categories:list', async (event) => {
    assertTrustedSender(event)
    return service.listCategories()
  })
  ipc.handle('base-videos:categories:create', async (event, value: unknown) => {
    assertTrustedSender(event)
    return service.createCategory(value)
  })
  ipc.handle('base-videos:categories:rename', async (event, id: unknown, value: unknown) => {
    assertTrustedSender(event)
    return service.renameCategory(id, value)
  })
  ipc.handle('base-videos:categories:delete', async (event, id: unknown) => {
    assertTrustedSender(event)
    await service.deleteCategory(id)
  })
  ipc.handle('base-videos:save-details', async (event, value: unknown) => {
    assertTrustedSender(event)
    await service.saveDetails(value)
  })
  ipc.handle('base-videos:delete-details', async (event, id: unknown) => {
    assertTrustedSender(event)
    await service.deleteDetails(id)
  })
  ipc.handle('base-videos:delete', async (event, id: unknown) => {
    assertTrustedSender(event)
    await service.deleteVideo(id)
  })
  ipc.handle('base-videos:publish', async (event, id: unknown) => {
    assertTrustedSender(event)
    return service.publishVideo(id)
  })
}

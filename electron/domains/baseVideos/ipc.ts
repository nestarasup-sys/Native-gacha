/** Adaptador fino: autenticação da origem permanece obrigatória por chamada. */
import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import { baseVideosIpcChannels } from '../../../src/shared/baseVideosIpcChannels.ts'
import { BaseVideoService } from './service.ts'

export function registerBaseVideoHandlers(
  ipc: Pick<IpcMain, 'handle'>,
  assertTrustedSender: (event: IpcMainInvokeEvent) => void,
  service: BaseVideoService
): void {
  ipc.handle(baseVideosIpcChannels.listDetails, async (event) => {
    assertTrustedSender(event)
    return service.listDetails()
  })
  ipc.handle(baseVideosIpcChannels.listCategories, async (event) => {
    assertTrustedSender(event)
    return service.listCategories()
  })
  ipc.handle(baseVideosIpcChannels.createCategory, async (event, value: unknown) => {
    assertTrustedSender(event)
    return service.createCategory(value)
  })
  ipc.handle(baseVideosIpcChannels.renameCategory, async (event, id: unknown, value: unknown) => {
    assertTrustedSender(event)
    return service.renameCategory(id, value)
  })
  ipc.handle(baseVideosIpcChannels.deleteCategory, async (event, id: unknown) => {
    assertTrustedSender(event)
    await service.deleteCategory(id)
  })
  ipc.handle(baseVideosIpcChannels.saveDetails, async (event, value: unknown) => {
    assertTrustedSender(event)
    await service.saveDetails(value)
  })
  ipc.handle(baseVideosIpcChannels.deleteDetails, async (event, id: unknown) => {
    assertTrustedSender(event)
    await service.deleteDetails(id)
  })
  ipc.handle(baseVideosIpcChannels.deleteVideo, async (event, id: unknown) => {
    assertTrustedSender(event)
    await service.deleteVideo(id)
  })
  ipc.handle(baseVideosIpcChannels.publish, async (event, id: unknown) => {
    assertTrustedSender(event)
    return service.publishVideo(id)
  })
}

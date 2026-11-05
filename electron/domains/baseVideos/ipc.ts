/** Adaptador fino: autenticação da origem permanece obrigatória por chamada. */
import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import type { writeFile as nativeWriteFile } from 'node:fs/promises'
import { baseVideosIpcChannels } from '../../../src/shared/baseVideosIpcChannels.ts'
import { BaseVideoService } from './service.ts'

type SaveDialogOptions = { title: string; defaultPath: string; filters: Array<{ name: string; extensions: string[] }> }

export function registerBaseVideoHandlers(
  ipc: Pick<IpcMain, 'handle'>,
  assertTrustedSender: (event: IpcMainInvokeEvent) => void,
  service: BaseVideoService,
  exportDependencies: {
    showSaveDialog: (sender: IpcMainInvokeEvent['sender'], options: SaveDialogOptions) => Promise<{ canceled: boolean; filePath?: string | null }>
    writeFile: typeof nativeWriteFile
  }
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
  ipc.handle(baseVideosIpcChannels.exportSimpleData, async (event, content: unknown, purpose: unknown) => {
    assertTrustedSender(event)
    if (typeof content !== 'string' || content.trim().length === 0 || Buffer.byteLength(content, 'utf8') > 25 * 1024 * 1024 || content.includes('\0')) {
      throw new Error('Os dados simples para exportação são inválidos ou excedem 25 MB.')
    }
    if (purpose !== undefined && purpose !== 'simple' && purpose !== 'ai-package') throw new Error('Tipo de exportação inválido.')
    const result = await exportDependencies.showSaveDialog(event.sender, {
      title: purpose === 'ai-package' ? 'Exportar pacote completo para IA' : 'Exportar dados simples dos vídeos',
      defaultPath: purpose === 'ai-package' ? 'pacote-completo-para-ia.txt' : 'dados-simples-dos-videos.txt',
      filters: [{ name: 'Arquivo de texto', extensions: ['txt'] }]
    })
    if (result.canceled || !result.filePath) return false
    const destination = result.filePath.toLowerCase().endsWith('.txt') ? result.filePath : `${result.filePath}.txt`
    await exportDependencies.writeFile(destination, content, 'utf8')
    return true
  })
}

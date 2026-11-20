/** Adaptador fino: autenticação da origem permanece obrigatória por chamada. */
import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import type { writeFile as nativeWriteFile } from 'node:fs/promises'
import { join } from 'node:path'
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
    downloadsPath: () => string
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
    if (purpose !== undefined && purpose !== 'simple' && purpose !== 'ai-package' && purpose !== 'editor-v6-json') throw new Error('Tipo de exportação inválido.')
    const result = await exportDependencies.showSaveDialog(event.sender, {
      title: purpose === 'ai-package' ? 'Exportar Guia para o ROT export' : purpose === 'editor-v6-json' ? 'Exportar JSON V6 original' : 'Exportar dados simples dos vídeos',
      defaultPath: purpose === 'ai-package' ? 'Guia para o ROT export.txt' : purpose === 'editor-v6-json' ? 'roteiro-editor-v6-original.json' : 'Dados simples.txt',
      filters: [purpose === 'editor-v6-json' ? { name: 'JSON', extensions: ['json'] } : { name: 'Arquivo de texto', extensions: ['txt'] }]
    })
    if (result.canceled || !result.filePath) return false
    const extension = purpose === 'editor-v6-json' ? '.json' : '.txt'
    const destination = result.filePath.toLowerCase().endsWith(extension) ? result.filePath : `${result.filePath}${extension}`
    await exportDependencies.writeFile(destination, content, 'utf8')
    return true
  })
  ipc.handle(baseVideosIpcChannels.downloadEditorV6Guide, async (event, content: unknown) => {
    assertTrustedSender(event)
    if (typeof content !== 'string' || content.trim().length === 0 || Buffer.byteLength(content, 'utf8') > 2 * 1024 * 1024 || content.includes('\0')) {
      throw new Error('O guia Markdown é inválido ou excede 2 MB.')
    }
    const directory = exportDependencies.downloadsPath()
    const baseName = 'Guia para chat editor v6'
    for (let index = 1; index <= 100; index += 1) {
      const suffix = index === 1 ? '' : ` (${index})`
      const fileName = `${baseName}${suffix}.md`
      try {
        await exportDependencies.writeFile(join(directory, fileName), content, { encoding: 'utf8', flag: 'wx' })
        return fileName
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      }
    }
    throw new Error('Não foi possível encontrar um nome livre para o guia em Downloads.')
  })
}

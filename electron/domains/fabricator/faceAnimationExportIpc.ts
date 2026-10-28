import { BrowserWindow, dialog } from 'electron'
import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import type { writeFile as nativeWriteFile } from 'node:fs/promises'

export function registerFabricatorFaceAnimationExportHandler(deps: {
  ipcMain: Pick<IpcMain, 'handle'>
  assertTrustedSender: (event: IpcMainInvokeEvent) => void
  isValidModelSlot: (slot: number) => boolean
  writeFile: typeof nativeWriteFile
}): void {
  deps.ipcMain.handle('fabricator:face-animation:export', async (event, modelSlot: number, data: Uint8Array): Promise<boolean> => {
    deps.assertTrustedSender(event)
    if (!deps.isValidModelSlot(modelSlot) || !(data instanceof Uint8Array) || data.byteLength < 4 || data.byteLength > 250 * 1024 * 1024 || data[0] !== 0x1a || data[1] !== 0x45 || data[2] !== 0xdf || data[3] !== 0xa3) {
      throw new Error('Arquivo de animação facial inválido ou maior que 250 MB.')
    }
    const options = {
      title: 'Exportar animação do rosto',
      defaultPath: `animador-rosto-modelo-${String(modelSlot).padStart(2, '0')}.webm`,
      filters: [{ name: 'Vídeo WebM', extensions: ['webm'] }]
    }
    const owner = BrowserWindow.fromWebContents(event.sender)
    const result = owner ? await dialog.showSaveDialog(owner, options) : await dialog.showSaveDialog(options)
    if (result.canceled || !result.filePath) return false
    const destination = result.filePath.toLowerCase().endsWith('.webm') ? result.filePath : `${result.filePath}.webm`
    await deps.writeFile(destination, Buffer.from(data))
    return true
  })
}

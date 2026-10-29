import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import type { writeFile as nativeWriteFile } from 'node:fs/promises'
import { createPendingOperationTracker } from '../storage/pendingOperationTracker.ts'

type FaceAnimationSaveDialogOptions = {
  title: string
  defaultPath: string
  filters: Array<{ name: string; extensions: string[] }>
}

export function registerFabricatorFaceAnimationExportHandler(deps: {
  ipcMain: Pick<IpcMain, 'handle'>
  assertTrustedSender: (event: IpcMainInvokeEvent) => void
  isValidModelSlot: (slot: number) => boolean
  showSaveDialog: (
    sender: IpcMainInvokeEvent['sender'],
    options: FaceAnimationSaveDialogOptions
  ) => Promise<{ canceled: boolean; filePath?: string | null }>
  writeFile: typeof nativeWriteFile
}) {
  const pending = createPendingOperationTracker()

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

    return pending.track(async () => {
      const result = await deps.showSaveDialog(event.sender, options)
      if (result.canceled || !result.filePath) return false
      const destination = result.filePath.toLowerCase().endsWith('.webm') ? result.filePath : `${result.filePath}.webm`
      await deps.writeFile(destination, Buffer.from(data))
      return true
    })
  })

  return { getPendingWrites: pending.getPending }
}

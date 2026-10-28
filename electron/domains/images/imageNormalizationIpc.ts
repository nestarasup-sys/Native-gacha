import type { IpcMain, IpcMainInvokeEvent } from 'electron'

const MAX_IMAGE_BYTES = 50 * 1024 * 1024

type NormalizedImage = {
  bytes: Buffer
  width: number
  height: number
  bitDepth: 8 | 16
  sourceBytes: number
  outputBytes: number
}

export function registerImageNormalizationHandler(deps: {
  ipcMain: Pick<IpcMain, 'handle'>
  assertTrustedSender: (event: IpcMainInvokeEvent) => void
  normalizeImage: (bytes: Buffer) => Promise<NormalizedImage>
}): void {
  deps.ipcMain.handle('app:image:normalize', async (event, input: Uint8Array) => {
    deps.assertTrustedSender(event)
    if (!(input instanceof Uint8Array) || input.byteLength === 0 || input.byteLength > MAX_IMAGE_BYTES) throw new Error('O arquivo de imagem está vazio ou excede 50 MB.')
    const canonical = await deps.normalizeImage(Buffer.from(input.buffer, input.byteOffset, input.byteLength))
    return {
      dataUrl: `data:image/png;base64,${canonical.bytes.toString('base64')}`,
      width: canonical.width,
      height: canonical.height,
      bitDepth: canonical.bitDepth,
      sourceBytes: canonical.sourceBytes,
      outputBytes: canonical.outputBytes
    }
  })
}

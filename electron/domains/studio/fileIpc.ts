import { dialog } from 'electron'
import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import { basename, dirname, join, resolve } from 'node:path'
import type { StudioAsset } from '../../../src/shared/studio'
import { studioIpcChannels } from '../../../src/shared/studioIpcChannels'

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const MAX_IMAGE_BYTES = 50 * 1024 * 1024

type StudioFileIpcDependencies = {
  ipcMain: Pick<IpcMain, 'handle'>
  assertTrustedSender: (event: IpcMainInvokeEvent) => void
  appDataPath: () => string
  tempPath: () => string
  studioPath: (id: string) => string
  dataFileSystem: {
    locate: (path: string) => { domainId: string } | null
    isLegacyDomain: (domainId: string) => boolean
    materializeDirectory: (sourcePath: string, destinationPath: string) => Promise<unknown>
  }
  files: {
    stat: (path: string) => Promise<{ size: number }>
    readFile: (path: string) => Promise<Buffer>
    mkdir: (path: string, options: { recursive: true }) => Promise<unknown>
    writeFile: (path: string, data: Buffer) => Promise<unknown>
    rm: (path: string, options: { recursive: true; force: true }) => Promise<unknown>
  }
  normalizeImage: (bytes: Buffer) => Promise<{ bytes: Buffer }>
  dataUrlBuffer: (dataUrl: string) => Buffer
  createId: () => string
  openPath: (path: string) => Promise<string>
}

export function registerStudioFileHandlers(deps: StudioFileIpcDependencies): void {
  deps.ipcMain.handle(studioIpcChannels.getStudioFolder, (event): string => {
    deps.assertTrustedSender(event)
    return join(deps.appDataPath(), 'projects', 'studio')
  })
  deps.ipcMain.handle(studioIpcChannels.importStudioImage, async (event, category: StudioAsset['category']): Promise<StudioAsset | null> => {
    deps.assertTrustedSender(event)
    if (category !== 'background' && category !== 'object') throw new Error('Categoria de imagem inválida.')
    const result = await dialog.showOpenDialog({
      title: `Studio: ${category === 'background' ? 'adicionar imagem de fundo' : 'adicionar objeto à cena'}`,
      properties: ['openFile'],
      filters: [{ name: 'Imagens', extensions: ['png', 'jpg', 'jpeg', 'webp'] }]
    })
    if (result.canceled || !result.filePaths[0]) return null
    const path = result.filePaths[0]
    if ((await deps.files.stat(path)).size > MAX_IMAGE_BYTES) throw new Error('A imagem excede o limite de 50 MB.')
    const canonical = await deps.normalizeImage(await deps.files.readFile(path))
    return { id: deps.createId(), category, name: basename(path), mimeType: 'image/png', dataUrl: `data:image/png;base64,${canonical.bytes.toString('base64')}` }
  })
  deps.ipcMain.handle(studioIpcChannels.saveStudioPrint, async (event, id: string, dataUrl: string): Promise<string | null> => {
    deps.assertTrustedSender(event)
    if (typeof id !== 'string' || !UUID_V4.test(id)) throw new Error('Identificador de Studio inválido.')
    const bytes = deps.dataUrlBuffer(dataUrl)
    if (bytes.length > MAX_IMAGE_BYTES) throw new Error('O print excede o limite de 50 MB.')
    const printsFolder = join(deps.studioPath(id), 'prints')
    await deps.files.mkdir(printsFolder, { recursive: true })
    const printPath = join(printsFolder, `print-${new Date().toISOString().replace(/[:.]/g, '-')}-${deps.createId().slice(0, 8)}.png`)
    await deps.files.writeFile(printPath, bytes)
    return printPath
  })
  deps.ipcMain.handle(studioIpcChannels.openStudioPrints, async (event, id: string): Promise<void> => {
    deps.assertTrustedSender(event)
    if (typeof id !== 'string' || !UUID_V4.test(id)) throw new Error('Identificador de Studio inválido.')
    const studioFolder = resolve(deps.studioPath(id))
    const printsFolder = resolve(studioFolder, 'prints')
    if (dirname(printsFolder) !== studioFolder) throw new Error('Pasta de prints inválida.')
    let folderToOpen = printsFolder
    const location = deps.dataFileSystem.locate(printsFolder)
    if (location && !deps.dataFileSystem.isLegacyDomain(location.domainId)) {
      folderToOpen = join(deps.tempPath(), 'exports', 'studio', `studio-${id}`, 'prints')
      await deps.files.rm(folderToOpen, { recursive: true, force: true })
      await deps.dataFileSystem.materializeDirectory(printsFolder, folderToOpen)
    } else await deps.files.mkdir(printsFolder, { recursive: true })
    const error = await deps.openPath(folderToOpen)
    if (error) throw new Error(`Não foi possível abrir a pasta de prints: ${error}`)
  })
}

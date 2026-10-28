import { dialog } from 'electron'
import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import { basename, dirname, join, resolve } from 'node:path'
import type { EditorV6Asset } from '../../../src/shared/editorV6'
import { editorV6IpcChannels } from '../../../src/shared/editorV6IpcChannels'

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const MAX_IMAGE_BYTES = 50 * 1024 * 1024

type EditorV6FileIpcDependencies = {
  ipcMain: Pick<IpcMain, 'handle'>
  assertTrustedSender: (event: IpcMainInvokeEvent) => void
  libraryPath: () => string
  projectPath: (id: string) => string
  files: {
    stat: (path: string) => Promise<{ size: number }>
    readFile: (path: string) => Promise<Buffer>
    mkdir: (path: string, options: { recursive: true }) => Promise<unknown>
    writeFile: (path: string, data: Buffer) => Promise<unknown>
  }
  normalizeImage: (bytes: Buffer) => Promise<{ bytes: Buffer }>
  dataUrlBuffer: (dataUrl: string) => Buffer
  createId: () => string
  openPath: (path: string) => Promise<string>
}

export function registerEditorV6FileHandlers(deps: EditorV6FileIpcDependencies): void {
  deps.ipcMain.handle(editorV6IpcChannels.getEditorV6Folder, (event): string => {
    deps.assertTrustedSender(event)
    return deps.libraryPath()
  })
  deps.ipcMain.handle(editorV6IpcChannels.importEditorV6Image, async (event, category: EditorV6Asset['category']): Promise<EditorV6Asset | null> => {
    deps.assertTrustedSender(event)
    if (category !== 'background' && category !== 'object') throw new Error('Categoria de imagem inválida para o Editor V6.')
    const result = await dialog.showOpenDialog({
      title: `Editor V6: ${category === 'background' ? 'adicionar imagem de fundo' : 'adicionar objeto à cena'}`,
      properties: ['openFile'],
      filters: [{ name: 'Imagens', extensions: ['png', 'jpg', 'jpeg', 'webp'] }]
    })
    if (result.canceled || !result.filePaths[0]) return null
    const path = result.filePaths[0]
    if ((await deps.files.stat(path)).size > MAX_IMAGE_BYTES) throw new Error('A imagem excede o limite de 50 MB.')
    const canonical = await deps.normalizeImage(await deps.files.readFile(path))
    return { id: deps.createId(), category, name: basename(path), mimeType: 'image/png', dataUrl: `data:image/png;base64,${canonical.bytes.toString('base64')}` }
  })
  deps.ipcMain.handle(editorV6IpcChannels.saveEditorV6Print, async (event, id: string, dataUrl: string): Promise<string | null> => {
    deps.assertTrustedSender(event)
    if (typeof id !== 'string' || !UUID_V4.test(id)) throw new Error('Identificador de projeto V6 inválido.')
    const bytes = deps.dataUrlBuffer(dataUrl)
    if (bytes.length > MAX_IMAGE_BYTES) throw new Error('O print excede o limite de 50 MB.')
    const printsFolder = join(deps.projectPath(id), 'prints')
    await deps.files.mkdir(printsFolder, { recursive: true })
    const printPath = join(printsFolder, `print-${new Date().toISOString().replace(/[:.]/g, '-')}-${deps.createId().slice(0, 8)}.png`)
    await deps.files.writeFile(printPath, bytes)
    return printPath
  })
  deps.ipcMain.handle(editorV6IpcChannels.openEditorV6Prints, async (event, id: string): Promise<void> => {
    deps.assertTrustedSender(event)
    if (typeof id !== 'string' || !UUID_V4.test(id)) throw new Error('Identificador de projeto V6 inválido.')
    const projectFolder = resolve(deps.projectPath(id))
    const printsFolder = resolve(projectFolder, 'prints')
    if (dirname(printsFolder) !== projectFolder) throw new Error('Pasta de prints do Editor V6 inválida.')
    await deps.files.mkdir(printsFolder, { recursive: true })
    const error = await deps.openPath(printsFolder)
    if (error) throw new Error(`Não foi possível abrir a pasta de prints do Editor V6: ${error}`)
  })
}

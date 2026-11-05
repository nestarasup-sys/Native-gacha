import type { IpcMain, IpcMainInvokeEvent, OpenDialogOptions, OpenDialogReturnValue } from 'electron'
import type { EditorV6LibraryMediaItem } from '../../../src/shared/editorV6'

type Category = 'object' | 'audio'
const categoryValue = (value: unknown): Category => {
  if (value !== 'object' && value !== 'audio') throw Error('Categoria inválida para a biblioteca do Editor V6.')
  return value
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function registerEditorV6MediaLibraryHandlers(deps: {
  ipcMain: Pick<IpcMain, 'handle'>
  assertTrustedSender: (event: IpcMainInvokeEvent) => void
  showOpenDialog: (options: OpenDialogOptions) => Promise<OpenDialogReturnValue>
  library: {
    list: (category: Category) => Promise<EditorV6LibraryMediaItem[]>
    importFile: (category: Category, source: string) => Promise<EditorV6LibraryMediaItem>
    rename: (category: Category, id: string, name: string) => Promise<void>
    delete: (category: Category, id: string) => Promise<void>
  }
  assertUnreferenced: (category: Category, id: string) => Promise<void>
  coordinateReferenceChange: <T>(operation: () => Promise<T>) => Promise<T>
}) {
  deps.ipcMain.handle('editor-v6-library:list', async (event, rawCategory: unknown) => {
    deps.assertTrustedSender(event)
    return deps.library.list(categoryValue(rawCategory))
  })
  deps.ipcMain.handle('editor-v6-library:import', async (event, rawCategory: unknown) => {
    deps.assertTrustedSender(event)
    const category = categoryValue(rawCategory)
    const options: OpenDialogOptions = category === 'object'
      ? { title: 'Biblioteca V6: adicionar objeto', properties: ['openFile'], filters: [{ name: 'Imagens', extensions: ['png', 'jpg', 'jpeg', 'webp'] }] }
      : { title: 'Biblioteca V6: adicionar áudio', properties: ['openFile'], filters: [{ name: 'Áudios', extensions: ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac', 'opus', 'webm'] }] }
    const result = await deps.showOpenDialog(options)
    return result.canceled || !result.filePaths[0] ? null : deps.library.importFile(category, result.filePaths[0])
  })
  deps.ipcMain.handle('editor-v6-library:rename', async (event, rawCategory: unknown, rawId: unknown, rawName: unknown) => {
    deps.assertTrustedSender(event)
    const category = categoryValue(rawCategory)
    if (typeof rawId !== 'string' || !uuid.test(rawId) || typeof rawName !== 'string') throw Error('Dados de renomeação inválidos.')
    return deps.library.rename(category, rawId, rawName)
  })
  deps.ipcMain.handle('editor-v6-library:delete', async (event, rawCategory: unknown, rawId: unknown) => {
    deps.assertTrustedSender(event)
    const category = categoryValue(rawCategory)
    if (typeof rawId !== 'string' || !uuid.test(rawId)) throw Error('Identificador de mídia inválido.')
    return deps.coordinateReferenceChange(async () => {
      await deps.assertUnreferenced(category, rawId)
      await deps.library.delete(category, rawId)
    })
  })
}

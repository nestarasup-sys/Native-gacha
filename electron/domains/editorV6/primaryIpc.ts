/** IPC do EditorV6 Principal, isolado do Video EditorV6 e do boot Electron.
 * Recebe os casos de uso e a fila existentes: nenhum canal/formato é alterado.
 */
import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import type { EditorV6Document, EditorV6ProjectSummary } from '../../../src/shared/editorV6.ts'
import { editorV6IpcChannels } from '../../../src/shared/editorV6IpcChannels.ts'

const EDITOR_V6_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export type EditorV6PrimaryIpcDependencies = {
  ipcMain: Pick<IpcMain, 'handle'>
  assertTrustedSender: (event: IpcMainInvokeEvent) => void
  list: () => Promise<EditorV6ProjectSummary[]>
  read: (id: string) => Promise<EditorV6Document | null>
  write: (document: EditorV6Document) => Promise<void>
  remove: (id: string) => Promise<void>
  getPendingWrites: () => Promise<void>
  setPendingWrites: (pending: Promise<void>) => void
  measure: <T>(label: string, work: () => Promise<T>) => Promise<T>
}

export function registerEditorV6PrimaryHandlers(deps: EditorV6PrimaryIpcDependencies): void {
  const enqueue = (operation: () => Promise<void>): Promise<void> => {
    const next = deps.getPendingWrites().catch(() => undefined).then(operation)
    deps.setPendingWrites(next)
    return next
  }

  deps.ipcMain.handle(editorV6IpcChannels.listEditorV6Projects, async (event): Promise<EditorV6ProjectSummary[]> => {
    deps.assertTrustedSender(event)
    return deps.measure(editorV6IpcChannels.listEditorV6Projects, deps.list)
  })
  deps.ipcMain.handle(editorV6IpcChannels.loadEditorV6Project, async (event, id: string): Promise<EditorV6Document | null> => {
    deps.assertTrustedSender(event)
    if (typeof id !== 'string' || !EDITOR_V6_ID.test(id)) throw new Error('Identificador do Editor V6 inválido.')
    return deps.measure(editorV6IpcChannels.loadEditorV6Project, () => deps.read(id))
  })
  deps.ipcMain.handle(editorV6IpcChannels.saveEditorV6Project, async (event, document: EditorV6Document): Promise<void> => {
    deps.assertTrustedSender(event)
    await deps.measure(editorV6IpcChannels.saveEditorV6Project, () => enqueue(() => deps.write(document)))
  })
  deps.ipcMain.handle(editorV6IpcChannels.deleteEditorV6Project, async (event, id: string): Promise<void> => {
    deps.assertTrustedSender(event)
    if (typeof id !== 'string' || !EDITOR_V6_ID.test(id)) throw new Error('Identificador do Editor V6 inválido.')
    await enqueue(() => deps.remove(id))
  })
}

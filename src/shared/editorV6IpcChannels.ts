import type { EditorV6DesktopApi } from './editorV6'

export const editorV6IpcChannels = {
  listEditorV6Projects: 'editor-v6:projects:list',
  saveEditorV6Project: 'editor-v6:projects:save',
  deleteEditorV6Project: 'editor-v6:projects:delete',
  getEditorV6Folder: 'editor-v6:folder',
  importEditorV6Image: 'editor-v6:import-image',
  saveEditorV6Print: 'editor-v6:save-print',
  openEditorV6Prints: 'editor-v6:open-prints',
  startEditorV6Export: 'editor-v6:export:start',
  getEditorV6ExportStatus: 'editor-v6:export:status',
  cancelEditorV6Export: 'editor-v6:export:cancel',
  revealEditorV6Export: 'editor-v6:export:reveal',
  importEditorV6ExportAudio: 'editor-v6:export:import-audio',
  cloneEditorV6ExportAudio: 'editor-v6:export:clone-audio',
  bakeEditorV6Motion: 'editor-v6:motion:bake',
  cancelEditorV6Motion: 'editor-v6:motion:cancel'
} as const satisfies Record<Exclude<keyof EditorV6DesktopApi, 'flushPendingWrites'>, string>

export type EditorV6IpcMethod = keyof typeof editorV6IpcChannels
export type EditorV6IpcArguments<K extends EditorV6IpcMethod> = Parameters<EditorV6DesktopApi[K]>
export type EditorV6IpcResult<K extends EditorV6IpcMethod> = Awaited<ReturnType<EditorV6DesktopApi[K]>>

export type EditorV6InvokeTransport = { invoke(channel: string, ...args: unknown[]): Promise<unknown> }

export function createEditorV6Invoker(transport: EditorV6InvokeTransport) {
  return function invoke<K extends EditorV6IpcMethod>(method: K, ...args: EditorV6IpcArguments<K>): Promise<EditorV6IpcResult<K>> {
    return transport.invoke(editorV6IpcChannels[method], ...args) as Promise<EditorV6IpcResult<K>>
  }
}

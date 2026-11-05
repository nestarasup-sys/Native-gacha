/** Runtime-safe V7 IPC names shared with the sandboxed Electron preload. */
export const editorV7IpcChannels = {
  startExport: 'editor-v7:export:start',
  getExportStatus: 'editor-v7:export:status',
  cancelExport: 'editor-v7:export:cancel',
  progress: 'editor-v7:export:progress',
  revealExport: 'editor-v7:export:reveal'
} as const

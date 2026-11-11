import type { IpcMain } from 'electron'
import { editorV6WorkerChannels, type EditorV6WorkerPayload } from '../../../src/shared/editorV6Export'

type WorkerEntry = {
  payload: EditorV6WorkerPayload
  resolveReady: () => void
  rejectReady: (error: Error) => void
}

/** Owns the private IPC registrations and readiness state for export workers. */
export function createEditorV6WorkerRegistry(ipcMain: Pick<IpcMain, 'handle' | 'removeHandler'>) {
  const entries = new Map<number, WorkerEntry>()
  const retiredWorkers = new Set<number>()

  function entry(event: Electron.IpcMainInvokeEvent): WorkerEntry {
    const found = entries.get(event.sender.id)
    if (!found || event.senderFrame !== event.sender.mainFrame) throw Error('Renderizador de exportação não autorizado.')
    return found
  }

  ipcMain.handle(editorV6WorkerChannels.payload, event => entry(event).payload)
  ipcMain.handle(editorV6WorkerChannels.ready, (event, error?: string) => {
    if (retiredWorkers.has(event.sender.id) && event.senderFrame === event.sender.mainFrame) return
    const found = entry(event)
    if (error) found.rejectReady(Error(error))
    else found.resolveReady()
  })

  function register(id: number, payload: EditorV6WorkerPayload) {
    let resolveReady!: () => void
    let rejectReady!: (error: Error) => void
    const ready = new Promise<void>((resolve, reject) => { resolveReady = resolve; rejectReady = reject })
    // A worker may close before its creator begins awaiting readiness.
    void ready.catch(() => {})
    entries.set(id, { payload, resolveReady, rejectReady })
    retiredWorkers.delete(id)
    return {
      ready,
      rejectReady,
      retire: () => {
        entries.delete(id)
        retiredWorkers.add(id)
        while (retiredWorkers.size > 128) retiredWorkers.delete(retiredWorkers.values().next().value!)
      }
    }
  }

  function dispose() {
    entries.clear()
    retiredWorkers.clear()
    ipcMain.removeHandler(editorV6WorkerChannels.payload)
    ipcMain.removeHandler(editorV6WorkerChannels.ready)
  }

  return { register, dispose }
}

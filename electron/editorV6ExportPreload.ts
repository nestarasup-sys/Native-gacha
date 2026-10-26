import { contextBridge, ipcRenderer } from 'electron'
import { editorV6WorkerChannels, type EditorV6WorkerBridge } from '../src/shared/editorV6Export'
const bridge: EditorV6WorkerBridge = {
  payload: () => ipcRenderer.invoke(editorV6WorkerChannels.payload),
  ready: (error) => ipcRenderer.invoke(editorV6WorkerChannels.ready, error)
}
contextBridge.exposeInMainWorld('editorV6ExportWorker', bridge)

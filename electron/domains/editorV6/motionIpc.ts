import { BrowserWindow, type IpcMain, type IpcMainInvokeEvent } from 'electron'
import { z } from 'zod'
import { editorV6IpcChannels } from '../../../src/shared/editorV6IpcChannels'
import { editorV6MotionChannels, type EditorV6MotionBakeRequest, type EditorV6MotionBakeResult } from '../../../src/shared/editorV6Motion'
import { editorV6MotionResultSchema, parseEditorV6MotionRequest } from '../../../src/shared/editorV6Schema'
import { isCustomizerCharacter } from '../customizer/validation'
import { waitForExport } from './exportProcess'

export function createEditorV6MotionService(deps: { ipcMain: Pick<IpcMain, 'handle'>; assertTrustedSender: (event: IpcMainInvokeEvent) => void; html: string; preload: string; devUrl?: string }) {
  const workers = new Map<number, { request: EditorV6MotionBakeRequest; resolve: (result: EditorV6MotionBakeResult) => void; reject: (error: Error) => void }>()
  const jobs = new Map<string, { owner: number; controller: AbortController; promise: Promise<EditorV6MotionBakeResult> }>()
  let tail = Promise.resolve()
  const worker = (event: IpcMainInvokeEvent) => { const job = workers.get(event.sender.id); if (!job || event.senderFrame !== event.sender.mainFrame) throw Error('Preparador de animação não autorizado.'); return job }
  deps.ipcMain.handle(editorV6MotionChannels.payload, (event) => worker(event).request)
  deps.ipcMain.handle(editorV6MotionChannels.complete, (event, rawResult, error?: string) => {
    const job = worker(event)
    if (error) { job.reject(Error(String(error).slice(0, 5000))); return }
    try {
      const result = editorV6MotionResultSchema.parse(rawResult)
      if (result.motion.key !== job.request.plan.key || result.motion.frames.map((frame) => frame.offset).join(',') !== job.request.plan.samples.map((sample) => sample.offset).join(',')) throw Error('O preparador retornou uma animação de outra revisão.')
      job.resolve(result)
    } catch (reason) { job.reject(reason instanceof Error ? reason : Error(String(reason))) }
  })
  const render = async (request: EditorV6MotionBakeRequest, signal: AbortSignal) => {
    signal.throwIfAborted()
    const window = new BrowserWindow({ show: false, width: 320, height: 180, webPreferences: { preload: deps.preload, contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false, offscreen: true, devTools: false } })
    const id = window.webContents.id
    let resolve!: (result: EditorV6MotionBakeResult) => void, reject!: (error: Error) => void
    const completion = new Promise<EditorV6MotionBakeResult>((yes, no) => { resolve = yes; reject = no })
    void completion.catch(() => {})
    workers.set(id, { request, resolve, reject })
    const close = () => { workers.delete(id); if (!window.isDestroyed()) window.destroy() }
    signal.addEventListener('abort', close, { once: true })
    window.once('closed', () => reject(Error('O preparador de animação foi encerrado.')))
    try {
      await waitForExport(deps.devUrl ? window.loadURL(deps.devUrl.split('#')[0] + '#/editor-v6-transition-baker') : window.loadFile(deps.html, { hash: '/editor-v6-transition-baker' }), signal, 60000, 'abrir preparação de animações')
      return await waitForExport(completion, signal, 180000, 'preparar animação do personagem')
    } finally { signal.removeEventListener('abort', close); close() }
  }
  deps.ipcMain.handle(editorV6IpcChannels.bakeEditorV6Motion, async (event, rawRequest) => {
    deps.assertTrustedSender(event)
    const request = parseEditorV6MotionRequest(rawRequest), plan = request.plan
    if (!isCustomizerCharacter(request.character) || request.character.id !== plan.characterId || plan.from.characterId !== plan.characterId || plan.to.characterId !== plan.characterId || plan.from.id !== plan.elementId || plan.to.id !== plan.elementId || plan.endFrame <= plan.startFrame || plan.endFrame - plan.startFrame > 7.50001 || plan.samples.some((sample) => Math.abs(sample.progress - (plan.endFrame + sample.offset - plan.startFrame) / (plan.endFrame - plan.startFrame)) > 1e-6)) throw Error('Dados de animação incompatíveis com o personagem.')
    if (jobs.has(request.id)) throw Error('Identificador de preparação repetido.')
    const controller = new AbortController(), abort = () => controller.abort(Error('Preparação de animação cancelada.'))
    event.sender.once('destroyed', abort)
    const promise = tail.catch(() => {}).then(() => render(request, controller.signal))
    tail = promise.then(() => {}, () => {})
    jobs.set(request.id, { owner: event.sender.id, controller, promise })
    try { return await promise }
    finally { jobs.delete(request.id); if (!event.sender.isDestroyed()) event.sender.removeListener('destroyed', abort) }
  })
  deps.ipcMain.handle(editorV6IpcChannels.cancelEditorV6Motion, (event, id) => { deps.assertTrustedSender(event); const job = jobs.get(z.string().uuid().parse(id)); if (job && job.owner === event.sender.id) job.controller.abort(Error('Preparação de animação substituída.')) })
  return { cancelAll: () => { for (const job of jobs.values()) job.controller.abort(Error('Aplicativo encerrado.')) }, drain: () => Promise.allSettled([...jobs.values()].map((job) => job.promise)) }
}

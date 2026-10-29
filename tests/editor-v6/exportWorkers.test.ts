import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { IpcMain } from 'electron'
import type { EditorV6WorkerPayload } from '../../src/shared/editorV6Export'
import { editorV6WorkerChannels } from '../../src/shared/editorV6Export'

const state = vi.hoisted(() => ({ windows: [] as any[] }))
vi.mock('electron', () => ({ BrowserWindow: class extends EventEmitter {
  destroyed = false
  webContents = {
    on: vi.fn(), setWindowOpenHandler: vi.fn(),
    id: state.windows.length + 1, mainFrame: {}, setFrameRate: vi.fn(), setZoomFactor: vi.fn(),
    session: { setPermissionRequestHandler: vi.fn(), webRequest: { onBeforeRequest: vi.fn() } }
  }
  constructor() { super(); state.windows.push(this) }
  removeMenu() {}
  loadFile() { return Promise.resolve() }
  isDestroyed() { return this.destroyed }
  destroy() { this.destroyed = true; this.emit('closed') }
} }))
import { createEditorV6WorkerFactory } from '../../electron/domains/editorV6/exportWorkers'

function fixture() {
  const handlers = new Map<string, (...args: any[]) => any>()
  const ipcMain = { handle: (name: string, handler: (...args: any[]) => any) => handlers.set(name, handler), removeHandler: (name: string) => handlers.delete(name) } as unknown as IpcMain
  const factory = createEditorV6WorkerFactory({ ipcMain, html: 'worker.html', preload: 'preload.cjs' })
  const payload = { project: { media: [] }, width: 320, height: 180, layeredVideo: false } as unknown as EditorV6WorkerPayload
  const ready = () => {
    const window = state.windows.at(-1)!
    handlers.get(editorV6WorkerChannels.ready)!({ sender: window.webContents, senderFrame: window.webContents.mainFrame })
  }
  return { factory, payload, ready, handlers }
}
beforeEach(() => { state.windows = [] })

describe('export worker lifecycle', () => {
  it('cleans external closure and rejects later frame requests', async () => {
    const { factory, payload, ready, handlers } = fixture()
    const controller = new AbortController()
    const remove = vi.spyOn(controller.signal, 'removeEventListener')
    const pending = factory.create(payload, controller.signal)
    ready()
    const worker = await pending
    const window = state.windows[0]
    window.destroy()
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function))
    expect(() => handlers.get(editorV6WorkerChannels.payload)!({ sender: window.webContents, senderFrame: window.webContents.mainFrame })).toThrow('não autorizado')
    expect(() => handlers.get(editorV6WorkerChannels.ready)!({ sender: window.webContents, senderFrame: window.webContents.mainFrame })).not.toThrow()
    expect(() => handlers.get(editorV6WorkerChannels.ready)!({ sender: { id: 999, mainFrame: {} }, senderFrame: {} })).toThrow('não autorizado')
    await expect(worker.frame(0)).rejects.toThrow('encerrado')
    worker.close()
    factory.dispose()
  })

  it('disposes active workers, clears handlers and refuses new work', async () => {
    const { factory, payload, ready, handlers } = fixture()
    const pending = factory.create(payload, new AbortController().signal)
    ready()
    await pending
    factory.dispose()
    expect(state.windows[0].destroyed).toBe(true)
    expect(handlers.size).toBe(0)
    await expect(factory.create(payload, new AbortController().signal)).rejects.toThrow('encerrada')
  })

  it('rejects preparation immediately when closed before ready', async () => {
    const { factory, payload } = fixture()
    const pending = factory.create(payload, new AbortController().signal)
    state.windows[0].destroy()
    await expect(pending).rejects.toThrow('fechada')
    factory.dispose()
  })
})

import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { IpcMain } from 'electron'
import type { EditorV6WorkerPayload } from '../../src/shared/editorV6Export'
import { editorV6WorkerChannels } from '../../src/shared/editorV6Export'

const state = vi.hoisted(() => {
  const imageFor = (width: number, height: number, token: number) => {
    const bitmap = Buffer.alloc(width * height * 4, 127)
    for (let bit = 0; bit < 24; bit++) {
      const markerX = width - 24 + (bit % 6) * 4 + 2, markerY = Math.floor(bit / 6) * 4 + 2
      const offset = (markerY * width + markerX) * 4
      const color = ((token >>> bit) & 1) === 1 ? 255 : 0
      bitmap[offset] = color; bitmap[offset + 1] = color; bitmap[offset + 2] = color; bitmap[offset + 3] = 255
    }
    return {
      getSize: () => ({ width, height }),
      toBitmap: () => bitmap,
      crop: ({ x, y, width: cropWidth, height: cropHeight }: { x: number; y: number; width: number; height: number }) => {
        const cropped = Buffer.alloc(cropWidth * cropHeight * 4)
        for (let row = 0; row < cropHeight; row++) bitmap.copy(cropped, row * cropWidth * 4, ((y + row) * width + x) * 4, ((y + row) * width + x + cropWidth) * 4)
        return { getSize: () => ({ width: cropWidth, height: cropHeight }), toBitmap: () => cropped, resize: vi.fn() }
      },
      resize: vi.fn()
    }
  }
  return { windows: [] as any[], imageFor }
})
vi.mock('electron', () => ({ BrowserWindow: class extends EventEmitter {
  destroyed = false
  paintToken = 0
  webContents: any
  constructor() {
    super()
    const window = this
    this.webContents = Object.assign(new EventEmitter(), {
      setWindowOpenHandler: vi.fn(),
      id: state.windows.length + 1, mainFrame: {}, setFrameRate: vi.fn(), setZoomFactor: vi.fn(),
      invalidate: vi.fn(),
      beginFrameSubscription: vi.fn((_onlyDirty: boolean, callback: (image: any) => void) => { (window.webContents as any).paintFrame = callback }),
      endFrameSubscription: vi.fn(),
      executeJavaScript: vi.fn(async (script: string) => {
        const token = script.match(/,\s*(\d+)\)\s*$/)
        if (token) {
          window.paintToken = Number(token[1])
          ;(window.webContents as any).paintFrame?.(state.imageFor(320 + 24, 180, window.paintToken), { x: 0, y: 0, width: 344, height: 180 })
        }
        return { reused: false, timings: {} }
      }),
      capturePage: vi.fn(async ({ width, height }: { width: number; height: number }) => state.imageFor(width, height, window.paintToken)),
      session: { setPermissionCheckHandler: vi.fn(), setPermissionRequestHandler: vi.fn(), webRequest: { onBeforeRequest: vi.fn() } }
    })
    state.windows.push(this)
  }
  removeMenu() {}
  setContentSize = vi.fn()
  loadFile() { return Promise.resolve() }
  isDestroyed() { return this.destroyed }
  destroy() { this.destroyed = true; this.emit('closed') }
} }))
import { createEditorV6WorkerFactory } from '../../electron/domains/editorV6/exportWorkers'

function fixture(captureMode?: 'capturePage' | 'paint-event') {
  const handlers = new Map<string, (...args: any[]) => any>()
  const ipcMain = { handle: (name: string, handler: (...args: any[]) => any) => handlers.set(name, handler), removeHandler: (name: string) => handlers.delete(name) } as unknown as IpcMain
  const factory = createEditorV6WorkerFactory({ ipcMain, html: 'worker.html', preload: 'preload.cjs', captureMode })
  const payload = { project: { media: [], assets: [] }, width: 320, height: 180, layeredVideo: false } as unknown as EditorV6WorkerPayload
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
    expect(window.setContentSize).toHaveBeenCalledWith(payload.width + 24, payload.height)
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

  it('verifies a unique compositor token in the same capture that is cropped for export', async () => {
    const { factory, payload, ready } = fixture()
    const pending = factory.create(payload, new AbortController().signal)
    ready()
    const worker = await pending
    const window = state.windows[0]
    const contents = state.windows[0].webContents
    const output = Buffer.alloc(payload.width * payload.height * 4, 127)
    let captureCount = 0
    contents.capturePage.mockImplementation(async () => {
      captureCount++
      return state.imageFor(payload.width + 24, payload.height, captureCount === 1 ? 0xffffff : window.paintToken)
    })
    const first = await worker.frame(10)

    expect(contents.setZoomFactor).toHaveBeenCalledWith(1)
    expect(contents.capturePage).toHaveBeenCalledTimes(2)
    expect(contents.invalidate).toHaveBeenCalledTimes(1)
    expect(first.bitmap).toHaveLength(output.length)
    expect(first.metrics).toMatchObject({ captureReadbacks: 2, captureStaleReadbacks: 1 })
    expect(first.bitmap?.subarray(0, 32)).toEqual(output.subarray(0, 32))
    expect(first.bitmap?.some((byte) => byte !== 127)).toBe(false)
    expect(contents.capturePage).toHaveBeenLastCalledWith({ x: 0, y: 0, width: payload.width + 24, height: payload.height })
    worker.close()
    factory.dispose()
  })

  it('routes the 8ms readback mode without relaxing the token fence', async () => {
    const { factory, payload, ready } = fixture()
    const pending = factory.create({ ...payload, testMode: 'captura-8' }, new AbortController().signal)
    ready()
    const worker = await pending
    const contents = state.windows[0].webContents
    const frame = await worker.frame(2)
    expect(frame.metrics).toMatchObject({ captureReadbacks: 1, captureStaleReadbacks: 0 })
    expect(contents.capturePage).toHaveBeenCalledTimes(1)
    worker.close(); factory.dispose()
  })

  it('uses a full-frame paint subscription and keeps the exact-token fence', async () => {
    const { factory, payload, ready } = fixture('paint-event')
    const pending = factory.create(payload, new AbortController().signal)
    ready()
    const worker = await pending
    const contents = state.windows[0].webContents
    const window = state.windows[0]
    contents.executeJavaScript.mockImplementation(async (script: string) => {
      const token = script.match(/,\s*(\d+)\)\s*$/)
      if (token) window.paintToken = Number(token[1])
      contents.paintFrame(state.imageFor(payload.width + 24, payload.height, 0xffffff), { x: 0, y: 0, width: payload.width + 24, height: payload.height })
      return { reused: false, timings: {} }
    })
    contents.invalidate.mockImplementation(() => contents.paintFrame(state.imageFor(payload.width + 24, payload.height, window.paintToken), { x: 0, y: 0, width: payload.width + 24, height: payload.height }))
    const frame = await worker.frame(17)
    expect(contents.beginFrameSubscription).toHaveBeenCalledWith(false, expect.any(Function))
    expect(contents.capturePage).not.toHaveBeenCalled()
    expect(frame.bitmap).toHaveLength(payload.width * payload.height * 4)
    expect(frame.metrics).toMatchObject({ captureReadbacks: 2, captureStaleReadbacks: 1 })
    worker.close()
    expect(contents.endFrameSubscription).toHaveBeenCalledTimes(1)
    factory.dispose()
  })

  it('never returns a stale readback and cancels while waiting for the matching token', async () => {
    const { factory, payload, ready } = fixture()
    const controller = new AbortController()
    const pending = factory.create(payload, controller.signal)
    ready()
    const worker = await pending
    const window = state.windows[0]
    const contents = window.webContents
    contents.capturePage.mockImplementation(async () => state.imageFor(payload.width + 24, payload.height, 0xffffff))

    const frame = worker.frame(12)
    await vi.waitFor(() => expect(contents.invalidate.mock.calls.length).toBeGreaterThan(0))
    controller.abort(Error('cancelamento sintético'))

    await expect(frame).rejects.toThrow('cancelamento sintético')
    expect(contents.capturePage).toHaveBeenCalled()
    expect(contents.listenerCount('paint')).toBe(0)
    expect(window.destroyed).toBe(true)
    worker.close()
    factory.dispose()
  })

  it('rejects preparation immediately when closed before ready', async () => {
    const { factory, payload } = fixture()
    const pending = factory.create(payload, new AbortController().signal)
    state.windows[0].destroy()
    await expect(pending).rejects.toThrow('fechada')
    factory.dispose()
  })
})

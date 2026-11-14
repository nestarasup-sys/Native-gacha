import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { IpcMain } from 'electron'
import type { EditorV6WorkerPayload } from '../../src/shared/editorV6Export'
import { editorV6WorkerChannels } from '../../src/shared/editorV6Export'

const state = vi.hoisted(() => {
  const imageFor = (width: number, height: number, token: number, fill = 127) => {
    const captureHeight = height + 24
    const bitmap = Buffer.alloc(width * captureHeight * 4, fill)
    for (let bit = 0; bit < 24; bit++) {
      const markerX = (bit % 6) * 4 + 2, markerY = height + Math.floor(bit / 6) * 4 + 2
      const offset = (markerY * width + markerX) * 4
      const color = ((token >>> bit) & 1) === 1 ? 255 : 0
      bitmap[offset] = color; bitmap[offset + 1] = color; bitmap[offset + 2] = color; bitmap[offset + 3] = 255
    }
    return {
      getSize: () => ({ width, height: captureHeight }),
      toBitmap: () => bitmap,
      crop: ({ x, y, width: cropWidth, height: cropHeight }: { x: number; y: number; width: number; height: number }) => {
        const cropped = Buffer.alloc(cropWidth * cropHeight * 4)
        for (let row = 0; row < cropHeight; row++) bitmap.copy(cropped, row * cropWidth * 4, ((y + row) * width + x) * 4, ((y + row) * width + x + cropWidth) * 4)
        return { getSize: () => ({ width: cropWidth, height: cropHeight }), toBitmap: () => cropped, resize: vi.fn() }
      },
      resize: vi.fn()
    }
  }
  return { windows: [] as any[], windowOptions: [] as any[], imageFor }
})
vi.mock('electron', () => ({ BrowserWindow: class extends EventEmitter {
  destroyed = false
  paintToken = 0
  webContents: any
  constructor(options: unknown) {
    super()
    const window = this
    state.windowOptions.push(options)
    this.webContents = Object.assign(new EventEmitter(), {
      setWindowOpenHandler: vi.fn(),
      id: state.windows.length + 1, mainFrame: {}, setFrameRate: vi.fn(), setZoomFactor: vi.fn(),
      invalidate: vi.fn(),
      beginFrameSubscription: vi.fn((_onlyDirty: boolean, callback: (image: any) => void) => { (window.webContents as any).paintFrame = callback }),
      endFrameSubscription: vi.fn(),
      executeJavaScript: vi.fn(async (script: string) => {
        const token = script.match(/renderEditorV6ExportFrame\(\d+,\s*(?:'[^']+'|undefined),\s*(\d+)\)/)
        if (token) {
          window.paintToken = Number(token[1])
          ;(window.webContents as any).paintFrame?.(state.imageFor(320, 180, window.paintToken), { x: 0, y: 0, width: 320, height: 204 })
        }
        return { reused: false, timings: {} }
      }),
      capturePage: vi.fn(async ({ width, height }: { width: number; height: number }) => state.imageFor(width, height - 24, window.paintToken)),
      session: { protocol: { handle: vi.fn(), unhandle: vi.fn() }, setPermissionCheckHandler: vi.fn(), setPermissionRequestHandler: vi.fn(), webRequest: { onBeforeRequest: vi.fn() } }
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

function fixture(captureMode?: 'capturePage' | 'paint-event' | 'compare-paint', options: { layeredVideo?: boolean; projectMedia?: boolean; inspectCapture?: (capture: { window: any; frame: number; layer?: 'background' | 'foreground'; bitmap: Buffer }) => Promise<void> } = {}) {
  const handlers = new Map<string, (...args: any[]) => any>()
  const ipcMain = { handle: (name: string, handler: (...args: any[]) => any) => handlers.set(name, handler), removeHandler: (name: string) => handlers.delete(name) } as unknown as IpcMain
  const factory = createEditorV6WorkerFactory({ ipcMain, html: 'worker.html', preload: 'preload.cjs', captureMode, inspectCapture: options.inspectCapture, mediaPath: options.projectMedia ? () => 'project-media.mp4' : undefined })
  const payload = { project: { media: options.projectMedia ? [{ fileName: '00000000-0000-4000-8000-000000000001.mp4' }] : [], assets: [] }, width: 320, height: 180, layeredVideo: options.layeredVideo ?? false } as unknown as EditorV6WorkerPayload
  const ready = () => {
    const window = state.windows.at(-1)!
    handlers.get(editorV6WorkerChannels.ready)!({ sender: window.webContents, senderFrame: window.webContents.mainFrame })
  }
  return { factory, payload, ready, handlers }
}
beforeEach(() => { state.windows = []; state.windowOptions = [] })

describe('export worker lifecycle', () => {
  it('creates an isolated, secured offscreen window and enables project media only for its snapshot', async () => {
    const { factory, payload, ready } = fixture(undefined, { layeredVideo: true, projectMedia: true })
    const pending = factory.create(payload, new AbortController().signal)
    ready()
    const worker = await pending
    const window = state.windows[0]
    const options = state.windowOptions[0] as any

    expect(options).toMatchObject({ show: false, useContentSize: true, width: payload.width, height: payload.height + 24, transparent: true, backgroundColor: '#00000000' })
    expect(options.webPreferences).toMatchObject({ contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false, offscreen: true, devTools: false, preload: 'preload.cjs' })
    expect(options.webPreferences.partition).toMatch(/^editor-v6-export-/)
    expect(window.webContents.session.protocol.handle).toHaveBeenCalledWith('gacha-editor-media', expect.any(Function))
    expect(window.webContents.session.setPermissionCheckHandler).toHaveBeenCalledOnce()
    expect(window.webContents.session.setPermissionRequestHandler).toHaveBeenCalledOnce()
    const resourcePolicy = window.webContents.session.webRequest.onBeforeRequest.mock.calls[0][0]
    resourcePolicy({ url: 'gacha-editor-media://project/id/file.mp4', resourceType: 'media' }, (decision: { cancel: boolean }) => expect(decision.cancel).toBe(false))
    resourcePolicy({ url: 'https://example.com/untrusted.js', resourceType: 'script' }, (decision: { cancel: boolean }) => expect(decision.cancel).toBe(true))
    expect(window.webContents.listenerCount('render-process-gone')).toBe(1)
    worker.close()
    expect(window.webContents.listenerCount('render-process-gone')).toBe(0)
    expect(window.webContents.session.protocol.unhandle).toHaveBeenCalledOnce()
    expect(window.webContents.session.protocol.unhandle).toHaveBeenCalledWith('gacha-editor-media')
    factory.dispose()
  })

  it('serves a worker-local snapshot image through the isolated session protocol', async () => {
    const { factory, ready } = fixture()
    const projectId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    const assetId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
    const token = 'asset-0'
    const url = `gacha-editor-media://snapshot/${projectId}/${token}`
    const payload = {
      project: { id: projectId, media: [], assets: [{ id: assetId, category: 'character', mimeType: 'image/png', dataUrl: url }] },
      width: 320, height: 180, layeredVideo: false
    } as unknown as EditorV6WorkerPayload
    const bytes = Buffer.from('worker-image')
    const assetSources = new Map([[token, { dataUrl: `data:image/png;base64,${bytes.toString('base64')}`, mimeType: 'image/png' }]])
    const pending = factory.create(payload, new AbortController().signal, assetSources)
    ready()
    const worker = await pending
    const window = state.windows[0]
    const handler = window.webContents.session.protocol.handle.mock.calls[0][1]

    const response = await handler(new Request(url))

    expect(response.status).toBe(200)
    expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes)
    worker.close()
    factory.dispose()
  })

  it('preserves renderer exceptions across the Electron frame boundary', async () => {
    const { factory, payload, ready } = fixture()
    const pending = factory.create(payload, new AbortController().signal)
    ready()
    const worker = await pending
    state.windows[0].webContents.executeJavaScript.mockResolvedValue({
      ok: false,
      error: { name: 'InvalidStateError', message: 'O contexto WebGL foi perdido.', stack: 'renderEditorV6ExportFrame at frame 259' }
    })

    await expect(worker.frame(259)).rejects.toThrow('Falha no quadro 259: InvalidStateError: O contexto WebGL foi perdido.')
    worker.close()
    factory.dispose()
  })

  it('routes hair-only snapshots through the isolated session without exposing image bytes over IPC', async () => {
    const { factory, payload, ready, handlers } = fixture()
    const projectId = '11111111-1111-4111-8111-111111111111'
    const snapshotUrl = `gacha-editor-media://snapshot/${projectId}/asset-0`
    const imageBytes = Buffer.from('worker-snapshot')
    const assetSources = new Map([['asset-0', { dataUrl: `data:image/png;base64,${imageBytes.toString('base64')}`, mimeType: 'image/png' }]])
    const workerPayload = {
      ...payload,
      project: { ...payload.project, id: projectId, media: [], assets: [] },
      hairAnimation: { surfaces: [{ id: 'hair-surface', dataUrl: snapshotUrl }], textures: [], rigs: [] }
    } as EditorV6WorkerPayload

    const pending = factory.create(workerPayload, new AbortController().signal, assetSources)
    ready()
    const worker = await pending
    const window = state.windows[0]
    expect(window.webContents.session.protocol.handle).toHaveBeenCalledWith('gacha-editor-media', expect.any(Function))
    const handler = window.webContents.session.protocol.handle.mock.calls[0][1] as (request: Request) => Promise<Response>
    const response = await handler(new Request(snapshotUrl))
    expect(response.status).toBe(200)
    expect(response.headers.get('access-control-allow-origin')).toBe('*')
    expect(Buffer.from(await response.arrayBuffer())).toEqual(imageBytes)
    const ipcPayload = handlers.get(editorV6WorkerChannels.payload)!({
      sender: window.webContents, senderFrame: window.webContents.mainFrame
    })
    expect(ipcPayload).toEqual(workerPayload)
    expect(JSON.stringify(ipcPayload)).not.toContain(imageBytes.toString('base64'))
    expect((await handler(new Request(`gacha-editor-media://snapshot/${projectId}/asset-999`))).status).toBe(404)

    worker.close()
    expect(window.webContents.session.protocol.unhandle).toHaveBeenCalledWith('gacha-editor-media')
    factory.dispose()
  })

  it('releases the session media handler when a worker window closes externally', async () => {
    const { factory, payload, ready } = fixture(undefined, { projectMedia: true })
    const pending = factory.create(payload, new AbortController().signal)
    ready()
    await pending
    const window = state.windows[0]

    window.destroy()

    expect(window.webContents.session.protocol.unhandle).toHaveBeenCalledOnce()
    expect(window.webContents.session.protocol.unhandle).toHaveBeenCalledWith('gacha-editor-media')
    factory.dispose()
  })

  it('cleans external closure and rejects later frame requests', async () => {
    const { factory, payload, ready, handlers } = fixture()
    const controller = new AbortController()
    const remove = vi.spyOn(controller.signal, 'removeEventListener')
    const pending = factory.create(payload, controller.signal)
    ready()
    const worker = await pending
    const window = state.windows[0]
    expect(window.setContentSize).toHaveBeenCalledWith(payload.width, payload.height + 24)
    window.destroy()
    expect(window.webContents.session.protocol.unhandle).not.toHaveBeenCalled()
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
      return state.imageFor(payload.width, payload.height, captureCount === 1 ? 0xffffff : window.paintToken)
    })
    const first = await worker.frame(10)

    expect(contents.setZoomFactor).toHaveBeenCalledWith(1)
    expect(contents.capturePage).toHaveBeenCalledTimes(2)
    expect(contents.invalidate).toHaveBeenCalledTimes(1)
    expect(first.bitmap).toHaveLength(output.length)
    expect(first.metrics).toMatchObject({ captureReadbacks: 2, captureStaleReadbacks: 1 })
    expect(first.bitmap?.subarray(0, 32)).toEqual(output.subarray(0, 32))
    expect(first.bitmap?.some((byte) => byte !== 127)).toBe(false)
    expect(contents.capturePage).toHaveBeenLastCalledWith({ x: 0, y: 0, width: payload.width, height: payload.height + 24 })
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
      const token = script.match(/renderEditorV6ExportFrame\(\d+,\s*(?:'[^']+'|undefined),\s*(\d+)\)/)
      if (token) window.paintToken = Number(token[1])
      contents.paintFrame(state.imageFor(payload.width, payload.height, 0xffffff), { x: 0, y: 0, width: payload.width, height: payload.height + 24 })
      return { reused: false, timings: {} }
    })
    contents.invalidate.mockImplementation(() => contents.paintFrame(state.imageFor(payload.width, payload.height, window.paintToken), { x: 0, y: 0, width: payload.width, height: payload.height + 24 }))
    const frame = await worker.frame(17)
    expect(contents.beginFrameSubscription).toHaveBeenCalledWith(false, expect.any(Function))
    expect(contents.capturePage).not.toHaveBeenCalled()
    expect(frame.bitmap).toHaveLength(payload.width * payload.height * 4)
    expect(frame.metrics).toMatchObject({ captureReadbacks: 2, captureStaleReadbacks: 1 })
    expect(frame.timings?.paintWaitMs).toBeTypeOf('number')
    expect(frame.timings?.capturePageMs).toBe(0)
    worker.close()
    expect(contents.endFrameSubscription).toHaveBeenCalledTimes(1)
    factory.dispose()
  })

  it('compares page and paint captures for both video layers using each layer token', async () => {
    const { factory, payload, ready } = fixture('compare-paint', { layeredVideo: true })
    const pending = factory.create(payload, new AbortController().signal)
    ready()
    const worker = await pending
    const window = state.windows[0]
    const contents = window.webContents
    const paintedTokens: number[] = []
    let layerFill = 0
    contents.executeJavaScript.mockImplementation(async (script: string) => {
      const token = Number(script.match(/renderEditorV6ExportFrame\(\d+,\s*(?:'[^']+'|undefined),\s*(\d+)\)/)?.[1] ?? 0)
      window.paintToken = token
      layerFill = script.includes("'background'") ? 31 : 73
      paintedTokens.push(token)
      contents.paintFrame(state.imageFor(payload.width, payload.height, token, layerFill), { x: 0, y: 0, width: payload.width, height: payload.height + 24 })
      return { reused: false, timings: {} }
    })
    contents.capturePage.mockImplementation(async () => state.imageFor(payload.width, payload.height, window.paintToken, layerFill))

    const frame = await worker.frame(21)
    const layerBytes = payload.width * payload.height * 4

    expect(contents.beginFrameSubscription).toHaveBeenCalledWith(false, expect.any(Function))
    expect(contents.capturePage).toHaveBeenCalledTimes(2)
    expect(paintedTokens).toHaveLength(2)
    expect(frame.bitmap?.subarray(0, layerBytes).every((byte) => byte === 31)).toBe(true)
    expect(frame.bitmap?.subarray(layerBytes).every((byte) => byte === 73)).toBe(true)
    expect(frame.metrics).toMatchObject({ captureReadbacks: 2, captureStaleReadbacks: 0 })
    worker.close()
    expect(contents.endFrameSubscription).toHaveBeenCalledOnce()
    factory.dispose()
  })

  it('identifies which layered capture diverged from the same-token paint frame', async () => {
    const { factory, payload, ready } = fixture('compare-paint', { layeredVideo: true })
    const pending = factory.create(payload, new AbortController().signal)
    ready()
    const worker = await pending
    const window = state.windows[0]
    const contents = window.webContents
    let layerFill = 0
    contents.executeJavaScript.mockImplementation(async (script: string) => {
      const token = Number(script.match(/renderEditorV6ExportFrame\(\d+,\s*(?:'[^']+'|undefined),\s*(\d+)\)/)?.[1] ?? 0)
      window.paintToken = token
      layerFill = script.includes("'background'") ? 31 : 73
      contents.paintFrame(state.imageFor(payload.width, payload.height, token, layerFill), { x: 0, y: 0, width: payload.width, height: payload.height + 24 })
      return { reused: false, timings: {} }
    })
    contents.capturePage.mockImplementation(async () => state.imageFor(payload.width, payload.height, window.paintToken, layerFill === 73 ? 74 : layerFill))

    await expect(worker.frame(22)).rejects.toThrow('camada foreground do quadro 22')

    worker.close()
    expect(contents.endFrameSubscription).toHaveBeenCalledOnce()
    factory.dispose()
  })

  it('compares page and paint captures from the same worker frame and token', async () => {
    const { factory, payload, ready } = fixture('compare-paint')
    const pending = factory.create(payload, new AbortController().signal)
    ready()
    const worker = await pending
    const window = state.windows[0]
    const contents = window.webContents
    contents.executeJavaScript.mockImplementation(async (script: string) => {
      const token = Number(script.match(/renderEditorV6ExportFrame\(\d+,\s*(?:'[^']+'|undefined),\s*(\d+)\)/)?.[1] ?? 0)
      window.paintToken = token
      contents.paintFrame(state.imageFor(payload.width, payload.height, token, 39), { x: 0, y: 0, width: payload.width, height: payload.height + 24 })
      return { reused: false, timings: {} }
    })
    contents.capturePage.mockImplementation(async () => state.imageFor(payload.width, payload.height, window.paintToken, 39))

    const frame = await worker.frame(21)

    expect(contents.beginFrameSubscription).toHaveBeenCalledWith(false, expect.any(Function))
    expect(contents.capturePage).toHaveBeenCalledOnce()
    expect(frame.bitmap?.every((byte) => byte === 39)).toBe(true)
    expect(frame.metrics).toMatchObject({ captureReadbacks: 1, captureStaleReadbacks: 0 })
    worker.close()
    expect(contents.endFrameSubscription).toHaveBeenCalledOnce()
    factory.dispose()
  })

  it('re-invalidates paint frames when a stale token arrives before the requested frame', async () => {
    const { factory, payload, ready } = fixture('paint-event')
    const pending = factory.create(payload, new AbortController().signal)
    ready()
    const worker = await pending
    const window = state.windows[0]
    const contents = window.webContents
    contents.executeJavaScript.mockImplementation(async (script: string) => {
      const token = Number(script.match(/renderEditorV6ExportFrame\(\d+,\s*(?:'[^']+'|undefined),\s*(\d+)\)/)?.[1] ?? 0)
      window.paintToken = token
      contents.paintFrame(state.imageFor(payload.width, payload.height, token - 1), { x: 0, y: 0, width: payload.width, height: payload.height + 24 })
      return { reused: false, timings: {} }
    })
    let invalidations = 0
    contents.invalidate.mockImplementation(() => {
      invalidations++
      const token = invalidations === 1 ? window.paintToken - 1 : window.paintToken
      contents.paintFrame(state.imageFor(payload.width, payload.height, token), { x: 0, y: 0, width: payload.width, height: payload.height + 24 })
    })

    const frame = await worker.frame(19)

    expect(invalidations).toBe(2)
    expect(frame.metrics).toMatchObject({ captureReadbacks: 3, captureStaleReadbacks: 2 })
    expect(frame.bitmap).toHaveLength(payload.width * payload.height * 4)
    worker.close()
    factory.dispose()
  })

  it('rejects a pending paint capture when requesting another paint throws', async () => {
    const { factory, payload, ready } = fixture('paint-event')
    const pending = factory.create(payload, new AbortController().signal)
    ready()
    const worker = await pending
    const window = state.windows[0]
    const contents = window.webContents
    contents.executeJavaScript.mockImplementation(async (script: string) => {
      const token = Number(script.match(/renderEditorV6ExportFrame\(\d+,\s*(?:'[^']+'|undefined),\s*(\d+)\)/)?.[1] ?? 0)
      window.paintToken = token
      contents.paintFrame(state.imageFor(payload.width, payload.height, token - 1), { x: 0, y: 0, width: payload.width, height: payload.height + 24 })
      return { reused: false, timings: {} }
    })
    let invalidations = 0
    contents.invalidate.mockImplementation(() => {
      invalidations++
      if (invalidations === 2) throw Error('Falha sintética ao solicitar paint.')
      contents.paintFrame(state.imageFor(payload.width, payload.height, window.paintToken - 1), { x: 0, y: 0, width: payload.width, height: payload.height + 24 })
    })

    await expect(worker.frame(20)).rejects.toThrow('Falha sintética ao solicitar paint.')

    expect(invalidations).toBe(2)
    worker.close()
    factory.dispose()
  })

  it('captures both video layers in a single offscreen paint without copying BGRA rows', async () => {
    const inspected: Array<{ layer?: string; bitmap: Buffer }> = []
    const { factory, payload, ready } = fixture(undefined, {
      layeredVideo: true,
      inspectCapture: async ({ layer, bitmap }) => { inspected.push({ layer, bitmap: Buffer.from(bitmap) }) }
    })
    const input = { ...payload, singlePassLayers: true }
    const pending = factory.create(input, new AbortController().signal)
    ready()
    const worker = await pending
    const window = state.windows[0]
    const contents = window.webContents
    const bytes = input.width * input.height * 4
    contents.capturePage.mockImplementation(async ({ width, height }: { width: number; height: number }) => {
      const image = state.imageFor(width, height - 24, window.paintToken, 0)
      const bitmap = image.toBitmap()
      bitmap.fill(21, 0, bytes)
      bitmap.fill(77, bytes, bytes * 2)
      return image
    })

    const result = await worker.frame(41)

    expect(state.windowOptions[0]).toMatchObject({ width: input.width, height: input.height * 2 + 24, transparent: true })
    expect(window.setContentSize).toHaveBeenCalledWith(input.width, input.height * 2 + 24)
    expect(contents.executeJavaScript).toHaveBeenCalledOnce()
    expect(contents.executeJavaScript.mock.calls[0][0]).toContain("'stacked'")
    expect(contents.capturePage).toHaveBeenCalledOnce()
    expect(contents.capturePage).toHaveBeenCalledWith({ x: 0, y: 0, width: input.width, height: input.height * 2 + 24 })
    expect(result.bitmap).toHaveLength(bytes * 2)
    expect(result.bitmap!.subarray(0, bytes).every(value => value === 21)).toBe(true)
    expect(result.bitmap!.subarray(bytes).every(value => value === 77)).toBe(true)
    expect(inspected.map(item => item.layer)).toEqual(['background', 'foreground'])
    expect(inspected[0].bitmap.every(value => value === 21)).toBe(true)
    expect(inspected[1].bitmap.every(value => value === 77)).toBe(true)
    expect(result.metrics).toMatchObject({ captureReadbacks: 1, captureStaleReadbacks: 0 })
    worker.close()
    factory.dispose()
  })

  it('rejects a stale combined-layer readback and returns only the exact frame token', async () => {
    const { factory, payload, ready } = fixture(undefined, { layeredVideo: true })
    const input = { ...payload, singlePassLayers: true }
    const pending = factory.create(input, new AbortController().signal)
    ready()
    const worker = await pending
    const window = state.windows[0]
    const contents = window.webContents
    let readbacks = 0
    contents.capturePage.mockImplementation(async ({ width, height }: { width: number; height: number }) => {
      readbacks++
      return state.imageFor(width, height - 24, readbacks === 1 ? 0xffffff : window.paintToken, 33)
    })
    const result = await worker.frame(5)
    expect(contents.executeJavaScript).toHaveBeenCalledOnce()
    expect(contents.capturePage).toHaveBeenCalledTimes(2)
    expect(contents.invalidate).toHaveBeenCalledOnce()
    expect(result.bitmap).toHaveLength(input.width * input.height * 8)
    expect(result.metrics).toMatchObject({ captureReadbacks: 2, captureStaleReadbacks: 1 })
    worker.close()
    factory.dispose()
  })

  it('compares full stacked pixels from paint-event against capturePage using one token', async () => {
    const { factory, payload, ready } = fixture('compare-paint', { layeredVideo: true })
    const input = { ...payload, singlePassLayers: true }
    const pending = factory.create(input, new AbortController().signal)
    ready()
    const worker = await pending
    const window = state.windows[0]
    const contents = window.webContents
    contents.executeJavaScript.mockImplementation(async (script: string) => {
      const token = Number(script.match(/renderEditorV6ExportFrame\(\d+,\s*'stacked',\s*(\d+)\)/)?.[1] ?? 0)
      window.paintToken = token
      contents.paintFrame(state.imageFor(input.width, input.height * 2, token, 46), { x: 0, y: 0, width: input.width, height: input.height * 2 + 24 })
      return { reused: false, timings: {} }
    })
    contents.capturePage.mockImplementation(async () => state.imageFor(input.width, input.height * 2, window.paintToken, 46))
    const result = await worker.frame(77)
    expect(result.bitmap).toHaveLength(input.width * input.height * 8)
    expect(result.bitmap!.every(byte => byte === 46)).toBe(true)
    expect(contents.executeJavaScript).toHaveBeenCalledOnce()
    expect(contents.capturePage).toHaveBeenCalledOnce()
    expect(result.metrics).toMatchObject({ captureReadbacks: 1, captureStaleReadbacks: 0 })
    worker.close()
    factory.dispose()
  })

  it('assembles layered frames into one reusable bitmap and aggregates both layer metrics', async () => {
    const inspected: Buffer[] = []
    const { factory, payload, ready } = fixture(undefined, { layeredVideo: true, inspectCapture: async ({ bitmap }) => { inspected.push(Buffer.from(bitmap)) } })
    const pending = factory.create(payload, new AbortController().signal)
    ready()
    const worker = await pending
    const window = state.windows[0]
    const contents = window.webContents
    let drawCount = 0
    contents.executeJavaScript.mockImplementation(async (script: string) => {
      const token = script.match(/renderEditorV6ExportFrame\(\d+,\s*(?:'[^']+'|undefined),\s*(\d+)\)/)
      if (token) window.paintToken = Number(token[1])
      drawCount++
      return { reused: false, timings: { sceneResolutionMs: drawCount }, metrics: { captureReadbacks: drawCount } }
    })
    let captureCount = 0
    contents.capturePage.mockImplementation(async ({ width, height }: { width: number; height: number }) => {
      captureCount++
      return state.imageFor(width, height - 24, window.paintToken, captureCount === 1 ? 31 : 73)
    })

    const result = await worker.frame(12)
    const layerBytes = payload.width * payload.height * 4

    expect(contents.executeJavaScript.mock.calls.map(([script]: [string]) => script)).toEqual([
      expect.stringContaining("'background'"), expect.stringContaining("'foreground'")
    ])
    expect(result.bitmap).toHaveLength(layerBytes * 2)
    expect(result.bitmap!.subarray(0, layerBytes).every((byte) => byte === 31)).toBe(true)
    expect(result.bitmap!.subarray(layerBytes).every((byte) => byte === 73)).toBe(true)
    expect(inspected).toHaveLength(2)
    expect(inspected[0].every((byte) => byte === 31)).toBe(true)
    expect(inspected[1].every((byte) => byte === 73)).toBe(true)
    expect(result.timings?.sceneResolutionMs).toBe(3)
    expect(result.metrics).toMatchObject({ captureReadbacks: 5, captureStaleReadbacks: 0 })
    worker.close()
    factory.dispose()
  })

  it('alternates layered BGRA buffers without overwriting in-flight frames or losing reused layers', async () => {
    const { factory, payload, ready } = fixture(undefined, { layeredVideo: true })
    const pending = factory.create(payload, new AbortController().signal)
    ready()
    const worker = await pending
    const window = state.windows[0]
    const contents = window.webContents
    let lastFrame = 0, lastLayer = ''
    contents.executeJavaScript.mockImplementation(async (script: string) => {
      const request = script.match(/renderEditorV6ExportFrame\((\d+),\s*'([^']+)',\s*(\d+)\)/)
      if (!request) throw Error('Requisição de quadro inválida.')
      lastFrame = Number(request[1])
      lastLayer = request[2]
      window.paintToken = Number(request[3])
      return { reused: false, layerReused: (lastFrame === 2 && lastLayer === 'background')
        || (lastFrame === 3 && lastLayer === 'foreground'), timings: {} }
    })
    contents.capturePage.mockImplementation(async ({ width, height }: { width: number; height: number }) => {
      const fill = lastFrame === 1 ? (lastLayer === 'background' ? 20 : 40)
        : lastFrame === 2 ? 90 : 33
      return state.imageFor(width, height - 24, window.paintToken, fill)
    })
    const bytes = payload.width * payload.height * 4
    const first = await worker.frame(1)
    const savedFirst = Buffer.from(first.bitmap!)
    const second = await worker.frame(2)

    expect(second.bitmap).not.toBe(first.bitmap)
    expect(first.bitmap).toEqual(savedFirst)
    expect(second.bitmap!.subarray(0, bytes).every(value => value === 20)).toBe(true)
    expect(second.bitmap!.subarray(bytes).every(value => value === 90)).toBe(true)
    expect(contents.capturePage).toHaveBeenCalledTimes(3)

    // The caller has acknowledged the first pipe write before requesting the
    // third frame; its original slot can now be recycled safely.
    const third = await worker.frame(3)
    expect(third.bitmap).toBe(first.bitmap)
    expect(third.bitmap).not.toBe(second.bitmap)
    expect(third.bitmap!.subarray(0, bytes).every(value => value === 33)).toBe(true)
    expect(third.bitmap!.subarray(bytes).every(value => value === 90)).toBe(true)
    expect(contents.capturePage).toHaveBeenCalledTimes(4)
    worker.close()
    factory.dispose()
  })

  it('keeps the old single layered bitmap for the explicit serial A/B mode', async () => {
    vi.stubEnv('GACHA_EDITOR_V6_FRAME_OVERLAP', '0')
    const { factory, payload, ready } = fixture(undefined, { layeredVideo: true })
    const pending = factory.create(payload, new AbortController().signal)
    ready()
    const worker = await pending
    const first = await worker.frame(1)
    const second = await worker.frame(2)
    expect(first.bitmap).toBe(second.bitmap)
    worker.close()
    factory.dispose()
    vi.unstubAllEnvs()
  })

  it('rejects a paint-token capture and ends the subscription when its worker closes', async () => {
    const { factory, payload, ready } = fixture('paint-event')
    const pending = factory.create(payload, new AbortController().signal)
    ready()
    const worker = await pending
    const window = state.windows[0]
    const contents = window.webContents
    contents.executeJavaScript.mockImplementation(async (script: string) => {
      const token = script.match(/renderEditorV6ExportFrame\(\d+,\s*(?:'[^']+'|undefined),\s*(\d+)\)/)
      if (token) window.paintToken = Number(token[1])
      contents.paintFrame(state.imageFor(payload.width, payload.height, 0xffffff), { x: 0, y: 0, width: payload.width, height: payload.height + 24 })
      return { reused: false, timings: {} }
    })

    const frame = worker.frame(18)
    await vi.waitFor(() => expect(contents.invalidate).toHaveBeenCalled())
    worker.close()

    await expect(frame).rejects.toThrow('A captura paint foi encerrada.')
    expect(contents.endFrameSubscription).toHaveBeenCalledOnce()
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
    contents.capturePage.mockImplementation(async () => state.imageFor(payload.width, payload.height, 0xffffff))

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

  it('reports a crashed export renderer immediately instead of waiting for the startup timeout', async () => {
    const { factory, payload } = fixture()
    const pending = factory.create(payload, new AbortController().signal)
    const window = state.windows[0]
    window.webContents.emit('render-process-gone', {}, { reason: 'crashed', exitCode: -36861 })

    await expect(pending).rejects.toThrow('O renderizador da exportação caiu (crashed; código -36861).')
    expect(window.destroyed).toBe(true)
    factory.dispose()
  })

  it('rejects an in-flight frame immediately when its renderer crashes', async () => {
    const { factory, payload, ready } = fixture()
    const pending = factory.create(payload, new AbortController().signal)
    ready()
    const worker = await pending
    const window = state.windows[0]
    window.webContents.executeJavaScript.mockImplementation(() => new Promise(() => {}))

    const frame = worker.frame(20)
    window.webContents.emit('render-process-gone', {}, { reason: 'crashed', exitCode: -36861 })

    await expect(frame).rejects.toThrow('O renderizador da exportação caiu (crashed; código -36861).')
    expect(window.destroyed).toBe(true)
    factory.dispose()
  })
})

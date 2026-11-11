import type { BrowserWindow } from 'electron'
import { waitForExport } from './exportProcess'
import { captureEditorV6FrameBitmap } from './exportCaptureBitmap'

export const EDITOR_V6_PAINT_TOKEN_SIZE = 24
const FRAME_CAPTURE_TIMEOUT_MS = 60000
const FRAME_CAPTURE_RETRY_MS = 16

export type EditorV6PaintCaptureResult = {
  bitmap: Buffer
  readbacks: number
  paintWaitMs: number
  capturePageMs: number
  captureBitmapMs: number
}

export type EditorV6PaintFrameCapture = {
  capture: (token: number, output: Buffer, outputOffset?: number) => Promise<EditorV6PaintCaptureResult>
  close: () => void
}

/** Retain only the latest full frame of this export and return it only after its paint token matches. */
export function createEditorV6PaintFrameCapture(window: BrowserWindow, width: number, height: number, signal: AbortSignal): EditorV6PaintFrameCapture {
  let latestImage: Electron.NativeImage | null = null
  let pending: { token: number; output: Buffer; outputOffset: number; readbacks: number; bitmapMs: number; paintWaitStarted: number; resolve: (value: EditorV6PaintCaptureResult) => void; reject: (error: Error) => void } | null = null
  let closed = false
  const onFrame = (image: Electron.NativeImage) => {
    latestImage = image
    const request = pending
    if (!request || closed) return
    request.readbacks++
    const paintWaitMs = performance.now() - request.paintWaitStarted
    try {
      const started = performance.now()
      const bitmap = captureEditorV6FrameBitmap(image, width, height, request.token, request.output, request.outputOffset)
      request.bitmapMs += performance.now() - started
      if (bitmap) {
        pending = null
        request.resolve({ bitmap, readbacks: request.readbacks, paintWaitMs, capturePageMs: 0, captureBitmapMs: request.bitmapMs })
      } else if (request.readbacks === 1) window.webContents.invalidate()
    } catch (error) {
      pending = null
      request.reject(error instanceof Error ? error : Error(String(error)))
    }
  }
  window.webContents.beginFrameSubscription(false, onFrame)
  return {
    capture: async (token, output, outputOffset = 0) => {
      let readbacks = 0, bitmapMs = 0
      const tryImage = (image: Electron.NativeImage) => {
        readbacks++
        const bitmapStarted = performance.now()
        const bitmap = captureEditorV6FrameBitmap(image, width, height, token, output, outputOffset)
        bitmapMs += performance.now() - bitmapStarted
        return bitmap ? { bitmap, readbacks, paintWaitMs: 0, capturePageMs: 0, captureBitmapMs: bitmapMs } : null
      }
      if (latestImage) {
        const captured = tryImage(latestImage)
        if (captured) return captured
      }
      const waiting = new Promise<EditorV6PaintCaptureResult>((resolve, reject) => {
        if (pending) return reject(Error('O worker já aguarda outro quadro paint.'))
        pending = { token, output, outputOffset, readbacks, bitmapMs, paintWaitStarted: performance.now(), resolve, reject }
        window.webContents.invalidate()
      })
      try { return await waitForExport(waiting, signal, FRAME_CAPTURE_TIMEOUT_MS, 'aguardar quadro paint com token') }
      finally { if (pending?.token === token) pending = null }
    },
    close: () => {
      if (closed) return
      closed = true
      if (pending) { pending.reject(Error('A captura paint foi encerrada.')); pending = null }
      latestImage = null
      if (!window.isDestroyed()) window.webContents.endFrameSubscription()
    }
  }
}

/** Captures the exact frame whose embedded paint token matches the requested export frame. */
export async function captureEditorV6PaintedFrame({
  window, signal, width, height, token, output, outputOffset = 0,
  retryMilliseconds = FRAME_CAPTURE_RETRY_MS, paintCapture
}: {
  window: BrowserWindow
  signal: AbortSignal
  width: number
  height: number
  token: number
  output: Buffer
  outputOffset?: number
  retryMilliseconds?: number
  paintCapture?: EditorV6PaintFrameCapture
}): Promise<EditorV6PaintCaptureResult> {
  if (paintCapture) return paintCapture.capture(token, output, outputOffset)
  const deadline = Date.now() + FRAME_CAPTURE_TIMEOUT_MS
  let readbacks = 0
  let capturePageMs = 0, captureBitmapMs = 0
  while (Date.now() < deadline) {
    signal.throwIfAborted()
    readbacks++
    const capturePageStarted = performance.now()
    const image = await waitForExport(window.webContents.capturePage({ x: 0, y: 0, width: width + EDITOR_V6_PAINT_TOKEN_SIZE, height }), signal, FRAME_CAPTURE_TIMEOUT_MS, 'capturar quadro')
    capturePageMs += performance.now() - capturePageStarted
    const captureBitmapStarted = performance.now()
    const bitmap = captureEditorV6FrameBitmap(image, width, height, token, output, outputOffset)
    captureBitmapMs += performance.now() - captureBitmapStarted
    if (bitmap) return { bitmap, readbacks, paintWaitMs: 0, capturePageMs, captureBitmapMs }
    // Invalidate only after observing a stale readback. Each retry verifies the marker in the exact bitmap sent to export.
    window.webContents.invalidate()
    await waitForExport(new Promise<void>((resolve) => setTimeout(resolve, retryMilliseconds)), signal, FRAME_CAPTURE_TIMEOUT_MS, 'sincronizar quadro')
  }
  throw Error('Tempo limite: o compositor não apresentou o quadro solicitado para exportação.')
}

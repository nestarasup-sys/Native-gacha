import type { BrowserWindow } from 'electron'
import type { EditorV6FrameMetrics, EditorV6FrameTimings, EditorV6RenderFrameResult, EditorV6WorkerPayload } from '../../../src/shared/editorV6Export'
import { waitForExport } from './exportProcess'
import { captureEditorV6PaintedFrame, type EditorV6PaintFrameCapture } from './exportFrameCapture'

export type EditorV6WorkerFrameRenderer = {
  frame: (frame: number) => Promise<EditorV6RenderFrameResult & { bitmap?: Buffer }>
  close: () => void
}

/** Owns frame requests, paint-token capture, and layered bitmap assembly for one worker window. */
export function createEditorV6WorkerFrameRenderer({
  window, payload, signal, captureRetryMilliseconds, paintCapture, inspectCapture
}: {
  window: BrowserWindow
  payload: EditorV6WorkerPayload
  signal: AbortSignal
  captureRetryMilliseconds: number
  paintCapture?: EditorV6PaintFrameCapture
  inspectCapture?: (capture: { window: BrowserWindow; frame: number; bitmap: Buffer }) => Promise<void>
}): EditorV6WorkerFrameRenderer {
  const { width, height, layeredVideo } = payload
  const layerBytes = width * height * 4
  let frameBitmap: Buffer | undefined
  let layeredBitmap: Buffer | undefined
  let nextPaintToken = 0
  let closed = false

  const draw = async (frame: number, layer?: 'background' | 'foreground') => {
    const started = performance.now()
    nextPaintToken = nextPaintToken % 0xfffffe + 1
    const token = nextPaintToken
    const layerArgument = layer ? `'${layer}'` : 'undefined'
    const result = await waitForExport(window.webContents.executeJavaScript(`window.renderEditorV6ExportFrame(${Math.round(frame)}, ${layerArgument}, ${token})`) as Promise<EditorV6RenderFrameResult>, signal, 60000, 'desenhar quadro')
    return { ...result, timings: { ...result.timings, ipcDrawMs: performance.now() - started } }
  }

  const capture = async (frame: number, outputOffset = 0) => {
    const started = performance.now()
    const token = nextPaintToken
    const output = layeredVideo
      ? (layeredBitmap ??= Buffer.allocUnsafe(layerBytes * 2))
      : (frameBitmap ??= Buffer.allocUnsafe(layerBytes))
    const captured = await captureEditorV6PaintedFrame({ window, signal, width, height, token, output, outputOffset, retryMilliseconds: captureRetryMilliseconds, paintCapture })
    const { bitmap, readbacks, paintWaitMs, capturePageMs, captureBitmapMs } = captured
    await inspectCapture?.({ window, frame, bitmap: layeredVideo ? bitmap.subarray(outputOffset, outputOffset + layerBytes) : bitmap })
    return { bitmap, readbacks, elapsedMs: performance.now() - started, paintWaitMs, capturePageMs, captureBitmapMs }
  }

  const frame = async (frameNumber: number): Promise<EditorV6RenderFrameResult & { bitmap?: Buffer }> => {
    signal.throwIfAborted()
    if (closed) throw Error('O renderizador de exportação foi encerrado.')
    const result = await draw(frameNumber, layeredVideo ? 'background' : undefined)
    if (result.reused) return result
    if (!layeredVideo) {
      const captured = await capture(frameNumber)
      return { reused: false, bitmap: captured.bitmap, timings: { ...result.timings, captureMs: captured.elapsedMs, paintWaitMs: captured.paintWaitMs, capturePageMs: captured.capturePageMs, captureBitmapMs: captured.captureBitmapMs }, metrics: {
        ...result.metrics, captureReadbacks: captured.readbacks, captureStaleReadbacks: captured.readbacks - 1
      } }
    }

    const timings: EditorV6FrameTimings = { ...result.timings }
    const metrics: EditorV6FrameMetrics = { ...result.metrics }
    const collect = (drawn: EditorV6RenderFrameResult) => {
      for (const [key, value] of Object.entries(drawn.timings ?? {}) as Array<[keyof EditorV6FrameTimings, number]>) timings[key] = (timings[key] ?? 0) + value
      for (const [key, value] of Object.entries(drawn.metrics ?? {}) as Array<[keyof EditorV6FrameMetrics, number]>) metrics[key] = (metrics[key] ?? 0) + value
    }
    const copyLayer = async (offset: number, layer: 'background' | 'foreground', drawn: EditorV6RenderFrameResult) => {
      if (drawn.layerReused) return
      const captured = await capture(frameNumber, offset)
      timings.captureMs = (timings.captureMs ?? 0) + captured.elapsedMs
      timings.paintWaitMs = (timings.paintWaitMs ?? 0) + captured.paintWaitMs
      timings.capturePageMs = (timings.capturePageMs ?? 0) + captured.capturePageMs
      timings.captureBitmapMs = (timings.captureBitmapMs ?? 0) + captured.captureBitmapMs
      metrics.captureReadbacks = (metrics.captureReadbacks ?? 0) + captured.readbacks
      metrics.captureStaleReadbacks = (metrics.captureStaleReadbacks ?? 0) + captured.readbacks - 1
      const timingKey = layer === 'background' ? 'backgroundCaptureMs' : 'foregroundCaptureMs'
      timings[timingKey] = captured.elapsedMs
      // Capture directly into the reusable combined frame, avoiding an intermediate layer buffer and copy.
      if (captured.bitmap.length !== layerBytes * 2) throw Error('Dimensões inesperadas do bitmap combinado das camadas.')
    }

    await copyLayer(0, 'background', result)
    const foreground = await draw(frameNumber, 'foreground')
    if (foreground.reused) throw Error('O estado visual mudou entre a captura das camadas.')
    collect(foreground)
    await copyLayer(layerBytes, 'foreground', foreground)
    if (!layeredBitmap) throw Error('O renderizador não produziu nenhuma camada para o quadro.')
    const bitmap = layeredBitmap
    if (bitmap.length !== layerBytes * 2) throw Error('Dimensões inesperadas do bitmap exportado.')
    return { reused: false, bitmap, timings, ...(Object.keys(metrics).length ? { metrics } : {}) }
  }

  return {
    frame,
    close: () => {
      closed = true
      frameBitmap = undefined
      layeredBitmap = undefined
    }
  }
}

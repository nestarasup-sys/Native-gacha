import type { BrowserWindow } from 'electron'
import type { EditorV6FrameMetrics, EditorV6FrameTimings, EditorV6RenderFrameResult, EditorV6WorkerPayload } from '../../../src/shared/editorV6Export'
import { addEditorV6FrameMetrics, addEditorV6FrameTimings, hasEditorV6FrameMetrics } from './exportMetrics'
import { waitForExport } from './exportProcess'
import { captureEditorV6PaintedFrame, type EditorV6PaintFrameCapture } from './exportFrameCapture'
import { formatEditorV6Error } from '../../../src/shared/editorV6Error'

export type EditorV6WorkerFrameRenderer = {
  frame: (frame: number) => Promise<EditorV6RenderFrameResult & { bitmap?: Buffer }>
  close: () => void
}

/** Owns frame requests, paint-token capture, and layered bitmap assembly for one worker window. */
export function createEditorV6WorkerFrameRenderer({
  window, payload, signal, captureRetryMilliseconds, paintCapture, comparePaintCapture, inspectCapture, doubleBufferLayers = false
}: {
  window: BrowserWindow
  payload: EditorV6WorkerPayload
  signal: AbortSignal
  captureRetryMilliseconds: number
  /** Preserve the preceding layered BGRA buffer until FFmpeg confirms its write. */
  doubleBufferLayers?: boolean
  paintCapture?: EditorV6PaintFrameCapture
  comparePaintCapture?: EditorV6PaintFrameCapture
  inspectCapture?: (capture: { window: BrowserWindow; frame: number; layer?: 'background' | 'foreground'; bitmap: Buffer }) => Promise<void>
}): EditorV6WorkerFrameRenderer {
  const { width, height, layeredVideo } = payload
  const stackedLayers = layeredVideo && payload.singlePassLayers === true
  const captureHeight = stackedLayers ? height * 2 : height
  const layerBytes = width * height * 4
  let layeredBitmap: Buffer | undefined
  let spareLayeredBitmap: Buffer | undefined
  let currentLayeredBitmap: Buffer | undefined
  let nextPaintToken = 0
  let closed = false

  const draw = async (frame: number, layer?: 'background' | 'foreground' | 'stacked') => {
    const started = performance.now()
    nextPaintToken = nextPaintToken % 0xfffffe + 1
    const token = nextPaintToken
    const layerArgument = layer ? `'${layer}'` : 'undefined'
    const script = `Promise.resolve().then(() => window.renderEditorV6ExportFrame(${Math.round(frame)}, ${layerArgument}, ${token})).then(value => ({ ok: true, value }), error => ({ ok: false, error: { name: error?.name, message: error?.message, stack: error?.stack, code: error?.code, cause: error?.cause, value: String(error) } }))`
    const response = await waitForExport(window.webContents.executeJavaScript(script) as Promise<EditorV6RenderFrameResult | { ok: boolean; value?: EditorV6RenderFrameResult; error?: unknown }>, signal, 60000, 'desenhar quadro')
    const envelope = response && typeof response === 'object' && 'ok' in response ? response : undefined
    if (envelope && (!envelope.ok || !envelope.value)) throw Error(`Falha no quadro ${frame}${layer ? ` (${layer})` : ''}: ${formatEditorV6Error(envelope.error)}`)
    const result = (envelope?.value ?? response) as EditorV6RenderFrameResult | undefined
    if (!result) throw Error(`O worker não retornou o resultado do quadro ${frame}${layer ? ` (${layer})` : ''}.`)
    return { ...result, timings: { ...result.timings, ipcDrawMs: performance.now() - started } }
  }

  const capture = async (frame: number, outputOffset = 0, layer?: 'background' | 'foreground') => {
    const started = performance.now()
    const token = nextPaintToken
    const output = layeredVideo && !stackedLayers ? currentLayeredBitmap : undefined
    const captured = await captureEditorV6PaintedFrame({ window, signal, width, height: captureHeight, token, output, outputOffset, retryMilliseconds: captureRetryMilliseconds, paintCapture })
    const { bitmap, readbacks, paintWaitMs, capturePageMs, captureBitmapMs } = captured
    const sceneBitmap = layeredVideo && !stackedLayers
      ? bitmap.subarray(outputOffset, outputOffset + layerBytes) : bitmap
    if (stackedLayers) {
      // Keep per-layer quality hooks working even though only one combined
      // Chromium readback is performed.
      await inspectCapture?.({ window, frame, layer: 'background', bitmap: sceneBitmap.subarray(0, layerBytes) })
      await inspectCapture?.({ window, frame, layer: 'foreground', bitmap: sceneBitmap.subarray(layerBytes) })
    } else {
      await inspectCapture?.({ window, frame, ...(layer ? { layer } : {}), bitmap: sceneBitmap })
    }
    const elapsedMs = performance.now() - started
    if (comparePaintCapture) {
      const painted = await comparePaintCapture.capture(token)
      if (!sceneBitmap.equals(painted.bitmap)) {
        const mismatchedLayer = stackedLayers
          ? (sceneBitmap.subarray(0, layerBytes).equals(painted.bitmap.subarray(0, layerBytes)) ? 'foreground' : 'background')
          : layer
        const target = mismatchedLayer ? `na camada ${mismatchedLayer} do quadro ${frame}` : `no quadro ${frame}`
        throw Error(`capturePage e paint-event divergiram ${target}, token ${token}.`)
      }
    }
    return { bitmap, readbacks, elapsedMs, paintWaitMs, capturePageMs, captureBitmapMs }
  }

  const frame = async (frameNumber: number): Promise<EditorV6RenderFrameResult & { bitmap?: Buffer }> => {
    signal.throwIfAborted()
    if (closed) throw Error('O renderizador de exportação foi encerrado.')
    const result = await draw(frameNumber, stackedLayers ? 'stacked' : layeredVideo ? 'background' : undefined)
    if (result.reused) return result
    if (!layeredVideo || stackedLayers) {
      // Capture the two vertically stacked scenes at once, directly into a
      // contiguous BGRA view matching FFmpeg's existing rawHeight=height*2.
      const captured = await capture(frameNumber)
      return { reused: false, bitmap: captured.bitmap, timings: { ...result.timings, captureMs: captured.elapsedMs, paintWaitMs: captured.paintWaitMs, capturePageMs: captured.capturePageMs, captureBitmapMs: captured.captureBitmapMs }, metrics: {
        ...result.metrics, captureReadbacks: captured.readbacks, captureStaleReadbacks: captured.readbacks - 1
      } }
    }

    // A normal layered frame uses the last assembled buffer. When lookahead
    // is enabled, assemble into the other one: FFmpeg may still be reading the
    // previous frame, including when only one layer changes.
    currentLayeredBitmap = doubleBufferLayers && layeredBitmap
      ? (spareLayeredBitmap ?? Buffer.allocUnsafe(layerBytes * 2))
      : (layeredBitmap ?? Buffer.allocUnsafe(layerBytes * 2))
    const timings: EditorV6FrameTimings = { ...result.timings }
    const metrics: EditorV6FrameMetrics = { ...result.metrics }
    const collect = (drawn: EditorV6RenderFrameResult) => {
      addEditorV6FrameTimings(timings, drawn.timings)
      addEditorV6FrameMetrics(metrics, drawn.metrics)
    }
    const copyLayer = async (offset: number, layer: 'background' | 'foreground', drawn: EditorV6RenderFrameResult) => {
      if (drawn.layerReused) {
        // The previous composite still owns the unchanged layer. Copy only
        // that half into the new buffer; never expose uninitialized pixels.
        if (!layeredBitmap || !currentLayeredBitmap) throw Error('Uma camada foi reutilizada antes de existir um quadro válido.')
        if (layeredBitmap !== currentLayeredBitmap) {
          layeredBitmap.copy(currentLayeredBitmap, offset, offset, offset + layerBytes)
        }
        return
      }
      const captured = await capture(frameNumber, offset, layer)
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
    if (!currentLayeredBitmap) throw Error('O renderizador não produziu nenhuma camada para o quadro.')
    const bitmap = currentLayeredBitmap
    if (bitmap.length !== layerBytes * 2) throw Error('Dimensões inesperadas do bitmap exportado.')
    if (doubleBufferLayers) spareLayeredBitmap = layeredBitmap
    layeredBitmap = bitmap
    currentLayeredBitmap = undefined
    return { reused: false, bitmap, timings, ...(hasEditorV6FrameMetrics(metrics) ? { metrics } : {}) }
  }

  return {
    frame,
    close: () => {
      closed = true
      layeredBitmap = undefined
      spareLayeredBitmap = undefined
      currentLayeredBitmap = undefined
    }
  }
}

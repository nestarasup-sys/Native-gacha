import type { BrowserWindow } from 'electron'
import type { EditorV6FrameMetrics, EditorV6FrameTimings, EditorV6RenderFrameResult, EditorV6NativeFramePlan, EditorV6WorkerPayload } from '../../../src/shared/editorV6Export'
import { addEditorV6FrameMetrics, addEditorV6FrameTimings, hasEditorV6FrameMetrics } from './exportMetrics'
import { waitForExport } from './exportProcess'
import { captureEditorV6PaintedFrame, type EditorV6PaintFrameCapture } from './exportFrameCapture'
import { formatEditorV6Error } from '../../../src/shared/editorV6Error'
import type { EditorV6NativeRendererProcess } from './nativeRendererProcess'

export type EditorV6WorkerFrameRenderer = {
  frame: (frame: number) => Promise<EditorV6RenderFrameResult & { bitmap?: Buffer }>
  close: () => void
}

/** Owns frame requests, paint-token capture, and layered bitmap assembly for one worker window. */
export function createEditorV6WorkerFrameRenderer({
  window, payload, signal, captureRetryMilliseconds, paintCapture, comparePaintCapture, inspectCapture, doubleBufferLayers = false, nativeRendererProcess
}: {
  window: BrowserWindow
  payload: EditorV6WorkerPayload
  signal: AbortSignal
  captureRetryMilliseconds: number
  /** Preserve the preceding layered BGRA buffer until FFmpeg confirms its write. */
  doubleBufferLayers?: boolean
  nativeRendererProcess?: EditorV6NativeRendererProcess
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

  const draw = async (frame: number, layer: 'background' | 'foreground' | 'stacked' | undefined) => {
    const started = performance.now()
    nextPaintToken = nextPaintToken % 0xfffffe + 1
    const token = nextPaintToken
    const layerArgument = layer ? `'${layer}'` : 'undefined'
    const script = `Promise.resolve().then(() => window.renderEditorV6ExportFrame(${Math.round(frame)}, ${layerArgument}, ${token})).then(value => ({ ok: true, value }), error => ({ ok: false, error: { name: error?.name, message: error?.message, stack: error?.stack, code: error?.code, cause: error?.cause, value: String(error) } }))`
    let response: EditorV6RenderFrameResult | { ok: boolean; value?: EditorV6RenderFrameResult; error?: unknown }
    try {
      response = await waitForExport(window.webContents.executeJavaScript(script) as Promise<EditorV6RenderFrameResult | { ok: boolean; value?: EditorV6RenderFrameResult; error?: unknown }>, signal, 60000, 'desenhar quadro')
    } catch (error) {
      if (error instanceof Error && error.message.includes('Tempo limite: desenhar quadro')) {
        const snapshot = await Promise.race([
          window.webContents.executeJavaScript('JSON.stringify({stage:window.__editorV6ExportDiagnosticStage ?? "stage-unavailable",assets:window.__editorV6ExportDiagnosticAssets ?? []})').catch(() => null),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 1000))
        ])
        let detail = 'diagnostic-unavailable'
        if (typeof snapshot === 'string') {
          try {
            const parsed = JSON.parse(snapshot) as { stage?: unknown; assets?: unknown }
            const assets = Array.isArray(parsed.assets) ? parsed.assets.slice(0, 4) : []
            detail = `stage=${String(parsed.stage ?? 'stage-unavailable').slice(0, 80)};pending-assets=${JSON.stringify(assets).slice(0, 360)}`
          } catch { detail = 'diagnostic-invalid' }
        }
        throw Error(`${error.message} (${detail})`, { cause: error })
      }
      throw error
    }
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

  const renderNative = async (plan: EditorV6NativeFramePlan, timings: EditorV6FrameTimings = {}): Promise<{ bitmap: Buffer; timings: EditorV6FrameTimings }> => {
    if (!nativeRendererProcess) throw Error('O processo do renderizador nativo não foi iniciado.')
    const started = performance.now()
    const rendered = await nativeRendererProcess.render(plan, signal)
    const elapsedMs = performance.now() - started
    return { bitmap: rendered.bitmap, timings: {
      ...timings,
      nativeRasterMs: (timings.nativeRasterMs ?? 0) + elapsedMs,
      nativeProcessMs: (timings.nativeProcessMs ?? 0) + rendered.processMilliseconds,
      nativeTransportMs: (timings.nativeTransportMs ?? 0) + Math.max(0, elapsedMs - rendered.processMilliseconds)
    } }
  }

  const inspectNative = async (frame: number, bitmap: Buffer, layer?: 'background' | 'foreground') => {
    if (!inspectCapture) return
    if (stackedLayers && !layer) {
      await inspectCapture({ window, frame, layer: 'background', bitmap: bitmap.subarray(0, layerBytes) })
      await inspectCapture({ window, frame, layer: 'foreground', bitmap: bitmap.subarray(layerBytes) })
    } else await inspectCapture({ window, frame, ...(layer ? { layer } : {}), bitmap })
  }

  const frame = async (frameNumber: number): Promise<EditorV6RenderFrameResult & { bitmap?: Buffer }> => {
    signal.throwIfAborted()
    if (closed) throw Error('O renderizador de exportação foi encerrado.')
    const result = await draw(frameNumber, stackedLayers ? 'stacked' : layeredVideo ? 'background' : undefined)
    if (payload.nativeRenderer) {
      if (!nativeRendererProcess) throw Error('O processo do renderizador nativo não foi iniciado.')
      if (!layeredVideo || stackedLayers) {
        if (result.reused) return result
        if (!result.nativeFrame) throw Error(`O worker não preparou o plano nativo do quadro ${frameNumber}.`)
        const rendered = await renderNative(result.nativeFrame, result.timings)
        await inspectNative(frameNumber, rendered.bitmap)
        return { ...result, ...rendered, reused: false }
      }

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
          if (!layeredBitmap || !currentLayeredBitmap) throw Error('Uma camada nativa foi reutilizada antes de existir um quadro válido.')
          if (layeredBitmap !== currentLayeredBitmap) layeredBitmap.copy(currentLayeredBitmap, offset, offset, offset + layerBytes)
          return
        }
        if (!drawn.nativeFrame) throw Error(`O worker não preparou a camada nativa do quadro ${frameNumber}.`)
        const rendered = await renderNative(drawn.nativeFrame, drawn.timings)
        await inspectNative(frameNumber, rendered.bitmap, layer)
        collect({ reused: false, timings: rendered.timings })
        if (!currentLayeredBitmap || rendered.bitmap.length !== layerBytes) throw Error('Dimensões inválidas da camada renderizada em C++.')
        rendered.bitmap.copy(currentLayeredBitmap, offset)
      }
      await copyLayer(0, 'background', result)
      const foreground = await draw(frameNumber, 'foreground')
      if (foreground.reused) throw Error('O estado visual mudou entre as camadas nativas do quadro.')
      collect(foreground)
      await copyLayer(layerBytes, 'foreground', foreground)
      if (!currentLayeredBitmap || currentLayeredBitmap.length !== layerBytes * 2) throw Error('O renderizador nativo não montou as duas camadas do quadro.')
      const bitmap = currentLayeredBitmap
      if (doubleBufferLayers) spareLayeredBitmap = layeredBitmap
      layeredBitmap = bitmap
      currentLayeredBitmap = undefined
      return { reused: false, bitmap, timings, ...(hasEditorV6FrameMetrics(metrics) ? { metrics } : {}) }
    }
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

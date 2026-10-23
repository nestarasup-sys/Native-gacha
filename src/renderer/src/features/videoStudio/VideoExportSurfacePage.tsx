import { useEffect, useRef } from 'react'
import { compileVideoScene, evaluateVideoSceneFrame } from '../../../../shared/videoSceneIR'
import { VIDEO_STAGE_HEIGHT, VIDEO_STAGE_WIDTH } from '../../../../shared/videoStageGeometry'
import { VideoCharacterFrameRenderer } from './videoCharacterFrameRenderer'
import { VideoExportMediaFramePool, type VideoExportMediaFrameLease } from './videoExportMediaFramePool'
import { renderVideoSceneFrameToCanvas, clearVideoCanvasImageCache } from './videoCanvasCompositor'
import { VideoCanvasLayerCache } from './videoCanvasLayerCache'
import { VideoStudioResourceBudget } from '../../../../shared/videoStudioNext/resourceBudget'

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason)
}

function surfaceQuery(): URLSearchParams {
  const query = window.location.hash.includes('?') ? window.location.hash.slice(window.location.hash.indexOf('?') + 1) : ''
  return new URLSearchParams(query)
}

function jobIdFromHash(): string {
  const value = surfaceQuery().get('jobId') ?? ''
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error('Surface recebeu jobId inválido.')
  }
  return value
}

export function VideoExportSurfacePage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const layerCacheRef = useRef<VideoCanvasLayerCache | null>(null)
  const cacheBudgetRef = useRef<VideoStudioResourceBudget | null>(null)

  useEffect(() => {
    let disposed = false
    let characterRenderer: VideoCharacterFrameRenderer | null = null
    let mediaPool: VideoExportMediaFramePool | null = null
    let unsubscribe: (() => void) | null = null
    let jobId = ''

    const bootstrap = (async () => {
      jobId = jobIdFromHash()
      const data = await window.desktop.prepareVideoExportSurface(jobId)
      if (disposed) throw new DOMException('Surface descartada.', 'AbortError')
      if (data.jobId !== jobId) throw new Error('Bootstrap retornou outro job.')
      await document.fonts.ready
      if (disposed) throw new DOMException('Surface descartada.', 'AbortError')
      const program = compileVideoScene(data.snapshot, data.renderVariant)
      const canvas = canvasRef.current
      if (!canvas) throw new Error('Canvas da surface não foi montado.')
      canvas.width = VIDEO_STAGE_WIDTH
      canvas.height = VIDEO_STAGE_HEIGHT
      const query = surfaceQuery()
      const layerCacheEnabled = query.get('layerCache') !== '0'
      const readbackOptimized = query.get('readbackCpu') !== '0'
      // One per-surface ledger for cached Canvas layers AND decoded ImageBitmap
      // frames. Decoders, GPU/Chromium internals and transit buffers are not
      // fully accounted yet; this is not a process-wide memory ceiling.
      cacheBudgetRef.current ??= new VideoStudioResourceBudget(160 * 1024 * 1024)
      characterRenderer = new VideoCharacterFrameRenderer(data.characters, data.characterAssets, cacheBudgetRef.current)
      if (layerCacheEnabled) {
        layerCacheRef.current ??= new VideoCanvasLayerCache(96 * 1024 * 1024, cacheBudgetRef.current)
      } else layerCacheRef.current = null
      mediaPool = new VideoExportMediaFramePool(
        jobId, 96 * 1024 * 1024, cacheBudgetRef.current,
        () => {
          layerCacheRef.current?.clear()
          characterRenderer?.clear()
        }
      )
      return { program, canvas, readbackOptimized }
    })()

    unsubscribe = window.desktop.onVideoExportSurfaceRender((request) => {
      void (async () => {
        let mediaLease: VideoExportMediaFrameLease | null = null
        try {
          if (disposed) throw new DOMException('Surface descartada.', 'AbortError')
          const runtime = await bootstrap
          const scene = evaluateVideoSceneFrame(runtime.program, request.frame)
          // Both tasks may fail independently: allSettled ensures an acquired
          // media lease can be released even if the character renderer rejects.
          const [characterResult, mediaResult] = await Promise.allSettled([
            characterRenderer!.renderFrame(scene),
            mediaPool!.acquireFramesForScene(scene),
          ])
          if (mediaResult.status === 'fulfilled') mediaLease = mediaResult.value
          if (characterResult.status === 'rejected') throw characterResult.reason
          if (mediaResult.status === 'rejected') throw mediaResult.reason
          if (disposed) throw new DOMException('Surface descartada.', 'AbortError')
          const composeStarted = performance.now()
          const context = await renderVideoSceneFrameToCanvas(scene, runtime.canvas, { characterStates: characterResult.value, videoFrames: mediaResult.value.frames, layerCache: layerCacheRef.current ?? undefined, willReadFrequently: runtime.readbackOptimized })
          const composeMs = performance.now() - composeStarted
          const readbackStarted = performance.now()
          const rgba = context.getImageData(0, 0, VIDEO_STAGE_WIDTH, VIDEO_STAGE_HEIGHT).data
          const pixels = new Uint8Array(rgba.buffer, rgba.byteOffset, rgba.byteLength)
          const readbackMs = performance.now() - readbackStarted
          if (!disposed) window.desktop.reportVideoExportSurfaceFrame({
            requestId: request.requestId,
            frame: request.frame,
            pixels,
            timings: { composeMs, readbackMs },
            layerCache: layerCacheRef.current?.stats(),
          })
        } catch (reason) {
          if (!disposed) window.desktop.reportVideoExportSurfaceFrame({
            requestId: request.requestId,
            frame: request.frame,
            error: errorMessage(reason),
          })
        } finally {
          // After the render/readback has consumed video bitmaps, close only
          // transient frames and unpin cached frames. Also runs on failures.
          mediaLease?.release()
        }
      })()
    })

    void bootstrap.then(() => {
      if (!disposed) window.desktop.reportVideoExportSurfaceReady({ jobId })
    }).catch((reason) => {
      if (!disposed) window.desktop.reportVideoExportSurfaceReady({ jobId: jobId || 'invalid', error: errorMessage(reason) })
    })

    return () => {
      disposed = true
      unsubscribe?.()
      characterRenderer?.dispose()
      mediaPool?.dispose()
      layerCacheRef.current?.clear()
      layerCacheRef.current = null
      cacheBudgetRef.current?.dispose()
      cacheBudgetRef.current = null
      clearVideoCanvasImageCache()
    }
  }, [])

  return (
    <div style={{ position: 'fixed', inset: 0, width: VIDEO_STAGE_WIDTH, height: VIDEO_STAGE_HEIGHT, margin: 0, padding: 0, overflow: 'hidden', background: '#000' }}>
      <canvas
        ref={canvasRef}
        width={VIDEO_STAGE_WIDTH}
        height={VIDEO_STAGE_HEIGHT}
        aria-label="Surface interna de exportação"
        style={{ display: 'block', width: VIDEO_STAGE_WIDTH, height: VIDEO_STAGE_HEIGHT, margin: 0, padding: 0 }}
      />
    </div>
  )
}

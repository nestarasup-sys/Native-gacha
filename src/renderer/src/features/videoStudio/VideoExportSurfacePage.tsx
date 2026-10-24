import { useEffect, useRef } from 'react'
import { compileVideoScene, evaluateVideoSceneFrame } from '../../../../shared/videoSceneIR'
import { VIDEO_STAGE_HEIGHT, VIDEO_STAGE_WIDTH } from '../../../../shared/videoStageGeometry'
import { VideoCharacterFrameRenderer } from './videoCharacterFrameRenderer'
import { VideoExportMediaFramePool, type VideoExportMediaFrameLease } from './videoExportMediaFramePool'
import { renderVideoSceneFrameToCanvas, clearVideoCanvasImageCache, configureVideoCanvasImageBudget } from './videoCanvasCompositor'
import { VideoCanvasLayerCache } from './videoCanvasLayerCache'
import { VideoStudioResourceBudget } from '../../../../shared/videoStudioNext/resourceBudget'
import { configureVideoExportCharacterImageCaches, clearVideoExportCharacterImageCaches, disposeVideoExportCharacterImageCaches } from '../../characters/characterRenderer'
import { VideoCharacterFrameRenderWorkerClient, type VideoCharacterWorkerTimings } from './videoCharacterFrameRenderWorkerClient'
import type { VideoExportSurfaceBootstrap } from '../../../../shared/videoExportSurface'

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
    let characterWorker: VideoCharacterFrameRenderWorkerClient | null = null
    let workerInitMs = 0
    let workerInitReported = false
    let workerFallbackPending = 0
    let previousWorkerCaches: VideoCharacterWorkerTimings | null = null
    let exportData: VideoExportSurfaceBootstrap | null = null
    let mediaPool: VideoExportMediaFramePool | null = null
    let unsubscribe: (() => void) | null = null
    let jobId = ''

    const bootstrap = (async () => {
      jobId = jobIdFromHash()
      const data = await window.desktop.prepareVideoExportSurface(jobId)
      exportData = data
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
      const requestedBudgetMiB = Number(query.get('resourceBudgetMiB'))
      const resourceBudgetMiB = Number.isSafeInteger(requestedBudgetMiB) && requestedBudgetMiB >= 160 && requestedBudgetMiB <= 512
        ? requestedBudgetMiB : 256
      // One per-surface ledger for cached Canvas layers AND decoded ImageBitmap
      // frames. Decoders, GPU/Chromium internals and transit buffers are not
      // fully accounted yet; this is not a process-wide memory ceiling.
      cacheBudgetRef.current ??= new VideoStudioResourceBudget(resourceBudgetMiB * 1024 * 1024)
      configureVideoCanvasImageBudget(cacheBudgetRef.current)
      configureVideoExportCharacterImageCaches(cacheBudgetRef.current)
      const workerRequested = surfaceQuery().get('characterWorker') === '1'
      if (workerRequested) {
        try {
          characterWorker = new VideoCharacterFrameRenderWorkerClient(data.characters, data.characterAssets)
          const ready = await characterWorker.waitUntilReady()
          workerInitMs = ready.initMs
        } catch {
          characterWorker?.dispose()
          characterWorker = null
          workerFallbackPending += 1
        }
      }
      if (!characterWorker) characterRenderer = new VideoCharacterFrameRenderer(data.characters, data.characterAssets, cacheBudgetRef.current)
      if (layerCacheEnabled) {
        layerCacheRef.current ??= new VideoCanvasLayerCache(96 * 1024 * 1024, cacheBudgetRef.current)
      } else layerCacheRef.current = null
      mediaPool = new VideoExportMediaFramePool(
        jobId, 96 * 1024 * 1024, cacheBudgetRef.current,
        () => {
          layerCacheRef.current?.clear()
          characterRenderer?.clear()
          clearVideoCanvasImageCache()
          clearVideoExportCharacterImageCaches()
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
          // Character raster and imported-media decode already run concurrently.
          // Attribute both costs separately; their durations OVERLAP and must
          // not be added to total wall-clock time.
          let characterMs = 0, mediaDecodeMs = 0
          let characterWorkerRenderMs = 0, characterWorkerBitmapMs = 0
          let characterWorkerRoundTripMs = 0, characterWorkerPostMessageMs = 0
          let characterWorkerInitMs = 0
          let characterWorkerTransferBytes = 0, characterWorkerTransferCount = 0, characterWorkerMessages = 0
          let characterWorkerCacheHits = 0, characterWorkerCacheMisses = 0, characterWorkerCacheInvalidations = 0
          let characterWorkerCacheBytes = 0, characterWorkerImageCacheHits = 0, characterWorkerImageCacheMisses = 0
          let characterWorkerImageCacheFailures = 0, characterWorkerImageCacheInvalidations = 0, characterWorkerImageCacheBytes = 0
          let characterWorkerFallbacks = 0
          const [characterResult, mediaResult] = await Promise.allSettled([
            (async () => {
              const started = performance.now()
              try {
                if (characterWorker) {
                  try {
                    const result = await characterWorker.renderFrame(scene)
                    characterWorkerRenderMs = result.timings.workerRenderMs
                    characterWorkerBitmapMs = result.timings.workerBitmapMs
                    characterWorkerRoundTripMs = result.roundTripMs
                    characterWorkerPostMessageMs = result.postMessageMs
                    characterWorkerTransferBytes = result.timings.transferBytes
                    characterWorkerTransferCount = result.timings.transferCount
                    characterWorkerMessages = 2
                    if (!workerInitReported) {
                      characterWorkerInitMs = workerInitMs
                      workerInitReported = true
                    }
                    const current = result.timings
                    if (previousWorkerCaches) {
                      characterWorkerCacheHits = Math.max(0, current.frameCache.frameCacheHits - previousWorkerCaches.frameCache.frameCacheHits)
                      characterWorkerCacheMisses = Math.max(0, current.frameCache.frameCacheMisses - previousWorkerCaches.frameCache.frameCacheMisses)
                      characterWorkerCacheInvalidations = Math.max(0, current.frameCache.cacheInvalidations - previousWorkerCaches.frameCache.cacheInvalidations)
                      characterWorkerImageCacheHits = Math.max(0, current.imageCache.hits - previousWorkerCaches.imageCache.hits)
                      characterWorkerImageCacheMisses = Math.max(0, current.imageCache.misses - previousWorkerCaches.imageCache.misses)
                      characterWorkerImageCacheFailures = Math.max(0, current.imageCache.failures - previousWorkerCaches.imageCache.failures)
                      characterWorkerImageCacheInvalidations = Math.max(0, current.imageCache.invalidations - previousWorkerCaches.imageCache.invalidations)
                    } else {
                      characterWorkerCacheHits = current.frameCache.frameCacheHits
                      characterWorkerCacheMisses = current.frameCache.frameCacheMisses
                      characterWorkerImageCacheHits = current.imageCache.hits
                      characterWorkerImageCacheMisses = current.imageCache.misses
                      characterWorkerImageCacheFailures = current.imageCache.failures
                      characterWorkerImageCacheInvalidations = current.imageCache.invalidations
                    }
                    previousWorkerCaches = current
                    characterWorkerCacheBytes = current.budget.usedBytes
                    characterWorkerImageCacheBytes = current.imageCache.bytes
                    const states = new Map(result.states)
                    for (const character of scene.characters) {
                      const rendered = states.get(character.elementId)
                      if (rendered && rendered.canvasImage) continue
                      if (rendered?.imageDataUrl) continue
                      const authored = character.authoredState
                      if (!authored) continue
                      states.set(character.elementId, character.stageTransform
                        ? { ...authored, element: { ...authored.element, ...character.stageTransform } }
                        : authored)
                    }
                    return states
                  } catch (error) {
                    if (disposed) throw error
                    characterWorker.dispose()
                    characterWorker = null
                    characterWorkerFallbacks = 1
                    workerFallbackPending += 1
                    characterRenderer ??= new VideoCharacterFrameRenderer(exportData!.characters, exportData!.characterAssets, cacheBudgetRef.current ?? undefined)
                    return await characterRenderer.renderFrame(scene, true)
                  }
                }
                characterRenderer ??= new VideoCharacterFrameRenderer(exportData!.characters, exportData!.characterAssets, cacheBudgetRef.current ?? undefined)
                return await characterRenderer.renderFrame(scene, true)
              }
              finally { characterMs = performance.now() - started }
            })(),
            (async () => {
              const started = performance.now()
              try { return await mediaPool!.acquireFramesForScene(scene) }
              finally { mediaDecodeMs = performance.now() - started }
            })(),
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
          characterWorkerFallbacks += workerFallbackPending
          workerFallbackPending = 0
          for (const state of characterResult.value.values()) {
            const image = state.canvasImage
            if (typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap) image.close()
          }
          if (!disposed) window.desktop.reportVideoExportSurfaceFrame({
            requestId: request.requestId,
            frame: request.frame,
            pixels,
            timings: {
              composeMs, readbackMs, characterMs, mediaDecodeMs,
              characterWorkerRenderMs, characterWorkerBitmapMs, characterWorkerRoundTripMs,
              characterWorkerPostMessageMs, characterWorkerInitMs,
              characterWorkerTransferBytes, characterWorkerTransferCount, characterWorkerMessages,
              characterWorkerFallbacks, characterWorkerCacheHits, characterWorkerCacheMisses,
              characterWorkerCacheInvalidations, characterWorkerCacheBytes,
              characterWorkerImageCacheHits, characterWorkerImageCacheMisses,
              characterWorkerImageCacheFailures, characterWorkerImageCacheInvalidations,
              characterWorkerImageCacheBytes,
            },
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
      characterWorker?.dispose()
      characterRenderer?.dispose()
      mediaPool?.dispose()
      layerCacheRef.current?.clear()
      layerCacheRef.current = null
      disposeVideoExportCharacterImageCaches()
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

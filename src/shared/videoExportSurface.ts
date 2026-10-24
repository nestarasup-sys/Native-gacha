import type { VideoExportSnapshot } from './videoExportSnapshot'
import type { VideoExportCharacterSnapshot } from './videoExportCharacters'
import type { VideoCharacterRenderAssetSnapshot } from './videoCharacterRenderAssets'
import type { RenderVariant } from './videoSceneIR'

export type VideoExportSurfaceBootstrap = Readonly<{
  jobId: string
  snapshot: VideoExportSnapshot
  characters: VideoExportCharacterSnapshot
  characterAssets: VideoCharacterRenderAssetSnapshot
  renderVariant: RenderVariant
}>

export type VideoExportSurfaceRenderRequest = Readonly<{
  requestId: string
  frame: number
}>

export type VideoExportSurfaceFrameReady = Readonly<{
  requestId: string
  frame: number
  error?: string
  /** Canonical Canvas RGBA bytes; present only on successful frame acknowledgements. */
  pixels?: Uint8Array
  timings?: Readonly<{
    composeMs: number
    readbackMs: number
    characterMs?: number
    mediaDecodeMs?: number
    characterWorkerRenderMs?: number
    characterWorkerBitmapMs?: number
    characterWorkerRoundTripMs?: number
    characterWorkerPostMessageMs?: number
    characterWorkerInitMs?: number
    characterWorkerTransferBytes?: number
    characterWorkerTransferCount?: number
    characterWorkerMessages?: number
    characterWorkerFallbacks?: number
    characterWorkerCacheHits?: number
    characterWorkerCacheMisses?: number
    characterWorkerCacheInvalidations?: number
    characterWorkerCacheBytes?: number
    characterWorkerImageCacheHits?: number
    characterWorkerImageCacheMisses?: number
    characterWorkerImageCacheFailures?: number
    characterWorkerImageCacheInvalidations?: number
    characterWorkerImageCacheBytes?: number
  }>
  /** Diagnostic-only cumulative canvas layer-cache counters for local benchmarks. */
  layerCache?: Readonly<{ hits: number; misses: number; evictions: number; entries: number; bytes: number; maxBytes: number }>
}>

export type VideoExportSurfaceReady = Readonly<{
  jobId: string
  error?: string
}>

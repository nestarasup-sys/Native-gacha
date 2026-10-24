import type { PoseArtwork } from '../../../../shared/videoCharacterInterpolation'
import { orderedVisiblePoseParts, PixiGachaPoseRig, type GachaPixiPort, type PoseGpuStatistics } from './pixiGachaPoseRig'
import { preparePixiSkinToneArtwork } from './pixiGachaArtworkPreparation'
import { PixiGachaPoseGeometrySession } from './pixiGachaPoseGeometrySession'

type PixiModule = typeof import('pixi.js')
type PixiApplication = import('pixi.js').Application

/**
 * Real WebGL2 adapter for the persistent-sprite pose rig. The main Video
 * Studio preview does NOT use it until skin, hair, wardrobe and PT face
 * pixel parity is certified. No timers or independent animation loop:
 * the caller supplies the canonical absolute timeline progress.
 */
export class PixiGachaPoseSurface {
  readonly canvas: HTMLCanvasElement
  private readonly loaded = new Set<string>()
  private lost = false
  private disposed = false
  private geometrySession: { from: PoseArtwork; to: PoseArtwork; worker: PixiGachaPoseGeometrySession } | null = null
  private poseFrameSerial = 0
  private readonly onContextLost = (event: Event) => {
    event.preventDefault()
    this.lost = true
  }

  private constructor(
    private readonly pixi: PixiModule,
    private readonly app: PixiApplication,
    private readonly rig: PixiGachaPoseRig,
  ) {
    this.canvas = app.canvas as HTMLCanvasElement
    this.canvas.addEventListener('webglcontextlost', this.onContextLost)
  }

  /** Lazy-load the sizeable PixiJS runtime only when an experimental surface is requested. */
  static async create(width: number, height: number): Promise<PixiGachaPoseSurface> {
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height)
      || width < 1 || height < 1 || width > 8192 || height > 8192) {
      throw new Error('Dimensões inválidas para a superfície GPU do Gacha.')
    }
    const pixi = await import('pixi.js')
    const app = new pixi.Application()
    try {
      await app.init({
        width, height, preference: 'webgl', preferWebGLVersion: 2,
        autoStart: false, sharedTicker: false, antialias: false,
        resolution: 1, backgroundAlpha: 0, preserveDrawingBuffer: true,
      })
      const rig = new PixiGachaPoseRig(pixi as unknown as GachaPixiPort)
      app.stage.addChild(rig.stage as unknown as import('pixi.js').Container)
      return new PixiGachaPoseSurface(pixi, app, rig)
    } catch (error) {
      // Avoid leaking a partially initialized GPU context when WebGL fails.
      if (app.renderer) app.destroy(true, { children: true })
      throw error
    }
  }

  /** Preload textures from both authored endpoint poses before any GPU draw. */
  async prime(poses: readonly PoseArtwork[]): Promise<void> {
    this.assertReady()
    const resources = [...new Set(poses.flatMap(pose => orderedVisiblePoseParts(pose).map(part => part.dataUrl)))]
      .filter(url => !this.loaded.has(url))
    await Promise.all(resources.map(async url => {
      this.assertReady()
      await this.pixi.Assets.load(url)
      this.assertReady()
      this.loaded.add(url)
    }))
  }

  /**
   * For body-only GPU parity experiments, reuse the *canonical* Canvas skin
   * tint pipeline exactly once per unique source PNG. Returns derived poses
   * whose texture URLs can be used with renderPose/renderInterpolatedPose.
   * Hair, wardrobe and PT facial overlays remain subject to the Canvas gate.
   */
  async primeWithSkinTone(poses: readonly PoseArtwork[], skinTone?: string): Promise<readonly PoseArtwork[]> {
    this.assertReady()
    const gpuArtwork = await preparePixiSkinToneArtwork(poses, skinTone)
    this.assertReady()
    await this.prime(gpuArtwork)
    return gpuArtwork
  }

  renderPose(pose: PoseArtwork): void {
    this.assertReady()
    this.assertTexturesReady(pose)
    this.rig.setPose(pose)
    this.app.renderer.render(this.app.stage)
  }

  /** Same joints/interpolation as the Canvas compositor; only the draw engine changes. */
  renderInterpolatedPose(from: PoseArtwork, to: PoseArtwork, progress: number): void {
    this.assertReady()
    this.assertTexturesReady(from)
    this.assertTexturesReady(to)
    this.rig.setInterpolatedPose(from, to, progress)
    this.app.renderer.render(this.app.stage)
  }

  /**
   * Actual off-thread articulated pose interpolation. The Worker sees only
   * numeric geometry and joint anchors; full Gacha PNGs remain in the GPU
   * thread. A seek may abort individual frames without blocking React.
   *
   * This path is explicitly experimental until the complete character/GPU
   * pixel oracle approves it. The existing synchronous method is retained
   * for machines where Workers are not supported.
   */
  async renderInterpolatedPoseInWorker(
    from: PoseArtwork, to: PoseArtwork, progress: number, signal?: AbortSignal,
  ): Promise<void> {
    this.assertReady()
    this.assertTexturesReady(from)
    this.assertTexturesReady(to)
    // Latest timeline frame wins. Otherwise a slow earlier Worker reply can
    // paint *after* a newer seek and visibly jump the character backwards.
    const serial = ++this.poseFrameSerial
    if (!this.geometrySession || this.geometrySession.from !== from || this.geometrySession.to !== to) {
      this.geometrySession?.worker.dispose()
      this.geometrySession = { from, to, worker: new PixiGachaPoseGeometrySession(from, to) }
    } else {
      this.geometrySession.worker.cancelPending(new Error('Frame de pose ultrapassado por outro seek.'))
    }
    const artwork = await this.geometrySession.worker.interpolate(progress, signal)
    this.assertReady()
    signal?.throwIfAborted()
    if (serial !== this.poseFrameSerial) {
      throw new Error('Resposta antiga do Worker de pose descartada.')
    }
    this.rig.setPose(artwork)
    this.app.renderer.render(this.app.stage)
  }

  cancelPendingPoseFrames(): void {
    this.poseFrameSerial++
    this.geometrySession?.worker.cancelPending()
  }

  stats(): PoseGpuStatistics & { loadedAssets: number; gpuContextLost: boolean } {
    return { ...this.rig.stats(), loadedAssets: this.loaded.size, gpuContextLost: this.lost }
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.poseFrameSerial++
    this.geometrySession?.worker.dispose()
    this.geometrySession = null
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost)
    this.app.stage.removeChild(this.rig.stage as unknown as import('pixi.js').Container)
    this.rig.dispose()
    this.app.destroy(true, { children: true })
    // Assets is global/shared: never unload an asset that another rig may use.
    this.loaded.clear()
  }

  private assertTexturesReady(pose: PoseArtwork): void {
    for (const part of orderedVisiblePoseParts(pose)) {
      if (!this.loaded.has(part.dataUrl)) {
        throw new Error('Textura PixiJS não preparada. Execute prime() antes de renderizar.')
      }
    }
  }

  private assertReady(): void {
    if (this.disposed) throw new Error('Superfície PixiJS já foi descartada.')
    if (this.lost) throw new Error('Contexto GPU perdido: utilize o fallback Canvas.')
  }
}

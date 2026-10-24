import type { PreparedGachaLayerFrame } from '../../characters/characterRenderer'
import { PixiGachaLayerStack, type LayerStackMetrics, type PixiLayerPort } from './pixiGachaLayerStack'

type PixiModule = typeof import('pixi.js')
type PixiApplication = import('pixi.js').Application

/**
 * Experimental full-character GPU compositing surface.
 *
 * The original character renderer creates exact lower and upper layers from
 * body, outfits and hair and paints the moving face (PT masks/pupils, eyes,
 * mouth, blush) into a third layer. Pixi reuses static GPU textures and uploads
 * ONLY that mutable face layer per animation frame.
 *
 * The main Video Studio remains on the canonical Canvas backend until real
 * Chromium Windows Gacha pixel-oracle results verify all three layers.
 */
export class PixiGachaLayerSurface {
  readonly canvas: HTMLCanvasElement
  private readonly lost = { value: false }
  private disposed = false
  private readonly stack: PixiGachaLayerStack
  private readonly onContextLost = (event: Event): void => {
    event.preventDefault()
    this.lost.value = true
  }

  private constructor(
    private readonly app: PixiApplication,
    pixi: PixiModule,
    readonly width: number,
    readonly height: number,
  ) {
    this.canvas = app.canvas as HTMLCanvasElement
    this.stack = new PixiGachaLayerStack(pixi as unknown as PixiLayerPort)
    app.stage.addChild(this.stack.stage as unknown as import('pixi.js').Container)
    this.canvas.addEventListener('webglcontextlost', this.onContextLost)
  }

  static async create(width: number, height: number): Promise<PixiGachaLayerSurface> {
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height)
      || width < 1 || height < 1 || width > 8192 || height > 8192) {
      throw new Error('Dimensões GPU inválidas para o Gacha.')
    }
    const pixi = await import('pixi.js')
    const app = new pixi.Application()
    try {
      await app.init({
        width, height, backgroundAlpha: 0,
        preference: 'webgl', preferWebGLVersion: 2,
        autoStart: false, sharedTicker: false, antialias: false,
        resolution: 1, preserveDrawingBuffer: true,
      })
      return new PixiGachaLayerSurface(app, pixi, width, height)
    } catch (error) {
      if (app.renderer) app.destroy(true, { children: true })
      throw error
    }
  }

  /** Must be invoked on the current absolute Studio frame, never a separate animation clock. */
  render(layers: PreparedGachaLayerFrame): HTMLCanvasElement {
    if (this.disposed) throw new Error('Superfície GPU Gacha descartada.')
    if (this.lost.value) throw new Error('Contexto WebGL perdido: mantenha o compositor Canvas.')
    if (layers.outputWidth !== this.width || layers.outputHeight !== this.height) {
      throw new Error('Tamanho da superfície GPU diferente do frame Gacha.')
    }
    this.stack.setLayers(layers)
    this.app.renderer.render(this.app.stage)
    return this.canvas
  }

  stats(): LayerStackMetrics & { contextLost: boolean } {
    return { ...this.stack.metrics(), contextLost: this.lost.value }
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost)
    this.app.stage.removeChild(this.stack.stage as unknown as import('pixi.js').Container)
    this.stack.dispose()
    this.app.destroy(true, { children: true })
  }
}

/**
 * GPU experiment with safe fallback: a failed context, unexpected scale or
 * invalid layer never hides a Gacha character. It uses the original Canvas
 * composition only on failure, and never changes the authored timeline.
 */
export async function drawGachaLayeredFrame(
  prepared: {
    renderLayersToCanvas: (...args: never[]) => Promise<PreparedGachaLayerFrame>
    renderToCanvas: (...args: never[]) => Promise<{ canvas: HTMLCanvasElement }>
  },
  gpu: Pick<PixiGachaLayerSurface, 'render'> | null,
  ...args: never[]
): Promise<{ canvas: HTMLCanvasElement; backend: 'pixi' | 'canvas' }> {
  if (!gpu) {
    const exact = await prepared.renderToCanvas(...args)
    return { canvas: exact.canvas, backend: 'canvas' }
  }
  try {
    const layers = await prepared.renderLayersToCanvas(...args)
    return { canvas: gpu.render(layers), backend: 'pixi' }
  } catch {
    const exact = await prepared.renderToCanvas(...args)
    return { canvas: exact.canvas, backend: 'canvas' }
  }
}

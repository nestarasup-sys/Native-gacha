import type { PreparedGachaLayerFrame } from '../../characters/characterRenderer'

/** Pixi v8 compatible adapter kept small enough to test without a GPU. */
export interface PixiLayerTexture {
  source: { update(): void }
}
export interface PixiLayerSprite {
  texture: PixiLayerTexture
  visible: boolean
  x: number
  y: number
  width: number
  height: number
}
export interface PixiLayerContainer {
  x: number
  y: number
  scale: { set(x: number, y: number): void }
  addChild(sprite: PixiLayerSprite): unknown
  destroy(options?: unknown): void
}
export interface PixiLayerPort {
  Container: new () => PixiLayerContainer
  Sprite: new (texture: PixiLayerTexture) => PixiLayerSprite
  Texture: { from(source: HTMLCanvasElement): PixiLayerTexture }
}
export type LayerStackMetrics = Readonly<{
  frames: number
  createdSprites: number
  reusedSpriteFrames: number
  uploadedFaceFrames: number
  replacedStaticSources: number
  staticSourceUpdates: number
  removedUpperFrames: number
}>

/**
 * Compose real Gacha layer canvases on the GPU, not endpoint PNG crossfades:
 *
 *   1. body + rear hair + clothes
 *   2. independent eyes/pupils/mouth/effects (mutable)
 *   3. front hair + front accessories
 *
 * PreparedGachaLayerFrame originates in the existing exact character
 * compositor. The skin/wardrobe/pupil layout is never reimplemented here.
 *
 * One Pixi Sprite per layer persists across frames. When the same face Canvas
 * is repainted, CanvasSource.update() reuploads those pixels; stable static
 * canvases are NEVER uploaded again.
 */
export class PixiGachaLayerStack {
  readonly stage: PixiLayerContainer
  private readonly sprites: Array<PixiLayerSprite | null> = [null, null, null]
  private readonly sources: Array<HTMLCanvasElement | null> = [null, null, null]
  private lastWidth = 0
  private lastHeight = 0
  private frames = 0
  private createdSprites = 0
  private reusedSpriteFrames = 0
  private uploadedFaceFrames = 0
  private replacedStaticSources = 0
  private staticSourceUpdates = 0
  private removedUpperFrames = 0
  private disposed = false

  constructor(private readonly pixi: PixiLayerPort) {
    this.stage = new pixi.Container()
  }

  setLayers(frame: PreparedGachaLayerFrame): void {
    if (this.disposed) throw new Error('Camadas GPU descartadas.')
    const { behindFace, face, inFrontOfFace, width, height, outputWidth, outputHeight, shapeScaleX, shapeScaleY } = frame
    if (![width, height, outputWidth, outputHeight, shapeScaleX, shapeScaleY].every(Number.isFinite)
      || width <= 0 || height <= 0 || shapeScaleX <= 0 || shapeScaleY <= 0
      || outputWidth < width || outputHeight < height) {
      throw new Error('Dimensões inválidas de camadas Gacha.')
    }
    const ordered = [behindFace, face, inFrontOfFace]
    if (ordered.some(canvas => canvas && (canvas.width !== width || canvas.height !== height))) {
      throw new Error('As camadas Gacha precisam de dimensões idênticas.')
    }
    if (this.lastWidth && (this.lastWidth !== width || this.lastHeight !== height)) {
      // A Pixi Application is sized for one prepared pose. Changing the pose
      // dimensions requires a new surface to avoid stretched cached sprites.
      throw new Error('Dimensões da pose mudaram: crie uma nova superfície Pixi.')
    }
    this.lastWidth = width
    this.lastHeight = height
    this.stage.x = (outputWidth - width * shapeScaleX) / 2
    this.stage.y = (outputHeight - height * shapeScaleY) / 2
    this.stage.scale.set(shapeScaleX, shapeScaleY)

    let reuses = 0
    for (let index = 0; index < ordered.length; index++) {
      const source = ordered[index]
      const sprite = this.sprites[index]
      if (!source) {
        if (sprite) {
          sprite.visible = false
          if (index === 2) this.removedUpperFrames++
        }
        continue
      }
      if (!sprite) {
        const created = new this.pixi.Sprite(this.pixi.Texture.from(source))
        created.x = 0
        created.y = 0
        created.width = width
        created.height = height
        created.visible = true
        this.sprites[index] = created
        this.sources[index] = source
        this.stage.addChild(created)
        this.createdSprites++
      } else {
        reuses++
        sprite.visible = true
        if (this.sources[index] !== source) {
          sprite.texture = this.pixi.Texture.from(source)
          this.sources[index] = source
          if (index !== 1) this.replacedStaticSources++
        } else if (index === 1) {
          // Repainting a mutable canvas alone does not invalidate Pixi's GPU
          // texture cache. Face pixels must be explicitly uploaded every frame.
          sprite.texture.source.update()
          this.uploadedFaceFrames++
        } else {
          // Body/wardrobe/upper-hair sprites stay on their original GPU
          // textures. Never burn bandwidth reuploading their pixels.
        }
        sprite.width = width
        sprite.height = height
      }
    }
    if (reuses === ordered.filter(Boolean).length) this.reusedSpriteFrames++
    this.frames++
  }

  metrics(): LayerStackMetrics {
    return {
      frames: this.frames, createdSprites: this.createdSprites,
      reusedSpriteFrames: this.reusedSpriteFrames,
      uploadedFaceFrames: this.uploadedFaceFrames,
      replacedStaticSources: this.replacedStaticSources,
      staticSourceUpdates: this.staticSourceUpdates,
      removedUpperFrames: this.removedUpperFrames,
    }
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.stage.destroy({ children: true })
    for (let index = 0; index < this.sprites.length; index++) {
      this.sprites[index] = null
      this.sources[index] = null
    }
    // Assets/Texture.from() may be shared by another active GPU surface:
    // per-surface sprite disposal must not destroy shared Pixi textures.
  }
}

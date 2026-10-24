import type { ModelPart } from '../../../../shared/fabricator'
import { mixPoseArtwork, type PoseArtwork } from '../../../../shared/videoCharacterInterpolation'

/**
 * First GPU migration slice: persistent pose sprites, not a replacement for
 * the existing full Gacha compositor. The caller supplies the actual PixiJS
 * v8 namespace; production integration will be enabled only after full
 * skin-tone/wardrobe/hair/face pixel-oracle parity is demonstrated.
 *
 * This port intentionally has no import of pixi.js: npm dependencies are
 * managed separately from the editor core, and synthetic contract tests run
 * without a GPU. The real PixiJS adapter passes { Container, Sprite, Texture }.
 */
export interface GachaGpuSprite {
  texture: unknown
  anchor: { set(value: number): void }
  position: { set(x: number, y: number): void }
  width: number
  height: number
  rotation: number
  visible: boolean
}
export interface GachaGpuContainer {
  addChild(sprite: GachaGpuSprite): unknown
  removeChildren(): unknown
  destroy(options?: unknown): void
}
export interface GachaPixiPort {
  Container: new () => GachaGpuContainer
  Sprite: new (texture: unknown) => GachaGpuSprite
  Texture: { from(source: string): unknown }
}
export type PoseGpuStatistics = Readonly<{
  spritesCreated: number
  texturesCreated: number
  poseUpdates: number
  retainedSprites: number
  retainedTextures: number
  orderUpdates: number
}>

/** Same layer ordering and part coordinates as characterRenderer.renderArtwork. */
export function orderedVisiblePoseParts(artwork: PoseArtwork): ModelPart[] {
  const hidden = new Set(artwork.hiddenPartIds ?? [])
  const order = new Map((artwork.layerOrder ?? []).map((id, index) => [id, index]))
  return artwork.parts.map((part, index) => ({ part, index }))
    .filter(({ part }) => !hidden.has(part.id))
    .sort((a, b) => (order.get(a.part.id) ?? a.index) - (order.get(b.part.id) ?? b.index))
    .map(({ part }) => part)
}

/**
 * Each ModelPart keeps its Sprite identity across the complete interpolation.
 * Each dataUrl becomes one shared-in-rig GPU texture instead of 14 new PNGs.
 * One call to setPose only updates transforms; geometry and joints come from
 * the canonical Video Studio mixPoseArtwork implementation.
 */
export class PixiGachaPoseRig {
  readonly stage: GachaGpuContainer
  private readonly sprites = new Map<string, GachaGpuSprite>()
  private readonly textures = new Map<string, unknown>()
  private orderKey = ''
  private updates = 0
  private spritesCreated = 0
  private texturesCreated = 0
  private orderUpdates = 0
  private disposed = false

  constructor(private readonly pixi: GachaPixiPort) {
    this.stage = new pixi.Container()
  }

  setPose(artwork: PoseArtwork): void {
    if (this.disposed) throw new Error('O rig PixiJS já foi descartado.')
    const parts = orderedVisiblePoseParts(artwork)
    const visible = new Set(parts.map(part => part.id))
    for (const [id, sprite] of this.sprites) sprite.visible = visible.has(id)
    for (const part of parts) {
      let texture = this.textures.get(part.dataUrl)
      if (!texture) {
        texture = this.pixi.Texture.from(part.dataUrl)
        this.textures.set(part.dataUrl, texture)
        this.texturesCreated++
      }
      let sprite = this.sprites.get(part.id)
      if (!sprite) {
        sprite = new this.pixi.Sprite(texture)
        sprite.anchor.set(.5)
        this.sprites.set(part.id, sprite)
        this.spritesCreated++
      } else if (sprite.texture !== texture) sprite.texture = texture
      sprite.position.set(part.x + part.width / 2, part.y + part.height / 2)
      sprite.width = part.width
      sprite.height = part.height
      sprite.rotation = part.rotation * Math.PI / 180
      sprite.visible = true
    }
    // Reordering the Pixi scene tree every frame is avoidable. Only rebuild
    // child order on a real layer visibility/order change.
    const order = parts.map(part => part.id)
    const signature = JSON.stringify(order)
    if (signature !== this.orderKey) {
      this.stage.removeChildren()
      for (const id of order) this.stage.addChild(this.sprites.get(id)!)
      this.orderKey = signature
      this.orderUpdates++
    }
    this.updates++
  }

  setInterpolatedPose(from: PoseArtwork, to: PoseArtwork, progress: number): void {
    this.setPose(mixPoseArtwork(from, to, progress))
  }

  stats(): PoseGpuStatistics {
    return {
      spritesCreated: this.spritesCreated,
      texturesCreated: this.texturesCreated,
      poseUpdates: this.updates,
      retainedSprites: this.sprites.size,
      retainedTextures: this.textures.size,
      orderUpdates: this.orderUpdates,
    }
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.stage.destroy({ children: true })
    // Do not destroy globally shared Pixi Texture.from sources: other rigs
    // can still reference them. Resource eviction is owned by GPU manager.
    this.sprites.clear()
    this.textures.clear()
  }
}

import type { CustomizerCharacter, CustomizerFaceAppearance } from '../../../../shared/customizer'
import type { FaceExpressionEffects, FabricatorProject } from '../../../../shared/fabricator'
import type { StudioFaceMode, StudioFaceTransforms } from '../../../../shared/studio'
import type { VideoCharacterRenderAssetProvider } from '../../../../shared/videoCharacterRenderAssets'
import type { PoseArtwork } from '../../../../shared/videoCharacterInterpolation'
import { prepareSavedCharacterRenderer } from '../../characters/characterRenderer'
import { resolveSavedCharacterSource } from '../../characters/characterSourceResolver'
import { prepareGachaArticulatedAssets } from './pixiGachaArticulatedAssets'
import { PixiGachaArticulatedSurface } from './pixiGachaArticulatedSurface'
import { compareGachaPixels } from './pixiGachaParity'

/**
 * Production-appearance reference stays Canvas, but only at sparse admission
 * checkpoints. Between checkpoints the body, garments and hair are sprites
 * bound to their bones and only the face layer is repainted on its stable rig.
 */
export class PixiGachaArticulatedSession {
  private surface: PixiGachaArticulatedSurface | null = null
  private frames = 0
  private disabled = false
  private disposed = false
  private constructor(
    private readonly character: CustomizerCharacter,
    private readonly source: FabricatorProject,
    private readonly provider: VideoCharacterRenderAssetProvider,
    private readonly faceRenderer: Awaited<ReturnType<typeof prepareSavedCharacterRenderer>>,
    private readonly assets: Awaited<ReturnType<typeof prepareGachaArticulatedAssets>>,
    private readonly referencePose: PoseArtwork,
  ) {}
  static async create(
    character: CustomizerCharacter, source: FabricatorProject,
    from: PoseArtwork, to: PoseArtwork, provider: VideoCharacterRenderAssetProvider,
  ): Promise<PixiGachaArticulatedSession> {
    const [left, right] = await Promise.all([
      resolveSavedCharacterSource(character, { source, artwork: from, assetProvider: provider }),
      resolveSavedCharacterSource(character, { source, artwork: to, assetProvider: provider }),
    ])
    const [faceRenderer, assets] = await Promise.all([
      prepareSavedCharacterRenderer(character,{source,artwork:from,assetProvider:provider}),
      prepareGachaArticulatedAssets(character,source,left.artwork,right.artwork,provider),
    ])
    return new PixiGachaArticulatedSession(character,source,provider,faceRenderer,assets,left.artwork)
  }
  /** RGB is ignored only for *mutually* transparent pixels by compareGachaPixels. */
  private async verify(
    artwork: PoseArtwork, appearance: CustomizerFaceAppearance | undefined,
    transforms: StudioFaceTransforms, effects: FaceExpressionEffects, mode?: StudioFaceMode,
  ): Promise<void> {
    if (!this.surface) throw new Error('Superfície Gacha indisponível.')
    const canonical = await prepareSavedCharacterRenderer(this.character, {
      source:this.source, artwork, assetProvider:this.provider,
    })
    const exact = await canonical.renderToCanvas(appearance,transforms,effects,mode)
    if (exact.width * exact.height > 2_000_000) throw new Error('Oráculo GPU excedeu orçamento de pixels.')
    const expected = exact.canvas.getContext('2d', { willReadFrequently:true })!
      .getImageData(0,0,exact.width,exact.height).data
    const pixels = this.surface.pixels()
    const result = compareGachaPixels(expected,pixels,exact.width,exact.height,10)
    if (result.changedRatio > .003 || result.meanWorstChannelError > 1.25 ||
        result.p99WorstChannelError > 5) {
      throw new Error('A nova GPU divergiu do Gacha Canvas; mantendo o compositor original.')
    }
  }
  async render(
    pose: PoseArtwork, appearance: CustomizerFaceAppearance | undefined,
    transforms: StudioFaceTransforms, effects: FaceExpressionEffects, mode?: StudioFaceMode,
  ): Promise<HTMLCanvasElement> {
    if (this.disposed || this.disabled) throw new Error('Sessão GPU Gacha indisponível.')
    try {
      // Resolving proportions/body-shape is pure and asset-free when model
      // and pose are already in memory; no wardrobe/hair rebuilding here.
      const { artwork } = await resolveSavedCharacterSource(this.character, {
        source:this.source, artwork:pose, assetProvider:this.provider,
      })
      const face = await this.faceRenderer.renderLayersToCanvas(appearance,transforms,effects,mode)
      if (!this.surface) this.surface = await PixiGachaArticulatedSurface.create(
        this.assets,this.referencePose,face.face,face.outputWidth,face.outputHeight)
      const result = this.surface.render(artwork,face)
      // The first few transition phases must prove real-pixel equivalence.
      // Periodic checks catch driver/context changes without a Canvas rig per
      // intermediate frame. Any mismatch permanently disables this session.
      if (this.frames < 3 || this.frames % 120 === 0)
        await this.verify(pose,appearance,transforms,effects,mode)
      this.frames++
      return result
    } catch (error) {
      this.disabled=true
      this.dispose()
      throw error
    }
  }
  stats() { return { frames:this.frames, disabled:this.disabled, gpu:this.surface?.stats() ?? null } }
  dispose():void {
    if (this.disposed) return
    this.disposed=true
    this.surface?.dispose()
    this.surface=null
  }
}

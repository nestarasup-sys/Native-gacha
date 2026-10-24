import type { CustomizerCharacter, CustomizerFaceAppearance, FaceComponentPartId } from '../../../../shared/customizer'
import type { FaceCatalogItem, FaceComponentAsset, FaceElementKind, FaceExpressionEffects, FaceTransform, FabricatorProject } from '../../../../shared/fabricator'
import type { StudioFaceTransforms, VideoCharacterState } from '../../../../shared/studio'
import type { VideoCharacterRenderAssetProvider } from '../../../../shared/videoCharacterRenderAssets'
import { faceRenderGeometry, trimTransparentImage } from './characterGeometry'
import { mixAppearance, mixEffects, mixPoseArtwork, mixStageElement, mixStudioTransforms, smoothProgress, transitionProgress, type PoseArtwork } from '../../../../shared/videoCharacterInterpolation'
import type { CharacterTransition } from './characterTransitions'
import { loadStandardExpressionEffects, prepareSavedCharacterRenderer } from '../../characters/characterRenderer'
import { VideoStudioBoundedMemo } from '../../../../shared/videoStudioNext/boundedMemo'
import type { VideoStudioResourceBudget } from '../../../../shared/videoStudioNext/resourceBudget'
import { snapshotTrimmedGachaCanvas, type VideoGachaCanvasState } from './videoGachaCanvasFrame'

/** Resolve the same visible defaults as the ordinary character compositor. */
function visibleEffects(appearance: CustomizerFaceAppearance | undefined, effects: FaceExpressionEffects | undefined): FaceExpressionEffects {
  const disabled = { enabled: false, color: '#000000', opacity: 0, softness: .5, size: .1, offsetY: 0 }
  return {
    shadow: effects?.shadow ?? disabled,
    blush: effects?.blush ?? disabled,
    mouthBlush: appearance?.mouthBlushEnabled
      ? { softness: .78, size: .12, width: .12, height: .0624, rotation: 0, offsetY: 0, aspectRatio: .52, ...effects?.mouthBlush,
          color: appearance.mouthBlushColor ?? effects?.mouthBlush.color ?? '#e86388', opacity: appearance.mouthBlushOpacity ?? effects?.mouthBlush.opacity ?? .38, enabled: true }
      : { ...(effects?.mouthBlush ?? disabled), enabled: false, opacity: 0 }
  }
}

/**
 * A prepared renderer owns the body/pose, wardrobe, skin and front/back hair
 * canvases. The dynamic render(appearance, transforms, effects, mode) call
 * still draws eyes, independent PT pupils, mouth, blink and masks for each
 * requested state using the original exact character compositor.
 */
type PreparedGachaRenderer = Awaited<ReturnType<typeof prepareSavedCharacterRenderer>>

/** Session-local reader. No supplier, character, or timeline writes are exposed. */
export class TransitionRenderer {
  private readonly preparedStatic: VideoStudioBoundedMemo<PreparedGachaRenderer>

  constructor(
    private readonly assetProvider: VideoCharacterRenderAssetProvider = window.desktop,
    budget?: VideoStudioResourceBudget
  ) {
    this.preparedStatic = new VideoStudioBoundedMemo(
      8, 48 * 1024 * 1024,
      // Prepared body/wardrobe/front hair, two static composites and output.
      // Conservative retained estimate, NOT actual native/VRAM accounting.
      (prepared) => Math.max(1, prepared.width * prepared.height * 4 * 6),
      budget, 'artwork'
    )
  }

  private models = new Map<number, Promise<FabricatorProject | null>>()
  private poses = new Map<string, Promise<PoseArtwork | null>>()
  private components = new Map<string, Promise<FaceComponentAsset | null>>()
  private catalogs = new Map<string, Promise<FaceCatalogItem | null>>()
  private effects = new Map<number, Promise<Record<number, FaceExpressionEffects>>>()

  private model(slot: number) {
    if (!this.models.has(slot)) this.models.set(slot, this.assetProvider.loadFabricatorSlot(slot))
    return this.models.get(slot)!
  }
  private pose(slot: number, pose: number | null) {
    if (pose === null) return this.model(slot)
    const key = `${slot}:${pose}`
    if (!this.poses.has(key)) this.poses.set(key, this.assetProvider.loadFabricatorPose(slot, pose))
    return this.poses.get(key)!
  }
  private component(slot: number, id: string) {
    const key = `${slot}:${id}`
    if (!this.components.has(key)) this.components.set(key, this.assetProvider.loadFaceComponentAsset(slot, id))
    return this.components.get(key)!
  }
  private catalog(slot: number, id: string) {
    const key = `${slot}:${id}`
    if (!this.catalogs.has(key)) this.catalogs.set(key, this.assetProvider.loadFaceCatalogItem(slot, id))
    return this.catalogs.get(key)!
  }

  /** Base -> preset needs the actual supplier calibration, never an invented transform. */
  private async sourceTransform(key: string, appearance: CustomizerFaceAppearance | undefined): Promise<FaceTransform | undefined> {
    if (!appearance) return undefined
    if (key.startsWith('expression-component:')) {
      const part = key.slice('expression-component:'.length) as FaceComponentPartId
      const selection = appearance.components?.[part]
      if (selection?.transform) return selection.transform
      return selection?.assetId ? (await this.component(appearance.modelSlot, selection.assetId))?.defaultTransform : undefined
    }
    const [, category, id] = key.split(':')
    if (!id) return undefined
    const element = category.startsWith('mouth-') ? 'mouth' : category as FaceElementKind
    const targetId = element === 'mouth' ? appearance.mouthClosedCatalogId ?? id : id
    return appearance.transforms?.[element] ?? (await this.catalog(appearance.modelSlot, targetId))?.transforms[element]
  }

  private async normalizedTransforms(from: StudioFaceTransforms, to: StudioFaceTransforms, a: CustomizerFaceAppearance | undefined, b: CustomizerFaceAppearance | undefined) {
    const left = { ...from }, right = { ...to }
    for (const key of new Set([...Object.keys(from), ...Object.keys(to)])) {
      if (!from[key]?.sourceTransformOverride && !to[key]?.sourceTransformOverride) continue
      const av = from[key]?.sourceTransformOverride ?? await this.sourceTransform(key, a)
      const bv = to[key]?.sourceTransformOverride ?? await this.sourceTransform(key, b)
      if (!av || !bv) throw new Error('Uma referência facial da transição não está disponível no fornecedor.')
      left[key] = { ...(from[key] ?? { x: 0, y: 0, width: 100, height: 100, rotation: 0 }), sourceTransformOverride: av }
      right[key] = { ...(to[key] ?? { x: 0, y: 0, width: 100, height: 100, rotation: 0 }), sourceTransformOverride: bv }
    }
    return { left, right }
  }

  private async renderResult(transition: CharacterTransition, frame: number, character: CustomizerCharacter, directCanvas: boolean, signal?: AbortSignal): Promise<VideoGachaCanvasState> {
    signal?.throwIfAborted()
    const t = smoothProgress(transitionProgress(transition, frame))
    if (t <= 0) return transition.from
    if (t >= 1) return transition.to
    const a = transition.from.element, b = transition.to.element
    const slot = character.customization.modelSlot ?? 1
    const [source, fromPose, toPose] = await Promise.all([
      this.model(slot), this.pose(slot, a.poseSlot === undefined ? character.customization.poseSlot : a.poseSlot),
      this.pose(slot, b.poseSlot === undefined ? character.customization.poseSlot : b.poseSlot)
    ])
    signal?.throwIfAborted()
    if (!source || !fromPose || !toPose) throw new Error(`Uma pose de ${character.name} não está disponível para a animação.`)
    const aa = a.faceAppearance ?? character.customization.faceAppearance, ba = b.faceAppearance ?? character.customization.faceAppearance
    const appearance = aa && ba ? mixAppearance(aa, ba, t) : aa ?? ba
    const normalized = await this.normalizedTransforms(a.faceTransforms ?? {}, b.faceTransforms ?? {}, aa, ba)
    signal?.throwIfAborted()
    const transforms = mixStudioTransforms(normalized.left, normalized.right, t)
    if (!this.effects.has(slot)) this.effects.set(slot, loadStandardExpressionEffects(slot, this.assetProvider))
    const defaults = await this.effects.get(slot)!
    signal?.throwIfAborted()
    const effects = mixEffects(visibleEffects(aa, a.activeExpressionEffects ?? (aa ? defaults[aa.expressionIndex] : undefined)), visibleEffects(ba, b.activeExpressionEffects ?? (ba ? defaults[ba.expressionIndex] : undefined)), t)
    const element = mixStageElement(a, b, t)
    // Facial/blink/talk recipes pass the *same authored state* as both ends.
    // Preserve the source pose directly: do not remount the model, wardrobe
    // or hair for every 6-mouth-phase / eye-closed PNG. Real pose transitions
    // keep their old mixed-artwork path to preserve exact interpolation.
    const staticPose = transition.from === transition.to && fromPose === toPose
    const artwork = staticPose ? fromPose : mixPoseArtwork(fromPose, toPose, t)
    const copy: CustomizerCharacter = { ...character, customization: { ...character.customization, faceAppearance: appearance } }
    const renderer = staticPose
      ? await this.preparedStatic.getOrCreate(
          JSON.stringify([
            character.id, slot,
            a.poseSlot === undefined ? character.customization.poseSlot : a.poseSlot,
            // A legacy face set can pre-rasterize a particular expression
            // index, eye selection or palette into its base. Key the entire
            // authored appearance, not just setId, or PT eyes may bleed.
            appearance ?? null
          ]),
          () => prepareSavedCharacterRenderer(copy, { source, artwork, assetProvider: this.assetProvider })
        )
      : await prepareSavedCharacterRenderer(copy, { source, artwork, assetProvider: this.assetProvider })
    signal?.throwIfAborted()
    const mode = t < .5 ? a.activeFaceMode : b.activeFaceMode
    if (directCanvas) {
      // The prepared body/wardrobe/front-hair canvases are reused, while the
      // unchanged facial overlay draws dynamic mouth, blink and independent PT
      // pupils. Snapshot before the prepared rig is painted again.
      const rendered = await renderer.renderToCanvas(appearance, transforms, effects, mode)
      signal?.throwIfAborted()
      const snapshot = snapshotTrimmedGachaCanvas(rendered.canvas)
      const geometry = faceRenderGeometry(element, rendered, snapshot.crop, 1920, 1080)
      return {
        element: { ...element, ...geometry, faceAppearance: appearance, faceTransforms: transforms, activeExpressionEffects: effects },
        imageDataUrl: transition.from.imageDataUrl,
        canvasImage: snapshot.canvas
      }
    }
    const rendered = await renderer.render(appearance, transforms, effects, mode)
    signal?.throwIfAborted()
    const crop = await trimTransparentImage(rendered.dataUrl)
    signal?.throwIfAborted()
    const geometry = faceRenderGeometry(element, rendered, crop, 1920, 1080)
    return { element: { ...element, ...geometry, faceAppearance: appearance, faceTransforms: transforms, activeExpressionEffects: effects }, imageDataUrl: crop?.dataUrl ?? rendered.dataUrl }
  }

  /**
   * Existing DOM stage expects a PNG URL, but rasterize via the same Canvas
   * character compositor as export, then encode only the final cropped result.
   * On a Canvas-specific failure fall back to the established PNG implementation.
   * Abort is not an error fallback: never publish a stale request.
   */
  async renderPreview(transition: CharacterTransition, frame: number, character: CustomizerCharacter, signal?: AbortSignal): Promise<VideoCharacterState> {
    try {
      signal?.throwIfAborted()
      const state = await this.renderCanvas(transition, frame, character, signal)
      signal?.throwIfAborted()
      if (!state.canvasImage) return state
      const imageDataUrl = state.canvasImage.toDataURL('image/png')
      signal?.throwIfAborted()
      return { element: state.element, imageDataUrl }
    } catch (reason) {
      if (signal?.aborted) throw reason
      // A Canvas failure should not make already-editable projects unusable.
      return this.render(transition, frame, character, signal)
    }
  }

  render(transition: CharacterTransition, frame: number, character: CustomizerCharacter, signal?: AbortSignal): Promise<VideoCharacterState> {
    return this.renderResult(transition, frame, character, false, signal)
  }

  renderCanvas(transition: CharacterTransition, frame: number, character: CustomizerCharacter, signal?: AbortSignal): Promise<VideoGachaCanvasState> {
    return this.renderResult(transition, frame, character, true, signal)
  }

  preparedStats(): Readonly<{ entries: number; retainedBytes: number; maxEntries: number; maxBytes: number }> {
    return this.preparedStatic.stats()
  }

  clearPrepared(): void {
    this.preparedStatic.clear()
  }

  dispose(): void {
    this.preparedStatic.clear()
    this.models.clear()
    this.poses.clear()
    this.components.clear()
    this.catalogs.clear()
    this.effects.clear()
  }
}

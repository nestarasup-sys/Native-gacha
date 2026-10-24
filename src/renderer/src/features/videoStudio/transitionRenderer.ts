import type { CustomizerCharacter, CustomizerFaceAppearance, FaceComponentPartId } from '../../../../shared/customizer'
import type { FaceCatalogItem, FaceComponentAsset, FaceElementKind, FaceExpressionEffects, FaceTransform, FabricatorProject } from '../../../../shared/fabricator'
import type { StudioFaceTransforms, VideoCharacterState } from '../../../../shared/studio'
import type { VideoCharacterRenderAssetProvider } from '../../../../shared/videoCharacterRenderAssets'
import { faceRenderGeometry, trimTransparentImage } from './characterGeometry'
import { mixAppearance, mixEffects, mixPoseArtwork, mixStageElement, mixStudioTransforms, smoothProgress, transitionProgress, type PoseArtwork } from '../../../../shared/videoCharacterInterpolation'
import type { CharacterTransition } from './characterTransitions'
import { loadStandardExpressionEffects, prepareSavedCharacterRenderer, type GachaReusableMaterialCache } from '../../characters/characterRenderer'
import { VideoStudioBoundedMemo } from '../../../../shared/videoStudioNext/boundedMemo'
import type { VideoStudioResourceBudget } from '../../../../shared/videoStudioNext/resourceBudget'
import { snapshotTrimmedGachaCanvas, snapshotTrimmedPreviewGachaCanvas, type VideoGachaCanvasState } from './videoGachaCanvasFrame'

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
  private preparedCacheHits = 0
  private preparedCacheMisses = 0
  // Shared by Canvas preview AND the export-surface TransitionRenderer:
  // selected hair/outfit manifests load once per actor revision, while each
  // mixed pose continues to validate/draw the exact original bone geometry.
  private readonly reusableMaterials: GachaReusableMaterialCache = new Map()
  /**
   * Hidden opt-in only. The default editor keeps the exact Canvas composer.
   * Once PixiJS is shown to differ for any character, never retry that actor
   * in this editing session; avoid flicker/ghosting from backend oscillation.
   */
  private readonly experimentalGpu = new Map<string, Promise<{
    width: number
    height: number
    surface: import('./pixiGachaLayerSurface').PixiGachaLayerSurface
  }>>()
  private readonly disabledExperimentalGpu = new Set<string>()
  private readonly articulatedGpu = new Map<string, {
    identity: string
    from: PoseArtwork
    to: PoseArtwork
    promise: Promise<import('./pixiGachaArticulatedSession').PixiGachaArticulatedSession>
  }>()
  private readonly gpuDrawQueues = new Map<string, Promise<void>>()
  private gpuGeneration = 0

  private gpuPreviewEnabled(): boolean {
    // Deliberately no project setting, layout change or persisted preference.
    // A developer can enable this during local parity experiments through
    // window.__NATIVE_GACHA_GPU_PREVIEW_EXPERIMENTAL__ = true in devtools.
    return typeof window !== 'undefined'
      && (window as Window & { __NATIVE_GACHA_GPU_PREVIEW_EXPERIMENTAL__?: boolean })
        .__NATIVE_GACHA_GPU_PREVIEW_EXPERIMENTAL__ === true
  }

  /**
   * Report what ACTUALLY rendered, not just the ON position of the toggle.
   * In particular a fail-closed Canvas fallback must be visible to the user.
   * This event is per Electron renderer window, never written to a project.
   */
  private reportGpuPreview(kind: 'active' | 'fallback', error?: unknown): void {
    if (!this.gpuPreviewEnabled()
      || typeof window.dispatchEvent !== 'function'
      || typeof CustomEvent !== 'function') return
    const message = error instanceof Error ? error.message : String(error ?? '')
    let reason: string | undefined
    if (kind === 'fallback') {
      reason = /diverg|diferença|pixels|paridade|Canvas original/i.test(message)
        ? 'A imagem da GPU ficou diferente da original.'
        : /context|contexto|webgl|perdido|lost/i.test(message)
          ? 'O contexto WebGL/GPU não está disponível.'
          : /textura|texture|asset|imagem/i.test(message)
            ? 'Não foi possível preparar uma textura do personagem.'
            : /dimens|tamanho|resoluç/i.test(message)
              ? 'A resolução do personagem não é compatível com a superfície GPU.'
              : 'O renderizador GPU não conseguiu desenhar este personagem.'
    }
    window.dispatchEvent(new CustomEvent('native-gacha-pixi-preview-status', {
      detail: { kind, reason },
    }))
  }

  private async drawExperimentalGpu(
    characterId: string,
    renderer: PreparedGachaRenderer,
    appearance: CustomizerFaceAppearance | undefined,
    transforms: StudioFaceTransforms,
    effects: FaceExpressionEffects,
    mode: VideoCharacterState['element']['activeFaceMode'],
  ): Promise<HTMLCanvasElement | null> {
    if (!this.gpuPreviewEnabled() || this.disabledExperimentalGpu.has(characterId)) return null
    // One prepared Gacha face layer is mutable. Do not allow two concurrent
    // transition requests to paint that canvas while the previous GPU upload
    // is still in progress. Serialize per actor, not globally.
    const generation = this.gpuGeneration
    const previous = this.gpuDrawQueues.get(characterId) ?? Promise.resolve()
    const next = previous.then(async (): Promise<HTMLCanvasElement | null> => {
      if (generation !== this.gpuGeneration || this.disabledExperimentalGpu.has(characterId)) return null
      try {
        const layers = await renderer.renderLayersToCanvas(appearance, transforms, effects, mode)
        if (generation !== this.gpuGeneration) return null
        let active = this.experimentalGpu.get(characterId)
        if (active) {
          const existing = await active
          if (existing.width !== layers.outputWidth || existing.height !== layers.outputHeight) {
            existing.surface.dispose()
            this.experimentalGpu.delete(characterId)
            active = undefined
          }
        }
        if (!active) {
          active = import('./pixiGachaLayerSurface').then(async ({ PixiGachaLayerSurface }) => ({
            width: layers.outputWidth, height: layers.outputHeight,
            surface: await PixiGachaLayerSurface.create(layers.outputWidth, layers.outputHeight),
          }))
          this.experimentalGpu.set(characterId, active)
        }
        const current = await active
        if (generation !== this.gpuGeneration) return null
        const gpu = current.surface.render(layers)
        // The Pixi backing canvas is reused by the next frame. Snapshot it
        // *while this actor's queue is held* before the next request can
        // overwrite its pixels. Preview crop can then safely run async.
        const stable = document.createElement('canvas')
        stable.width = gpu.width
        stable.height = gpu.height
        const context = stable.getContext('2d')
        if (!context) throw new Error('Não foi possível capturar o frame GPU Gacha.')
        context.drawImage(gpu, 0, 0)
        if (generation === this.gpuGeneration) this.reportGpuPreview('active')
        return stable
      } catch (error) {
        if (generation !== this.gpuGeneration) return null
        this.reportGpuPreview('fallback', error)
        this.disabledExperimentalGpu.add(characterId)
        const failed = this.experimentalGpu.get(characterId)
        this.experimentalGpu.delete(characterId)
        if (failed) void failed.then(({ surface }) => surface.dispose()).catch(() => {})
        return null
      }
    })
    // Rejection does not poison following queued frames. All stale work is
    // dropped when clearPrepared/dispose increments the session generation.
    const settled = next.then(() => undefined, () => undefined)
    this.gpuDrawQueues.set(characterId, settled)
    void settled.then(() => {
      if (this.gpuDrawQueues.get(characterId) === settled) this.gpuDrawQueues.delete(characterId)
    })
    return next
  }

  /**
   * Real pose-changing path: load skin/wardrobe/hair textures once and let
   * WebGL move them with the body bones. The legacy compositor is used only
   * when the pixel admission gate refuses a frame or the GPU is unavailable.
   */
  private async drawExperimentalArticulatedGpu(
    character: CustomizerCharacter, source: FabricatorProject,
    from: PoseArtwork, to: PoseArtwork, intermediate: PoseArtwork,
    appearance: CustomizerFaceAppearance | undefined,
    transforms: StudioFaceTransforms, effects: FaceExpressionEffects,
    mode: VideoCharacterState['element']['activeFaceMode'],
  ): Promise<HTMLCanvasElement | null> {
    const id = character.id
    if (!this.gpuPreviewEnabled() || this.disabledExperimentalGpu.has(id)) return null
    const generation = this.gpuGeneration
    const previous = this.gpuDrawQueues.get(id) ?? Promise.resolve()
    const task = previous.then(async (): Promise<HTMLCanvasElement | null> => {
      if (generation !== this.gpuGeneration || this.disabledExperimentalGpu.has(id)) return null
      try {
        const identity = JSON.stringify([character.id,character.updatedAt,character.customization,
          from.layerOrder,to.layerOrder])
        let cached = this.articulatedGpu.get(id)
        if (cached && (cached.identity !== identity || cached.from !== from || cached.to !== to)) {
          void cached.promise.then(instance => instance.dispose()).catch(()=>{})
          this.articulatedGpu.delete(id)
          cached = undefined
        }
        if (!cached) {
          const promise = import('./pixiGachaArticulatedSession').then(
            ({ PixiGachaArticulatedSession }) =>
              PixiGachaArticulatedSession.create(character,source,from,to,this.assetProvider))
          cached={identity,from,to,promise}
          this.articulatedGpu.set(id,cached)
        }
        const session=await cached.promise
        if (generation !== this.gpuGeneration) return null
        const gpu=await session.render(intermediate,appearance,transforms,effects,mode)
        if (generation !== this.gpuGeneration) return null
        // Capture *while this actor queue is held*; the next face paint must
        // not overwrite a previous timeline frame before crop/snapshot.
        const stable=document.createElement('canvas')
        stable.width=gpu.width; stable.height=gpu.height
        const context=stable.getContext('2d')
        if (!context) throw new Error('Não foi possível capturar a pose articulada GPU.')
        context.drawImage(gpu,0,0)
        if (generation === this.gpuGeneration) this.reportGpuPreview('active')
        return stable
      } catch (error) {
        if (generation !== this.gpuGeneration) return null
        this.reportGpuPreview('fallback', error)
        this.disabledExperimentalGpu.add(id)
        const pending=this.articulatedGpu.get(id)
        this.articulatedGpu.delete(id)
        if (pending) void pending.promise.then(instance=>instance.dispose()).catch(()=>{})
        return null
      }
    })
    const settled=task.then(()=>undefined,()=>undefined)
    this.gpuDrawQueues.set(id,settled)
    void settled.then(()=>{
      if(this.gpuDrawQueues.get(id)===settled)this.gpuDrawQueues.delete(id)
    })
    return task
  }


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

  private async renderResult(transition: CharacterTransition, frame: number, character: CustomizerCharacter, directCanvas: boolean, signal?: AbortSignal, previewCrop = false): Promise<VideoGachaCanvasState> {
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
    // A facial-preset change has two *different authored states* but one
    // identical body pose. Preparing the entire body/wardrobe/hair for every
    // facial interpolation sample wastes almost the whole 15-frame window.
    // Keep the prepared body fixed and pass interpolated face data only to
    // renderToCanvas. Legacy pre-rasterized faces still switch their exact
    // authored baseline at the discrete midpoint (at most two baselines).
    const staticPose = fromPose === toPose
    const artwork = staticPose ? fromPose : mixPoseArtwork(fromPose, toPose, t)
    const baseAppearance = staticPose ? (t < .5 ? aa : ba) : appearance
    const copy: CustomizerCharacter = { ...character, customization: { ...character.customization, faceAppearance: baseAppearance } }
    const mode = t < .5 ? a.activeFaceMode : b.activeFaceMode
    // The default continues through the canonical Canvas renderer.
    // GPU opt-in bypasses prepareSavedCharacterRenderer PER INTERMEDIATE POSE:
    // skin, fitted garments and hair are transformed as persistent sprites.
    // Legacy face sets which bake expression pixels need the old path.
    if (!staticPose && directCanvas && previewCrop
      && (aa?.setId ?? null) === (ba?.setId ?? null)) {
      const accelerated = await this.drawExperimentalArticulatedGpu(
        character,source,fromPose,toPose,artwork,appearance,transforms,effects,mode)
      if (accelerated) {
        signal?.throwIfAborted()
        const snapshot = await snapshotTrimmedPreviewGachaCanvas(accelerated,signal)
        const geometry = faceRenderGeometry(element,
          {width:accelerated.width,height:accelerated.height},
          snapshot.crop,1920,1080)
        return {element:{...element,...geometry,faceAppearance:appearance,faceTransforms:transforms,
          activeExpressionEffects:effects},imageDataUrl:transition.from.imageDataUrl,canvasImage:snapshot.canvas}
      }
    }
    const preparedKey = JSON.stringify([
            character.id, character.updatedAt, slot,
            a.poseSlot === undefined ? character.customization.poseSlot : a.poseSlot,
            // A legacy face can be baked into the prepared body. Base identity
            // MUST remain exact; fractional interpolations are dynamic only.
            baseAppearance ?? null
          ])
    if (staticPose) {
      if (this.preparedStatic.has(preparedKey)) this.preparedCacheHits += 1
      else this.preparedCacheMisses += 1
    }
    const renderer = staticPose
      ? await this.preparedStatic.getOrCreate(
          preparedKey,
          () => prepareSavedCharacterRenderer(copy, { source, artwork, assetProvider: this.assetProvider,
            materialCache: this.reusableMaterials })
        )
      : await prepareSavedCharacterRenderer(copy, { source, artwork, assetProvider: this.assetProvider,
          materialCache: this.reusableMaterials })
    signal?.throwIfAborted()
    if (directCanvas) {
      // The prepared body/wardrobe/front-hair canvases are reused, while the
      // unchanged facial overlay draws dynamic mouth, blink and independent PT
      // pupils. Snapshot before the prepared rig is painted again.
      const gpuCanvas = previewCrop
        ? await this.drawExperimentalGpu(character.id, renderer, appearance, transforms, effects, mode)
        : null
      const rendered = gpuCanvas
        ? { canvas: gpuCanvas, width: renderer.width, height: renderer.height }
        : await renderer.renderToCanvas(appearance, transforms, effects, mode)
      signal?.throwIfAborted()
      const snapshot = previewCrop
        ? await snapshotTrimmedPreviewGachaCanvas(rendered.canvas, signal)
        : snapshotTrimmedGachaCanvas(rendered.canvas)
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
   * The DOM preview accepts the SAME cropped Canvas snapshot as the export.
   * No PNG encode, Image decode or dataURL round-trip per transition frame.
   * Retain legacy PNG fallback for Canvas-incompatible character assets only.
   */
  async renderPreview(transition: CharacterTransition, frame: number, character: CustomizerCharacter, signal?: AbortSignal): Promise<VideoGachaCanvasState> {
    try {
      signal?.throwIfAborted()
      const state = await this.renderResult(transition, frame, character, true, signal, true)
      signal?.throwIfAborted()
      return state
    } catch (reason) {
      if (signal?.aborted) throw reason
      return this.render(transition, frame, character, signal)
    }
  }

  render(transition: CharacterTransition, frame: number, character: CustomizerCharacter, signal?: AbortSignal): Promise<VideoCharacterState> {
    return this.renderResult(transition, frame, character, false, signal)
  }

  renderCanvas(transition: CharacterTransition, frame: number, character: CustomizerCharacter, signal?: AbortSignal): Promise<VideoGachaCanvasState> {
    return this.renderResult(transition, frame, character, true, signal)
  }

  preparedStats(): Readonly<{ entries: number; retainedBytes: number; maxEntries: number; maxBytes: number; hits: number; misses: number }> {
    return { ...this.preparedStatic.stats(), hits: this.preparedCacheHits, misses: this.preparedCacheMisses }
  }

  clearPrepared(): void {
    this.gpuGeneration++
    this.preparedStatic.clear()
    this.reusableMaterials.clear()
    this.gpuDrawQueues.clear()
    for (const {promise} of this.articulatedGpu.values()) {
      void promise.then(instance=>instance.dispose()).catch(()=>{})
    }
    this.articulatedGpu.clear()
    for (const pending of this.experimentalGpu.values()) {
      void pending.then(({ surface }) => surface.dispose()).catch(() => {})
    }
    this.experimentalGpu.clear()
    this.disabledExperimentalGpu.clear()
  }

  dispose(): void {
    this.clearPrepared()
    this.models.clear()
    this.poses.clear()
    this.components.clear()
    this.catalogs.clear()
    this.effects.clear()
  }
}

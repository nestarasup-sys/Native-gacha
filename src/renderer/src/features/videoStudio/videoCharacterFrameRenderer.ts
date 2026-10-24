import type { StudioElement, StudioFaceMode, StudioFaceTransform, StudioFaceTransforms, VideoCharacterState } from '../../../../shared/studio'
import { resolveStudioTalkMouthId } from '../../../../shared/studio'
import type { VideoSceneFrame } from '../../../../shared/videoSceneIR'
import type { VideoExportCharacterSnapshot } from '../../../../shared/videoExportCharacters'
import type { FaceCatalogItemSummary } from '../../../../shared/fabricator'
import { characterFromVideoExportSnapshot } from '../../../../shared/videoExportCharacters'
import type { VideoCharacterRenderAssetProvider, VideoCharacterRenderAssetSnapshot } from '../../../../shared/videoCharacterRenderAssets'
import { createVideoCharacterRenderSnapshotProvider } from '../../../../shared/videoCharacterRenderAssets'
import { TransitionRenderer } from './transitionRenderer'
import { VideoStudioBoundedMemo } from '../../../../shared/videoStudioNext/boundedMemo'
import { VideoStudioRasterAdmission } from '../../../../shared/videoStudioNext/rasterAdmission'
import type { VideoStudioResourceBudget } from '../../../../shared/videoStudioNext/resourceBudget'
import type { VideoGachaCanvasState } from './videoGachaCanvasFrame'

const DEFAULT_FACE_TRANSFORM: StudioFaceTransform = { x: 0, y: 0, width: 100, height: 100, rotation: 0 }
const TALK_SCALES = [
  { width: 1, height: 1 },
  { width: 1.14, height: 1 },
  { width: 1.14, height: 1.12 },
  { width: 1.28, height: 1.12 },
  { width: 1.14, height: 1.12 },
  { width: 1.14, height: 1 },
] as const

function faceModeForElement(element: StudioElement): StudioFaceMode {
  if (element.activeFaceMode) return element.activeFaceMode
  if (element.faceAppearance?.eyeState === 2) return 'blink'
  if (element.faceAppearance?.mouthOpen) return 'talk'
  return 'idle'
}

export class VideoCharacterFrameRenderer {
  private readonly provider: VideoCharacterRenderAssetProvider
  private readonly transitionRenderer: TransitionRenderer
  private readonly cache: VideoStudioBoundedMemo<VideoGachaCanvasState>
  private readonly admission: VideoStudioRasterAdmission
  private readonly stateIds = new WeakMap<object, number>()
  private nextStateId = 0
  private readonly faceCatalogs = new Map<number, Promise<FaceCatalogItemSummary[]>>()

  constructor(
    private readonly characters: VideoExportCharacterSnapshot,
    characterAssets: VideoCharacterRenderAssetSnapshot,
    budget?: VideoStudioResourceBudget
  ) {
    this.provider = createVideoCharacterRenderSnapshotProvider(characterAssets)
    this.transitionRenderer = new TransitionRenderer(this.provider, budget)
    this.cache = new VideoStudioBoundedMemo(
      240, 64 * 1024 * 1024,
      (state) => state.canvasImage
        ? state.canvasImage.width * state.canvasImage.height * 4
        : Math.max(1, state.imageDataUrl.length * 2),
      budget, 'artwork'
    )
    this.admission = new VideoStudioRasterAdmission(budget, 16 * 1024 * 1024, 8, () => this.cache.clear())
  }

  private stateId(state: VideoCharacterState): number {
    const object = state as object
    let id = this.stateIds.get(object)
    if (!id) { id = ++this.nextStateId; this.stateIds.set(object, id) }
    return id
  }

  private remember(key: string, create: () => Promise<VideoGachaCanvasState>): Promise<VideoGachaCanvasState> {
    return this.cache.getOrCreate(key, () => this.admission.run(create))
  }

  private transitionKey(frame: VideoSceneFrame, elementId: string, startFrame: number, boundaryFrame: number): string {
    return `transition:${frame.variant}:${elementId}:${startFrame}:${boundaryFrame}:${frame.frame}`
  }

  private renderTransition(
    frame: VideoSceneFrame,
    character: VideoSceneFrame['characters'][number],
    directCanvas: boolean,
  ): Promise<VideoGachaCanvasState> {
    const transition = character.transition
    if (!transition) throw new Error('Transição ausente no frame solicitado.')
    const key = `${directCanvas ? 'canvas:' : 'png:'}${this.transitionKey(frame, character.elementId, transition.startFrame, transition.boundaryFrame)}`
    return this.remember(key, async () => {
      const source = characterFromVideoExportSnapshot(this.characters, transition.from.element.characterId ?? '')
      const rendered = await this.transitionRenderer[directCanvas ? 'renderCanvas' : 'render']({
        elementId: character.elementId,
        startFrame: transition.startFrame,
        boundaryFrame: transition.boundaryFrame,
        from: transition.from,
        to: transition.to,
      }, frame.frame, source)
      return character.stageTransform
        ? { ...rendered, element: { ...rendered.element, ...character.stageTransform } }
        : rendered
    })
  }

  /** Render one authored state through the exact character renderer without interpolating artwork. */
  /**
   * An export may contain thousands of automatic-mouth frames for one model.
   * The pinned face catalog is immutable for the duration of that job: do
   * not repeat a provider request on all six phases of every talk cycle.
   */
  private faceCatalogForSlot(slot: number): Promise<FaceCatalogItemSummary[]> {
    let pending = this.faceCatalogs.get(slot)
    if (!pending) {
      pending = this.provider.listFaceCatalog(slot)
      this.faceCatalogs.set(slot, pending)
      void pending.catch(() => {
        if (this.faceCatalogs.get(slot) === pending) this.faceCatalogs.delete(slot)
      })
    }
    return pending
  }

  private renderFaceState(state: VideoCharacterState, mode: StudioFaceMode, transforms: StudioFaceTransforms, recipe: string, directCanvas: boolean): Promise<VideoGachaCanvasState> {
    const characterId = state.element.characterId
    if (!characterId) throw new Error('Estado de personagem sem characterId.')
    const source = characterFromVideoExportSnapshot(this.characters, characterId)
    const element = { ...state.element, faceTransforms: transforms, activeFaceMode: mode }
    const synthetic: VideoCharacterState = { element, imageDataUrl: state.imageDataUrl }
    const key = `${directCanvas ? 'canvas:' : 'png:'}face:${this.stateId(state)}:${mode}:${recipe}`
    return this.remember(key, () => this.transitionRenderer[directCanvas ? 'renderCanvas' : 'render']({
      elementId: element.id,
      startFrame: 0,
      boundaryFrame: 2,
      from: synthetic,
      to: synthetic,
    }, 1, source))
  }

  private renderBlink(state: VideoCharacterState, directCanvas: boolean): Promise<VideoGachaCanvasState> {
    if (faceModeForElement(state.element) !== 'idle' || !state.element.faceAppearance) return Promise.resolve(state)
    return this.renderFaceState(state, 'blink', state.element.faceTransforms ?? {}, 'blink', directCanvas)
      .catch(() => state) // Preview also treats a missing closed-eye asset as an optional effect.
  }

  private async renderMouth(state: VideoCharacterState, frame: number, speechStartFrame: number, mode: 'talk' | 'idle', directCanvas: boolean): Promise<VideoGachaCanvasState> {
    const appearance = state.element.faceAppearance
    if (!appearance) return state
    if (mode !== 'talk') return this.renderFaceState(state, 'idle', state.element.faceTransforms ?? {}, 'idle', directCanvas).catch(() => state)
    const characterId = state.element.characterId
    if (!characterId) return state
    const character = characterFromVideoExportSnapshot(this.characters, characterId)
    const modelSlot = character.customization.modelSlot ?? 1
    const faceItems = await this.faceCatalogForSlot(modelSlot)
    const openMouthId = resolveStudioTalkMouthId(appearance, faceItems.filter((item) => item.modelSlot === modelSlot))
    const saved = state.element.faceTransforms ?? {}
    const closedMouthId = appearance.mouthClosedCatalogId
    const mouth = saved.mouth
      ?? (closedMouthId ? saved[`mouth-closed:${closedMouthId}`] : undefined)
      ?? (openMouthId ? saved[`mouth-open:${openMouthId}`] : undefined)
      ?? saved['mouth-open']
      ?? DEFAULT_FACE_TRANSFORM
    const cycleFrames = TALK_SCALES.length * 6
    const phase = Math.max(0, frame - speechStartFrame) % cycleFrames
    const index = Math.floor(phase / 6) % TALK_SCALES.length
    const scale = TALK_SCALES[index]
    const transforms = scale.width === 1 && scale.height === 1
      ? saved
      : { ...saved, mouth: { ...mouth, width: mouth.width * scale.width, height: mouth.height * scale.height } }
    return this.renderFaceState(state, 'talk', transforms, `talk:${index}`, directCanvas).catch(() => state)
  }

  /** Resolve pixel-ready character states for one absolute frame using the same renderer recipes as the preview. */
  async renderFrame(frame: VideoSceneFrame, directCanvas = false): Promise<ReadonlyMap<string, VideoGachaCanvasState>> {
    const states = new Map<string, VideoGachaCanvasState>()
    for (const character of frame.characters) {
      if (character.hidden || !character.authoredState) continue
      if (character.transition) {
        states.set(character.elementId, await this.renderTransition(frame, character, directCanvas))
        continue
      }
      if (character.automaticMouth) {
        states.set(character.elementId, await this.renderMouth(
          character.authoredState,
          frame.frame,
          character.automaticMouth.speechStartFrame,
          character.automaticMouth.mode,
          directCanvas,
        ))
        continue
      }
      if (character.automaticBlink) {
        states.set(character.elementId, await this.renderBlink(character.authoredState, directCanvas))
        continue
      }
      states.set(character.elementId, character.authoredState)
    }
    return states
  }

  clear(): void {
    this.cache.clear()
    this.faceCatalogs.clear()
    this.transitionRenderer.clearPrepared()
  }

  dispose(): void {
    this.admission.dispose()
    this.cache.clear()
    this.faceCatalogs.clear()
    this.transitionRenderer.dispose()
  }
}

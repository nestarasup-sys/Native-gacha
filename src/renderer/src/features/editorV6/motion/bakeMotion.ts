import type { CharacterRenderAssetProvider } from '../../../../../shared/characterRenderAssets'
import type { FaceComponentPartId } from '../../../../../shared/customizer'
import type { FaceElementKind, FaceTransform } from '../../../../../shared/fabricator'
import type { EditorV6Element, EditorV6FaceRenderMode, EditorV6FaceTransform } from '../../../../../shared/editorV6'
import type { EditorV6MotionBakeRequest, EditorV6MotionBakeResult, EditorV6MotionFrame } from '../../../../../shared/editorV6Motion'
import { editorV6FaceModeDuringMotion } from '../../../../../shared/editorV6FaceSchedule'
import { interpolateEditorV6Face, interpolateEditorV6Pose, motionAngle, motionEase, motionLerp } from '../../../../../shared/editorV6MotionInterpolation'
import { loadStandardExpressionEffects, prepareSavedCharacterRenderer, type GachaReusableMaterialCache, type PreparedGachaLayerFrame } from '../../../characters/editorV6CharacterRenderer'
import { chooseMotionAtlasLayout } from './motionAtlasLayout'
import { createMotionPoseResolver } from './motionPoseResolver'
import { motionEndpointScale } from './motionEndpointScale'

type Renderer = Awaited<ReturnType<typeof prepareSavedCharacterRenderer>>
type Crop = { left: number; top: number; width: number; height: number; fingerprint?: number }
type CroppedMotionLayers = { behindFace: HTMLCanvasElement; face: HTMLCanvasElement; inFrontOfFace: HTMLCanvasElement | null }
type MotionFrameRender = { canvas: HTMLCanvasElement; width: number; height: number; crop: Crop; renderer: Renderer; layers?: PreparedGachaLayerFrame; mouthCanvas?: HTMLCanvasElement; mouthCrop?: Crop; dispose: () => void }
type BakedBodySample = { canvas: HTMLCanvasElement; crop: Crop; layers?: CroppedMotionLayers }
type PixelBounds = { left: number; top: number; right: number; bottom: number }
type BakedFacePatch = { index: number; canvas: HTMLCanvasElement; left: number; top: number; width: number; height: number; crop: Crop; changed?: PixelBounds; replace?: boolean; replaceBounds?: { x: number; y: number; width: number; height: number } }
export type EditorV6MotionLayerAtlasCapture = {
  frames: Array<Pick<EditorV6MotionFrame, 'offset' | 'sprite' | 'x' | 'y' | 'width' | 'height' | 'rotation' | 'flipX'> & { crop: Omit<Crop, 'fingerprint'>; facePatch?: EditorV6MotionFrame['facePatch'] }>
  behindFace: HTMLCanvasElement
  face: HTMLCanvasElement
  inFrontOfFace: HTMLCanvasElement | null
}
function cropPreparedLayer(source: HTMLCanvasElement, layers: PreparedGachaLayerFrame, crop: Crop): HTMLCanvasElement {
  const canvas = document.createElement('canvas'); canvas.width = crop.width; canvas.height = crop.height
  const context = canvas.getContext('2d')
  if (!context) throw Error('Não foi possível preparar uma camada de cabelo durante a pose.')
  context.translate(-crop.left, -crop.top)
  context.translate(layers.outputWidth / 2, layers.outputHeight / 2)
  context.scale(layers.shapeScaleX, layers.shapeScaleY)
  context.drawImage(source, -layers.width / 2, -layers.height / 2)
  return canvas
}
function cropPreparedLayers(layers: PreparedGachaLayerFrame, crop: Crop): CroppedMotionLayers {
  return {
    behindFace: cropPreparedLayer(layers.behindFace, layers, crop),
    face: cropPreparedLayer(layers.face, layers, crop),
    inFrontOfFace: layers.inFrontOfFace ? cropPreparedLayer(layers.inFrontOfFace, layers, crop) : null
  }
}
function disposeCroppedLayers(layers?: CroppedMotionLayers): void {
  if (!layers) return
  layers.behindFace.width = layers.behindFace.height = 1
  layers.face.width = layers.face.height = 1
  if (layers.inFrontOfFace) layers.inFrontOfFace.width = layers.inFrontOfFace.height = 1
}
function changedBounds(reference: Uint8ClampedArray, next: Uint8ClampedArray, width: number, height: number): PixelBounds | undefined {
  let left = width, right = -1, top = height, bottom = -1
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const offset = (y * width + x) * 4
    if (!pixelChanged(reference, next, offset)) continue
    left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y)
  }
  return right < left ? undefined : { left, top, right, bottom }
}
function pixelChanged(reference: Uint8ClampedArray, next: Uint8ClampedArray, offset: number): boolean {
  return pixelChangedAt(reference, offset, next, offset)
}
function pixelChangedAt(reference: Uint8ClampedArray, referenceOffset: number, next: Uint8ClampedArray, nextOffset: number): boolean {
  return reference[referenceOffset] !== next[nextOffset] || reference[referenceOffset + 1] !== next[nextOffset + 1]
    || reference[referenceOffset + 2] !== next[nextOffset + 2] || reference[referenceOffset + 3] !== next[nextOffset + 3]
}
/** Store the complete RGBA rectangle and real source pixels as a texture gutter for clean resampling. */
function changedPixelPatch(source: HTMLCanvasElement, bounds: PixelBounds): HTMLCanvasElement {
  const patchWidth = bounds.right - bounds.left + 1, patchHeight = bounds.bottom - bounds.top + 1
  const gutter = 2, patch = document.createElement('canvas'); patch.width = patchWidth + gutter * 2; patch.height = patchHeight + gutter * 2
  const sourceContext = source.getContext('2d', { willReadFrequently: true })!, sourceLeft = Math.max(0, bounds.left - gutter), sourceTop = Math.max(0, bounds.top - gutter)
  const sourceRight = Math.min(source.width, bounds.right + gutter + 1), sourceBottom = Math.min(source.height, bounds.bottom + gutter + 1)
  const sourcePixels = sourceContext.getImageData(sourceLeft, sourceTop, sourceRight - sourceLeft, sourceBottom - sourceTop).data
  const sourceWidth = sourceRight - sourceLeft, context = patch.getContext('2d')!, pixels = context.createImageData(patch.width, patch.height)
  for (let y = 0; y < patch.height; y++) for (let x = 0; x < patch.width; x++) {
    const sourceX = Math.max(sourceLeft, Math.min(sourceRight - 1, bounds.left + x - gutter))
    const sourceY = Math.max(sourceTop, Math.min(sourceBottom - 1, bounds.top + y - gutter))
    const sourceOffset = ((sourceY - sourceTop) * sourceWidth + sourceX - sourceLeft) * 4, targetOffset = (y * patch.width + x) * 4
    pixels.data[targetOffset] = sourcePixels[sourceOffset]; pixels.data[targetOffset + 1] = sourcePixels[sourceOffset + 1]
    pixels.data[targetOffset + 2] = sourcePixels[sourceOffset + 2]; pixels.data[targetOffset + 3] = sourcePixels[sourceOffset + 3]
  }
  context.putImageData(pixels, 0, 0)
  return patch
}
function normalizedReplacementBounds(changed: PixelBounds, patch: PixelBounds, padding = 2) {
  const left = Math.max(patch.left, changed.left - padding), top = Math.max(patch.top, changed.top - padding)
  const right = Math.min(patch.right, changed.right + padding), bottom = Math.min(patch.bottom, changed.bottom + padding)
  const width = patch.right - patch.left + 1, height = patch.bottom - patch.top + 1
  return { x: (left - patch.left) / width, y: (top - patch.top) / height,
    width: (right - left + 1) / width, height: (bottom - top + 1) / height }
}
function unionBounds(current: PixelBounds | undefined, next: PixelBounds): PixelBounds {
  return current ? { left: Math.min(current.left, next.left), top: Math.min(current.top, next.top), right: Math.max(current.right, next.right), bottom: Math.max(current.bottom, next.bottom) } : next
}
function cropOf(canvas: HTMLCanvasElement, fingerprint = false, alphaThreshold = 8): Crop {
  const pixels = canvas.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, canvas.width, canvas.height).data
  let left = canvas.width, right = -1, top = canvas.height, bottom = -1
  let hash = 2166136261
  for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
    const offset = (y * canvas.width + x) * 4
    if (pixels[offset + 3] > alphaThreshold) { left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y) }
    if (fingerprint) for (let channel = 0; channel < 4; channel++) hash = Math.imul(hash ^ pixels[offset + channel], 16777619)
  }
  if (right < left) return { left: 0, top: 0, width: 1, height: 1, ...(fingerprint ? { fingerprint: hash >>> 0 } : {}) }
  return { left, top, width: right - left + 1, height: bottom - top + 1, ...(fingerprint ? { fingerprint: hash >>> 0 } : {}) }
}
function alphaPatchCanvas(source: HTMLCanvasElement, bounds: Crop, gutter = 2): HTMLCanvasElement {
  const patch = document.createElement('canvas')
  patch.width = bounds.width + gutter * 2; patch.height = bounds.height + gutter * 2
  const context = patch.getContext('2d')
  if (!context) throw Error('Não foi possível preparar o recorte transparente da boca.')
  // The gutter stays transparent so bilinear sampling cannot pull neighboring
  // atlas frames into the antialiased mouth edge.
  context.drawImage(source, bounds.left, bounds.top, bounds.width, bounds.height, gutter, gutter, bounds.width, bounds.height)
  return patch
}
function croppedCanvas(source: HTMLCanvasElement, bounds: Crop): HTMLCanvasElement {
  const crop = document.createElement('canvas'); crop.width = bounds.width; crop.height = bounds.height
  const context = crop.getContext('2d')
  if (!context) throw Error('Não foi possível preparar a base do personagem sem boca.')
  context.drawImage(source, bounds.left, bounds.top, bounds.width, bounds.height, 0, 0, bounds.width, bounds.height)
  return crop
}
function unionCrop(left: Crop, right: Crop): Crop {
  const x = Math.min(left.left, right.left), y = Math.min(left.top, right.top)
  const rightEdge = Math.max(left.left + left.width, right.left + right.width), bottomEdge = Math.max(left.top + left.height, right.top + right.height)
  return { left: x, top: y, width: rightEdge - x, height: bottomEdge - y }
}
function isBlinkUnavailable(error: unknown): boolean {
  return error instanceof Error && /Blink precisa|olho fechado correspondente|Selecione olhos do catálogo|assets de Olhos Dev/.test(error.message)
}
function cachedProvider(provider: CharacterRenderAssetProvider, sharedOnly = false): CharacterRenderAssetProvider {
  const cache = new Map<string, Promise<unknown>>()
  return new Proxy({} as CharacterRenderAssetProvider, { get: (_target, property) => (...args: unknown[]) => {
    if (sharedOnly && !['loadFabricatorSlot', 'loadFabricatorPose', 'loadHairStyle', 'loadWardrobeSet'].includes(String(property))) {
      return (provider[property as keyof CharacterRenderAssetProvider] as (...args: unknown[]) => Promise<unknown>)(...args)
    }
    const key = JSON.stringify([property, args]); let result = cache.get(key)
    if (!result) {
      result = (provider[property as keyof CharacterRenderAssetProvider] as (...args: unknown[]) => Promise<unknown>)(...args)
      cache.set(key, result)
      void result.catch(() => { if (cache.get(key) === result) cache.delete(key) })
      while (cache.size > 32) cache.delete(cache.keys().next().value!)
    }
    return result
  } })
}
const neutral = (): EditorV6FaceTransform => ({ x: 0, y: 0, width: 100, height: 100, rotation: 0 })

function scaleMouthForExport(face: Awaited<ReturnType<typeof interpolateEditorV6Face>>, factor: number) {
  if (factor === 1) return face
  const appearance = face.appearance
  const transforms = { ...face.transforms }
  const source = transforms.mouth
    ?? (appearance?.mouthClosedCatalogId ? transforms[`mouth-closed:${appearance.mouthClosedCatalogId}`] : undefined)
    ?? (appearance?.mouthOpenCatalogId ? transforms[`mouth-open:${appearance.mouthOpenCatalogId}`] : undefined)
    ?? transforms['mouth-open']
    ?? transforms['mouth-closed']
    ?? neutral()
  transforms.mouth = { ...source, width: source.width * factor, height: source.height * factor }
  return { ...face, transforms }
}

/** Resolve implicit sheet calibrations before interpolating portable preset overrides. */
async function prepareFace(state: EditorV6Element, request: EditorV6MotionBakeRequest, provider: CharacterRenderAssetProvider): Promise<EditorV6Element> {
  const appearance = structuredClone(state.faceAppearance ?? request.character.customization.faceAppearance)
  if (!appearance) return state
  const slot = request.character.customization.modelSlot ?? 1
  appearance.transforms = { ...appearance.transforms }
  appearance.components = { ...appearance.components }
  const ids: Partial<Record<FaceElementKind, string>> = { 'eye-left': appearance.eyeLeftCatalogId ?? appearance.eyeCatalogId, 'eye-right': appearance.eyeRightCatalogId ?? appearance.eyeCatalogId, 'brow-left': appearance.eyebrowLeftCatalogId ?? appearance.eyebrowCatalogId, 'brow-right': appearance.eyebrowRightCatalogId ?? appearance.eyebrowCatalogId, nose: appearance.noseCatalogId, mouth: appearance.mouthClosedCatalogId ?? appearance.mouthOpenCatalogId }
  for (const [part, id] of Object.entries(ids)) if (id && !appearance.transforms[part as FaceElementKind]) {
    const item = await provider.loadFaceCatalogItem(slot, id)
    const transform = item?.transforms[part as FaceElementKind]
    if (transform) appearance.transforms[part as FaceElementKind] = transform
  }
  for (const [key, selected] of Object.entries(appearance.components)) if (selected?.assetId && !selected.transform) {
    const component = await provider.loadFaceComponentAsset(slot, selected.assetId)
    if (component) appearance.components[key as FaceComponentPartId] = { ...selected, transform: component.defaultTransform }
  }
  const effects = state.activeExpressionEffects ?? (await loadStandardExpressionEffects(slot, provider))[appearance.expressionIndex]
  return { ...state, faceAppearance: appearance, faceTransforms: { ...state.faceTransforms }, activeExpressionEffects: effects }
}
function calibratePair(from: EditorV6Element, to: EditorV6Element) {
  const keys = new Set([...Object.keys(from.faceTransforms ?? {}), ...Object.keys(to.faceTransforms ?? {})])
  for (const state of [from, to]) for (const key of keys) {
    if (!key.startsWith('expression')) continue
    const existing = state.faceTransforms?.[key]
    if (existing?.sourceTransformOverride) continue
    let baseline: FaceTransform | undefined
    if (key.startsWith('expression-component:')) baseline = state.faceAppearance?.components?.[key.split(':')[1] as FaceComponentPartId]?.transform
    else { const part = key.split(':')[1]; baseline = state.faceAppearance?.transforms?.[(part.startsWith('mouth') ? 'mouth' : part) as FaceElementKind] }
    if (baseline) { state.faceTransforms ??= {}; state.faceTransforms[key] = { ...(existing ?? neutral()), sourceTransformOverride: baseline } }
  }
}

/** Bake canonical rig samples into one bounded PNG atlas, off the UI thread. */
export type EditorV6BakeSession = { provider: CharacterRenderAssetProvider; materials: GachaReusableMaterialCache }
export function createEditorV6BakeSession(provider: CharacterRenderAssetProvider): EditorV6BakeSession {
  return { provider: cachedProvider(provider, true), materials: new Map() }
}
export async function bakeEditorV6Motion(request: EditorV6MotionBakeRequest, rawProvider: CharacterRenderAssetProvider, session?: EditorV6BakeSession, captureLayerAtlases?: (capture: EditorV6MotionLayerAtlasCapture) => void, endpointCrops?: { from: Omit<Crop, 'fingerprint'>; to: Omit<Crop, 'fingerprint'> }): Promise<EditorV6MotionBakeResult> {
  const began = performance.now(), provider = cachedProvider(session?.provider ?? rawProvider), slot = request.character.customization.modelSlot ?? 1
  const source = await provider.loadFabricatorSlot(slot)
  if (!source) throw Error('O modelo do personagem não está disponível para animar.')
  const resolvePose = createMotionPoseResolver(source, provider)
  const pose = (state: EditorV6Element) => {
    const slotId = state.poseSlot === undefined ? request.character.customization.poseSlot : state.poseSlot
    return resolvePose(slotId)
  }
  const [fromPose, toPose, from, to] = await Promise.all([pose(request.plan.from), pose(request.plan.to), prepareFace(structuredClone(request.plan.from), request, provider), prepareFace(structuredClone(request.plan.to), request, provider)])
  calibratePair(from, to)
  const poseSignature = (pose: typeof fromPose) => JSON.stringify([pose.width, pose.height, pose.parts, pose.joints, pose.layerOrder, pose.hiddenPartIds])
  const samePose = poseSignature(fromPose) === poseSignature(toPose)
  const materials: GachaReusableMaterialCache = session?.materials ?? new Map()
  let preparedRigs = 0, reusable: Renderer | undefined, preparedAtlasFrames: BakedBodySample[] | undefined, pendingFacePatches: BakedFacePatch[] | undefined
  let behindFaceAtlas: HTMLCanvasElement | undefined, faceLayerAtlas: HTMLCanvasElement | undefined, inFrontOfFaceAtlas: HTMLCanvasElement | null | undefined
  const layerFrames: EditorV6MotionLayerAtlasCapture['frames'] = []
  const prepare = async (progress: number) => {
    if (samePose && reusable) return reusable
    const artwork = interpolateEditorV6Pose(fromPose, toPose, progress)
    const renderer = await prepareSavedCharacterRenderer(request.character, { source, artwork, assetProvider: provider, materialCache: materials })
    preparedRigs++
    if (samePose) reusable = renderer
    return renderer
  }
  const render = async (progress: number, faceMode?: EditorV6FaceRenderMode, mouthScale = 1, fingerprint = false, preparedRenderer?: Renderer, referenceMode = false, captureLayers = false): Promise<MotionFrameRender> => {
    const renderer = preparedRenderer ?? await prepare(progress), face = scaleMouthForExport(interpolateEditorV6Face(from, to, progress), mouthScale)
    try {
      const mode = faceMode ?? face.mode
      const renderMode = referenceMode ? mode : editorV6FaceModeDuringMotion(mode)
      const isolateMouth = Boolean(request.mouthScaleSamples && (mode === 'talk' || mode === 'talk-blink') && renderer.canIsolateMouth(face.appearance))
      const result = await renderer.renderToCanvas(face.appearance, face.transforms, face.effects, renderMode, isolateMouth ? { mouthLayer: 'without-mouth' } : undefined)
      const mouth = isolateMouth ? await renderer.renderMouthToCanvas(face.appearance, face.transforms, face.effects, renderMode) : undefined
      const layers = captureLayers ? await renderer.renderLayersToCanvas(face.appearance, face.transforms, face.effects, renderMode, isolateMouth ? { mouthLayer: 'without-mouth' } : undefined) : undefined
      return { ...result, crop: cropOf(result.canvas, fingerprint), renderer, ...(layers ? { layers } : {}), ...(mouth ? { mouthCanvas: mouth.canvas, mouthCrop: cropOf(mouth.canvas, fingerprint, 0) } : {}), dispose: () => { if (!samePose && !preparedRenderer) renderer.dispose() } }
    } catch (error) { if (!samePose && !preparedRenderer) renderer.dispose(); throw error }
  }
  try {
    const staticMouthLoop = Boolean(!captureLayerAtlases && request.mouthScaleSamples && samePose
      && JSON.stringify(from) === JSON.stringify(to)
      && request.plan.samples.every((sample) => sample.faceMode === from.activeFaceMode))
    if (staticMouthLoop) {
      const scales = request.mouthScaleSamples!
      const baseline = await render(0, from.activeFaceMode, 1, true)
      if (baseline.mouthCanvas && baseline.mouthCrop) {
        const fullTalk = await baseline.renderer.renderToCanvas(from.faceAppearance, from.faceTransforms, from.activeExpressionEffects, from.activeFaceMode, { mouthLayer: 'all' })
        let sourceCrop = cropOf(fullTalk.canvas, false, 0)
        try {
          const fullTalkBlink = await baseline.renderer.renderToCanvas(from.faceAppearance, from.faceTransforms, from.activeExpressionEffects, 'talk-blink', { mouthLayer: 'all' })
          sourceCrop = unionCrop(sourceCrop, cropOf(fullTalkBlink.canvas, false, 0))
        } catch (error) { if (!isBlinkUnavailable(error)) throw error }
        const isolatedBaseline = await render(0, from.activeFaceMode, 1, true, baseline.renderer, true)
        const baseTalkId = crypto.randomUUID()
        const baseTalkCanvas = croppedCanvas(isolatedBaseline.canvas, sourceCrop)
        const baseTalkDataUrl = baseTalkCanvas.toDataURL('image/png')
        const mouthlessBaseAssets: NonNullable<EditorV6MotionBakeResult['mouthlessBaseAssets']> = [{
          faceMode: 'talk', asset: { id: baseTalkId, category: 'character', name: 'Personagem sem boca · fala', mimeType: 'image/png', dataUrl: baseTalkDataUrl, timelineSnapshot: true }
        }]
        baseTalkCanvas.width = baseTalkCanvas.height = 1
        try {
          const talkBlink = await render(0, 'talk-blink', 1, false, isolatedBaseline.renderer, true)
          try {
            const baseTalkBlinkId = crypto.randomUUID()
            const baseTalkBlinkCanvas = croppedCanvas(talkBlink.canvas, sourceCrop)
            mouthlessBaseAssets.push({ faceMode: 'talk-blink', asset: { id: baseTalkBlinkId, category: 'character', name: 'Personagem sem boca · fala e piscada', mimeType: 'image/png', dataUrl: baseTalkBlinkCanvas.toDataURL('image/png'), timelineSnapshot: true } })
            baseTalkBlinkCanvas.width = baseTalkBlinkCanvas.height = 1
          } finally { talkBlink.dispose() }
        } catch (error) {
          if (!isBlinkUnavailable(error)) throw error
          mouthlessBaseAssets.push({ faceMode: 'talk-blink', asset: { id: crypto.randomUUID(), category: 'character', name: 'Personagem sem boca · fala e piscada', mimeType: 'image/png', dataUrl: baseTalkDataUrl, timelineSnapshot: true } })
        }

        const isolatedPatches: Array<{ canvas: HTMLCanvasElement; crop: Crop }> = []
        let mouthAtlas: HTMLCanvasElement | undefined
        try {
          const baselineMouthCrop = isolatedBaseline.mouthCrop!
          isolatedPatches.push({ canvas: alphaPatchCanvas(isolatedBaseline.mouthCanvas!, baselineMouthCrop), crop: baselineMouthCrop })
          for (let index = 1; index < scales.length; index++) {
            const comparison = await render(0, from.activeFaceMode, scales[index], index === scales.length - 1, baseline.renderer)
            try {
              if (!comparison.mouthCanvas || !comparison.mouthCrop) throw Error('Não foi possível isolar a peça da boca para o ciclo de fala.')
              if (index === scales.length - 1 && comparison.mouthCrop.fingerprint === baselineMouthCrop.fingerprint) throw Error('A boca aberta não respondeu à ampliação; confira se o personagem tem uma variante de boca aberta editável no catálogo facial.')
              isolatedPatches.push({ canvas: alphaPatchCanvas(comparison.mouthCanvas, comparison.mouthCrop), crop: comparison.mouthCrop })
            } finally { comparison.dispose() }
          }
          const mouthUnion = isolatedPatches.reduce((bounds, patch) => unionCrop(bounds, patch.crop), isolatedPatches[0].crop)
          for (const patch of isolatedPatches) {
            const normalized = document.createElement('canvas')
            normalized.width = mouthUnion.width + 4; normalized.height = mouthUnion.height + 4
            const normalizedContext = normalized.getContext('2d')!
            normalizedContext.drawImage(patch.canvas, 2, 2, patch.crop.width, patch.crop.height,
              2 + patch.crop.left - mouthUnion.left, 2 + patch.crop.top - mouthUnion.top, patch.crop.width, patch.crop.height)
            patch.canvas.width = patch.canvas.height = 1
            patch.canvas = normalized
            patch.crop = mouthUnion
          }
          const count = request.plan.samples.length, gutter = 2
          const cellWidth = Math.max(...isolatedPatches.map(patch => patch.canvas.width))
          const cellHeight = Math.max(...isolatedPatches.map(patch => patch.canvas.height))
          const layout = chooseMotionAtlasLayout(count, cellWidth, cellHeight, 8192, Math.min(8_000_000, request.maxAtlasPixels ?? 8_000_000))
          if (layout.ratio < 1) throw Error(`A camada facial em resolução nativa precisa de ${layout.pixels.toLocaleString('pt-BR')} pixels e excede o limite seguro; reduza o número de personagens falando simultaneamente neste trecho.`)
          const { columns, width: atlasWidth, height: atlasHeight, pixels: atlasPixels } = layout
          mouthAtlas = document.createElement('canvas'); mouthAtlas.width = atlasWidth; mouthAtlas.height = atlasHeight
          const context = mouthAtlas.getContext('2d')!
          const frames: EditorV6MotionFrame[] = []
          for (const [index, sample] of request.plan.samples.entries()) {
            const patch = isolatedPatches[index]
            if (!patch) throw Error('O ciclo de fala não contém uma amostra isolada da boca.')
            const cellX = index % columns * cellWidth, cellY = Math.floor(index / columns) * cellHeight
            const spriteX = cellX + gutter, spriteY = cellY + gutter
            const mouthCrop = patch.crop
            const x = (mouthCrop.left - sourceCrop.left) / sourceCrop.width, y = (mouthCrop.top - sourceCrop.top) / sourceCrop.height
            const width = mouthCrop.width / sourceCrop.width, height = mouthCrop.height / sourceCrop.height
            if (x < -0.000001 || y < -0.000001 || x + width > 1.000001 || y + height > 1.000001) throw Error('A boca isolada ficou fora do recorte corporal usado pelo personagem.')
            context.drawImage(patch.canvas, cellX, cellY)
            const sprite = { x: spriteX, y: spriteY, width: mouthCrop.width, height: mouthCrop.height, atlasWidth, atlasHeight }
            frames.push({ offset: sample.offset, sprite, x: Math.max(0, x), y: Math.max(0, y), width, height, rotation: from.rotation, flipX: Boolean(from.flipX), facePatch: { sprite, x: Math.max(0, x), y: Math.max(0, y), width, height } })
          }
          const assetId = crypto.randomUUID(), dataUrl = mouthAtlas.toDataURL('image/png')
          return {
            asset: { id: assetId, category: 'character', name: 'Atlas isolado da boca', mimeType: 'image/png', dataUrl, timelineSnapshot: true },
            assetRole: 'face-atlas', mouthIsolationMode: 'isolated-piece', mouthlessBaseAssets,
            motion: { version: 1, key: request.plan.key, assetId, frames },
            metrics: { milliseconds: performance.now() - began, preparedRigs, samples: count, atlasPixels }
          }
        } finally {
          isolatedPatches.forEach(({ canvas }) => { canvas.width = canvas.height = 1 })
          if (mouthAtlas) mouthAtlas.width = mouthAtlas.height = 1
          baseline.dispose(); isolatedBaseline.dispose()
        }
      }
      const baselineContext = baseline.canvas.getContext('2d', { willReadFrequently: true })!
      const baselinePixels = new Uint8ClampedArray(baselineContext.getImageData(0, 0, baseline.width, baseline.height).data)
      const sourceCrop = baseline.crop
      let bounds: PixelBounds | undefined
      for (let index = 1; index < scales.length; index++) {
        const comparison = await render(0, from.activeFaceMode, scales[index], index === scales.length - 1)
        try {
          if (index === scales.length - 1 && comparison.crop.fingerprint === sourceCrop.fingerprint) throw Error('A boca aberta não respondeu à ampliação; confira se o personagem tem uma variante de boca aberta editável no catálogo facial.')
          const pixels = comparison.canvas.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, comparison.width, comparison.height).data
          const changed = changedBounds(baselinePixels, pixels, comparison.width, comparison.height)
          if (changed) bounds = unionBounds(bounds, changed)
        } finally { comparison.dispose() }
      }
      if (!bounds) throw Error('A animação da boca não alterou pixels do personagem; confira o vínculo da boca aberta no catálogo facial.')
      const padding = 3
      const left = Math.max(sourceCrop.left, bounds.left - padding), top = Math.max(sourceCrop.top, bounds.top - padding)
      const right = Math.min(sourceCrop.left + sourceCrop.width - 1, bounds.right + padding), bottom = Math.min(sourceCrop.top + sourceCrop.height - 1, bounds.bottom + padding)
      const patchWidth = right - left + 1, patchHeight = bottom - top + 1
      const count = request.plan.samples.length, gutter = 2
      const cellWidth = patchWidth + gutter * 2, cellHeight = patchHeight + gutter * 2
      const layout = chooseMotionAtlasLayout(count, cellWidth, cellHeight, 8192, Math.min(8_000_000, request.maxAtlasPixels ?? 8_000_000))
      if (layout.ratio < 1) throw Error(`A camada facial em resolução nativa precisa de ${layout.pixels.toLocaleString('pt-BR')} pixels e excede o limite seguro; reduza o número de personagens falando simultaneamente neste trecho.`)
      const { columns, width: atlasWidth, height: atlasHeight, pixels: atlasPixels } = layout
      const atlas = document.createElement('canvas'); atlas.width = atlasWidth; atlas.height = atlasHeight
      const context = atlas.getContext('2d')!
      const x = (left - sourceCrop.left) / sourceCrop.width, y = (top - sourceCrop.top) / sourceCrop.height
      const width = patchWidth / sourceCrop.width, height = patchHeight / sourceCrop.height
      if (x < 0 || y < 0 || x + width > 1.000001 || y + height > 1.000001) throw Error('A região facial não cabe no recorte original do personagem.')
      const frames: EditorV6MotionFrame[] = []
      for (const [index, sample] of request.plan.samples.entries()) {
        const frame = await render(0, sample.faceMode, scales[index] ?? 1)
        let patchCanvas: HTMLCanvasElement | undefined
        try {
          const cellX = index % columns * cellWidth, cellY = Math.floor(index / columns) * cellHeight, sx = cellX + gutter, sy = cellY + gutter
          patchCanvas = changedPixelPatch(frame.canvas, { left, top, right, bottom })
          context.drawImage(patchCanvas, cellX, cellY)
          frames.push({ offset: sample.offset, sprite: { x: sx, y: sy, width: patchWidth, height: patchHeight, atlasWidth, atlasHeight }, x: from.x, y: from.y, width: from.width, height: from.height, rotation: from.rotation, flipX: Boolean(from.flipX), facePatch: { sprite: { x: sx, y: sy, width: patchWidth, height: patchHeight, atlasWidth, atlasHeight }, x, y, width, height, replace: true, replaceBounds: normalizedReplacementBounds(bounds, { left, top, right, bottom }) } })
        } finally { if (patchCanvas) { patchCanvas.width = 1; patchCanvas.height = 1 }; frame.dispose() }
      }
      const assetId = crypto.randomUUID(), dataUrl = atlas.toDataURL('image/png')
      atlas.width = atlas.height = 1
      return { asset: { id: assetId, category: 'character', name: 'Camada facial da boca', mimeType: 'image/png', dataUrl, timelineSnapshot: true }, assetRole: 'face-atlas', mouthIsolationMode: 'legacy-patch', motion: { version: 1, key: request.plan.key, assetId, frames }, metrics: { milliseconds: performance.now() - began, preparedRigs, samples: count, atlasPixels } }
    }
    const first = await render(0, staticMouthLoop ? from.activeFaceMode : undefined, 1, Boolean(request.mouthScaleSamples)), fullWidth = first.width, fullHeight = first.height
    // Static character assets use the union of all face-mode bounds. Motion
    // endpoints must use those same bounds when interpreting element centers.
    const endpointCrop = async (progress: number, initial: Crop, renderer: Renderer): Promise<Crop> => {
      let left = initial.left, top = initial.top, right = left + initial.width, bottom = top + initial.height
      for (const mode of ['idle', 'blink', 'talk', 'talk-blink'] as const) {
        try {
          const frame = await render(progress, mode, 1, false, renderer, true)
          try {
            left = Math.min(left, frame.crop.left); top = Math.min(top, frame.crop.top)
            right = Math.max(right, frame.crop.left + frame.crop.width); bottom = Math.max(bottom, frame.crop.top + frame.crop.height)
          } finally { frame.dispose() }
        } catch (error) {
          const missingBlink = error instanceof Error && error.message.includes('Selecione olhos do catálogo ou assets de Olhos Dev')
          if (!missingBlink || (mode !== 'blink' && mode !== 'talk-blink')) throw error
        }
      }
      return { left, top, width: right - left, height: bottom - top }
    }
    let fromCrop: Crop
    try { fromCrop = endpointCrops?.from ?? await endpointCrop(0, first.crop, first.renderer) }
    finally { first.dispose() }
    const last = staticMouthLoop ? null : await render(1)
    let toCrop: Crop
    try { toCrop = endpointCrops?.to ?? (last ? await endpointCrop(1, last.crop, last.renderer) : fromCrop) }
    finally { last?.dispose() }
    const maximumCanvasWidth = Math.max(fullWidth, last?.width ?? fullWidth), maximumCanvasHeight = Math.max(fullHeight, last?.height ?? fullHeight)
    const count = request.plan.samples.length
    const maxAtlasPixels = Math.min(8_000_000, request.maxAtlasPixels ?? 8_000_000)
    let maximumWidth = maximumCanvasWidth, maximumHeight = maximumCanvasHeight
    let layout = chooseMotionAtlasLayout(count, maximumWidth, maximumHeight, 4096, maxAtlasPixels)
    let ratio = layout.ratio
    const frames: EditorV6MotionFrame[] = []
    const facePatches: BakedFacePatch[] = pendingFacePatches = []
    const prepareFacePatch = async (index: number, sample: { faceMode?: EditorV6FaceRenderMode }, t: number, mouthScale: number, frame: MotionFrameRender) => {
      if (!request.mouthScaleSamples || (sample.faceMode !== 'talk' && sample.faceMode !== 'talk-blink')) return
      if (mouthScale <= 1.000001 && !frame.mouthCanvas) return
      const scaled = await render(t, sample.faceMode, mouthScale, false, frame.renderer)
      if (scaled.mouthCanvas && scaled.mouthCrop) {
        try {
          const patch = alphaPatchCanvas(scaled.mouthCanvas, scaled.mouthCrop)
          facePatches.push({ index, canvas: patch, left: scaled.mouthCrop.left, top: scaled.mouthCrop.top, width: scaled.mouthCrop.width, height: scaled.mouthCrop.height, crop: frame.crop })
        } finally { scaled.dispose() }
        return
      }
      const baselinePixels = new Uint8ClampedArray(frame.canvas.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, frame.width, frame.height).data)
      try {
        const pixels = scaled.canvas.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, scaled.width, scaled.height).data
        const changed = changedBounds(baselinePixels, pixels, scaled.width, scaled.height)
        if (!changed) throw Error('A boca aberta não alterou pixels durante a transição; confira a variante de boca aberta no catálogo facial.')
        const padding = 3
        const left = Math.max(frame.crop.left, changed.left - padding), top = Math.max(frame.crop.top, changed.top - padding)
        const right = Math.min(frame.crop.left + frame.crop.width - 1, changed.right + padding), bottom = Math.min(frame.crop.top + frame.crop.height - 1, changed.bottom + padding)
        const patchWidth = right - left + 1, patchHeight = bottom - top + 1
        const patchCanvas = changedPixelPatch(scaled.canvas, { left, top, right, bottom })
        facePatches.push({ index, canvas: patchCanvas, left, top, width: patchWidth, height: patchHeight, crop: frame.crop, changed, replace: true })
      } finally { scaled.dispose() }
    }
    if (ratio < 1) {
      // The canvas can contain large transparent margins. Keep native cropped samples so
      // the atlas uses visible bounds without rendering the same transition twice.
      preparedAtlasFrames = []
      maximumWidth = Math.max(fromCrop.width, toCrop.width)
      maximumHeight = Math.max(fromCrop.height, toCrop.height)
      for (const [index, sample] of request.plan.samples.entries()) {
        const t = motionEase(sample.progress), mouthScale = request.mouthScaleSamples?.[index] ?? 1
        const frame = await render(t, sample.faceMode, 1, false, undefined, false, Boolean(captureLayerAtlases))
        try {
          maximumWidth = Math.max(maximumWidth, frame.crop.width)
          maximumHeight = Math.max(maximumHeight, frame.crop.height)
          const cropped = document.createElement('canvas'); cropped.width = frame.crop.width; cropped.height = frame.crop.height
          cropped.getContext('2d')!.drawImage(frame.canvas, frame.crop.left, frame.crop.top, frame.crop.width, frame.crop.height, 0, 0, frame.crop.width, frame.crop.height)
          preparedAtlasFrames.push({ canvas: cropped, crop: frame.crop, ...(frame.layers ? { layers: cropPreparedLayers(frame.layers, frame.crop) } : {}) })
          await prepareFacePatch(index, sample, t, mouthScale, frame)
        } finally { frame.dispose() }
      }
      layout = chooseMotionAtlasLayout(count, maximumWidth, maximumHeight, 4096, maxAtlasPixels)
      ratio = layout.ratio
    }
    if (ratio < 1) throw Error(`A transição deste personagem precisa de ${layout.width}×${layout.height} pixels em resolução nativa e excede o limite seguro. A exportação foi interrompida para não reduzir a nitidez do personagem.`)
    const { columns, rows } = layout
    const cellWidth = Math.ceil(maximumWidth * ratio), cellHeight = Math.ceil(maximumHeight * ratio)
    const atlas = document.createElement('canvas'); atlas.width = cellWidth * columns; atlas.height = cellHeight * rows
    const context = atlas.getContext('2d')!
    if (captureLayerAtlases) {
      behindFaceAtlas = document.createElement('canvas'); behindFaceAtlas.width = atlas.width; behindFaceAtlas.height = atlas.height
      faceLayerAtlas = document.createElement('canvas'); faceLayerAtlas.width = atlas.width; faceLayerAtlas.height = atlas.height
      inFrontOfFaceAtlas = document.createElement('canvas'); inFrontOfFaceAtlas.width = atlas.width; inFrontOfFaceAtlas.height = atlas.height
    }
    const sharedCharacterCanvasWidth = request.plan.from.characterCanvasWidth ?? request.plan.to.characterCanvasWidth
    // The saved rectangles already encode the actual stage aspect ratio and
    // character scale; map those rectangles to the same crops as static assets.
    const fromScale = motionEndpointScale(request.plan.from, fromCrop)
    let toScale = motionEndpointScale(request.plan.to, toCrop)
    // Older projects have no untrimmed-canvas width. If their actor box and
    // explicit scale are unchanged, retain the source scale through the bake.
    const sameLegacyElementSize = !sharedCharacterCanvasWidth
      && request.plan.from.width === request.plan.to.width && request.plan.from.height === request.plan.to.height
      && (request.plan.from.characterScale ?? 100) === (request.plan.to.characterScale ?? 100)
      && (request.plan.from.characterWidthScale ?? 100) === (request.plan.to.characterWidthScale ?? 100)
      && (request.plan.from.characterHeightScale ?? 100) === (request.plan.to.characterHeightScale ?? 100)
    if (sameLegacyElementSize) toScale = fromScale
    for (const [index, sample] of request.plan.samples.entries()) {
      const t = motionEase(sample.progress), mouthScale = request.mouthScaleSamples?.[index] ?? 1
      const baked = preparedAtlasFrames?.[index]
      const frame = baked ? undefined : await render(t, sample.faceMode, 1, false, undefined, false, Boolean(captureLayerAtlases))
      const crop = baked?.crop ?? frame!.crop
      try {
        const x = index % columns * cellWidth, y = Math.floor(index / columns) * cellHeight, width = Math.max(1, Math.ceil(crop.width * ratio)), height = Math.max(1, Math.ceil(crop.height * ratio))
        const sourceCanvas = baked?.canvas ?? frame!.canvas
        context.drawImage(sourceCanvas, baked ? 0 : crop.left, baked ? 0 : crop.top, crop.width, crop.height, x, y, width, height)
        const sx = motionLerp(fromScale.x, toScale.x, t), sy = motionLerp(fromScale.y, toScale.y, t)
        const originX = motionLerp(-(fromCrop.left + fromCrop.width / 2) * fromScale.x, -(toCrop.left + toCrop.width / 2) * toScale.x, t)
        const originY = motionLerp(-(fromCrop.top + fromCrop.height / 2) * fromScale.y, -(toCrop.top + toCrop.height / 2) * toScale.y, t)
        const rotation = motionAngle(from.rotation, to.rotation, t), flipX = Boolean(t < .5 ? from.flipX : to.flipX)
        const dx = (originX + (crop.left + crop.width / 2) * sx) * (flipX ? -1 : 1), dy = originY + (crop.top + crop.height / 2) * sy, radians = rotation * Math.PI / 180
        const motionFrame: EditorV6MotionFrame = { offset: sample.offset, sprite: { x, y, width, height, atlasWidth: atlas.width, atlasHeight: atlas.height }, x: motionLerp(from.x, to.x, t) + (dx * Math.cos(radians) - dy * Math.sin(radians)) / 19.2, y: motionLerp(from.y, to.y, t) + (dx * Math.sin(radians) + dy * Math.cos(radians)) / 10.8, width: crop.width * sx / 19.2, height: crop.height * sy / 10.8, rotation, flipX }
        frames.push(motionFrame)
        if (captureLayerAtlases) {
          const layers = baked?.layers ?? (frame?.layers ? cropPreparedLayers(frame.layers, crop) : undefined)
          if (!layers || !behindFaceAtlas || !faceLayerAtlas || !inFrontOfFaceAtlas) throw Error('A preparação do cabelo não capturou as camadas da pose intermediária.')
          const drawLayer = (target: HTMLCanvasElement, source: HTMLCanvasElement | null) => {
            if (!source) return
            const targetContext = target.getContext('2d')!
            targetContext.drawImage(source, 0, 0, source.width, source.height, x, y, width, height)
          }
          drawLayer(behindFaceAtlas, layers.behindFace)
          drawLayer(faceLayerAtlas, layers.face)
          drawLayer(inFrontOfFaceAtlas, layers.inFrontOfFace)
          layerFrames.push({ offset: sample.offset, sprite: motionFrame.sprite, x: motionFrame.x, y: motionFrame.y, width: motionFrame.width, height: motionFrame.height, rotation: motionFrame.rotation, flipX: motionFrame.flipX, crop: { left: crop.left, top: crop.top, width: crop.width, height: crop.height } })
          if (baked?.layers) disposeCroppedLayers(baked.layers)
          else if (layers !== baked?.layers) disposeCroppedLayers(layers)
        }
        if (frame) await prepareFacePatch(index, sample, t, mouthScale, frame)
      } finally {
        frame?.dispose()
        if (baked) baked.canvas.width = baked.canvas.height = 1
      }
    }
    let faceAsset: EditorV6MotionBakeResult['faceAsset']
    if (facePatches.length) {
      const gutter = 2, faceWidth = facePatches.reduce((total, patch) => total + patch.canvas.width, 0), faceHeight = Math.max(...facePatches.map((patch) => patch.canvas.height))
      const facePixels = faceWidth * faceHeight, bodyPixels = atlas.width * atlas.height
      if (faceWidth > 8192 || faceHeight > 8192 || facePixels + bodyPixels > maxAtlasPixels) throw Error('As camadas faciais desta transição excedem o limite seguro em resolução nativa. A exportação foi interrompida para não reduzir a nitidez do personagem.')
      const faceAtlas = document.createElement('canvas'); faceAtlas.width = faceWidth; faceAtlas.height = faceHeight
      const faceContext = faceAtlas.getContext('2d')!
      let offsetX = 0
      for (const patch of facePatches) {
        faceContext.drawImage(patch.canvas, offsetX, 0)
        const frame = frames[patch.index]
        frame.facePatch = {
          sprite: { x: offsetX + gutter, y: gutter, width: patch.width, height: patch.height, atlasWidth: faceWidth, atlasHeight: faceHeight },
          x: (patch.left - patch.crop.left) / patch.crop.width, y: (patch.top - patch.crop.top) / patch.crop.height,
          width: patch.width / patch.crop.width, height: patch.height / patch.crop.height,
          ...(patch.replace ? { replace: true, replaceBounds: normalizedReplacementBounds(patch.changed!, { left: patch.left, top: patch.top, right: patch.left + patch.width - 1, bottom: patch.top + patch.height - 1 }) } : {})
        }
        offsetX += patch.canvas.width
        patch.canvas.width = patch.canvas.height = 1
      }
      const faceAssetId = crypto.randomUUID(), assetId = crypto.randomUUID()
      const faceDataUrl = faceAtlas.toDataURL('image/png'), bodyDataUrl = atlas.toDataURL('image/png')
      faceAsset = { id: faceAssetId, category: 'character', name: 'Camadas faciais da transição', mimeType: 'image/png', dataUrl: faceDataUrl, timelineSnapshot: true }
      if (captureLayerAtlases) captureLayerAtlases({ frames: frames.map(frame => {
        const captured = layerFrames.find(item => item.offset === frame.offset)
        if (!captured) throw Error('A preparação perdeu um quadro da pose sem cabelo.')
        return { ...captured, ...(frame.facePatch ? { facePatch: frame.facePatch } : {}) }
      }), behindFace: behindFaceAtlas!, face: faceLayerAtlas!, inFrontOfFace: inFrontOfFaceAtlas! })
      atlas.width = atlas.height = 1
      faceAtlas.width = faceAtlas.height = 1
      return { asset: { id: assetId, category: 'character', name: 'Transição de personagem', mimeType: 'image/png', dataUrl: bodyDataUrl, timelineSnapshot: true }, faceAsset, motion: { version: 1, key: request.plan.key, assetId, faceAssetId, frames }, metrics: { milliseconds: performance.now() - began, preparedRigs, samples: count, atlasPixels: bodyPixels + facePixels } }
    }
    const assetId = crypto.randomUUID(), atlasPixels = atlas.width * atlas.height, dataUrl = atlas.toDataURL('image/png')
    if (captureLayerAtlases) captureLayerAtlases({ frames: frames.map(frame => {
      const captured = layerFrames.find(item => item.offset === frame.offset)
      if (!captured) throw Error('A preparação perdeu um quadro da pose sem cabelo.')
      return { ...captured, ...(frame.facePatch ? { facePatch: frame.facePatch } : {}) }
    }), behindFace: behindFaceAtlas!, face: faceLayerAtlas!, inFrontOfFace: inFrontOfFaceAtlas! })
    atlas.width = atlas.height = 1
    return { asset: { id: assetId, category: 'character', name: 'Transição de personagem', mimeType: 'image/png', dataUrl, timelineSnapshot: true }, motion: { version: 1, key: request.plan.key, assetId, frames }, metrics: { milliseconds: performance.now() - began, preparedRigs, samples: count, atlasPixels } }
  } finally {
    preparedAtlasFrames?.forEach(({ canvas, layers }) => { canvas.width = canvas.height = 1; disposeCroppedLayers(layers) })
    pendingFacePatches?.forEach(({ canvas }) => { canvas.width = canvas.height = 1 })
    if (behindFaceAtlas) behindFaceAtlas.width = behindFaceAtlas.height = 1
    if (faceLayerAtlas) faceLayerAtlas.width = faceLayerAtlas.height = 1
    if (inFrontOfFaceAtlas) inFrontOfFaceAtlas.width = inFrontOfFaceAtlas.height = 1
    reusable?.dispose()
    if (!session || materials.size > 4) materials.clear()
  }
}

import type { CharacterRenderAssetProvider } from '../../../../../shared/characterRenderAssets'
import type { FaceComponentPartId } from '../../../../../shared/customizer'
import type { FaceElementKind, FaceTransform } from '../../../../../shared/fabricator'
import type { EditorV6Element, EditorV6FaceRenderMode, EditorV6FaceTransform } from '../../../../../shared/editorV6'
import type { EditorV6MotionBakeRequest, EditorV6MotionBakeResult, EditorV6MotionFrame } from '../../../../../shared/editorV6Motion'
import { editorV6FaceModeDuringMotion } from '../../../../../shared/editorV6FaceSchedule'
import { interpolateEditorV6Face, interpolateEditorV6Pose, motionAngle, motionEase, motionLerp } from '../../../../../shared/editorV6MotionInterpolation'
import { editorV6ElementSize } from '../../../../../shared/editorV6SceneModel'
import { loadStandardExpressionEffects, prepareSavedCharacterRenderer, type GachaReusableMaterialCache } from '../../../characters/editorV6CharacterRenderer'
import { createMotionPoseResolver } from './motionPoseResolver'

type Renderer = Awaited<ReturnType<typeof prepareSavedCharacterRenderer>>
type Crop = { left: number; top: number; width: number; height: number; fingerprint?: number }
type PixelBounds = { left: number; top: number; right: number; bottom: number }
type BakedFacePatch = { index: number; canvas: HTMLCanvasElement; left: number; top: number; width: number; height: number; crop: Crop }
function changedBounds(reference: Uint8ClampedArray, next: Uint8ClampedArray, width: number, height: number): PixelBounds | undefined {
  let left = width, right = -1, top = height, bottom = -1
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const offset = (y * width + x) * 4
    if (Math.abs(reference[offset] - next[offset]) < 3 && Math.abs(reference[offset + 1] - next[offset + 1]) < 3 && Math.abs(reference[offset + 2] - next[offset + 2]) < 3 && Math.abs(reference[offset + 3] - next[offset + 3]) < 3) continue
    left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y)
  }
  return right < left ? undefined : { left, top, right, bottom }
}
function unionBounds(current: PixelBounds | undefined, next: PixelBounds): PixelBounds {
  return current ? { left: Math.min(current.left, next.left), top: Math.min(current.top, next.top), right: Math.max(current.right, next.right), bottom: Math.max(current.bottom, next.bottom) } : next
}
function cropOf(canvas: HTMLCanvasElement, fingerprint = false): Crop {
  const pixels = canvas.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, canvas.width, canvas.height).data
  let left = canvas.width, right = -1, top = canvas.height, bottom = -1
  let hash = 2166136261
  for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
    const offset = (y * canvas.width + x) * 4
    if (pixels[offset + 3] > 8) { left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y) }
    if (fingerprint) for (let channel = 0; channel < 4; channel++) hash = Math.imul(hash ^ pixels[offset + channel], 16777619)
  }
  if (right < left) return { left: 0, top: 0, width: 1, height: 1, ...(fingerprint ? { fingerprint: hash >>> 0 } : {}) }
  return { left, top, width: right - left + 1, height: bottom - top + 1, ...(fingerprint ? { fingerprint: hash >>> 0 } : {}) }
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
export async function bakeEditorV6Motion(request: EditorV6MotionBakeRequest, rawProvider: CharacterRenderAssetProvider, session?: EditorV6BakeSession): Promise<EditorV6MotionBakeResult> {
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
  let preparedRigs = 0, reusable: Renderer | undefined
  const prepare = async (progress: number) => {
    if (samePose && reusable) return reusable
    const artwork = interpolateEditorV6Pose(fromPose, toPose, progress)
    const renderer = await prepareSavedCharacterRenderer(request.character, { source, artwork, assetProvider: provider, materialCache: materials })
    preparedRigs++
    if (samePose) reusable = renderer
    return renderer
  }
  const render = async (progress: number, faceMode?: EditorV6FaceRenderMode, mouthScale = 1, fingerprint = false) => {
    const renderer = await prepare(progress), face = scaleMouthForExport(interpolateEditorV6Face(from, to, progress), mouthScale)
    try {
      const result = await renderer.renderToCanvas(face.appearance, face.transforms, face.effects, editorV6FaceModeDuringMotion(faceMode ?? face.mode))
      return { ...result, crop: cropOf(result.canvas, fingerprint), dispose: () => { if (!samePose) renderer.dispose() } }
    } catch (error) { if (!samePose) renderer.dispose(); throw error }
  }
  try {
    const staticMouthLoop = Boolean(request.mouthScaleSamples && samePose
      && JSON.stringify(from) === JSON.stringify(to)
      && request.plan.samples.every((sample) => sample.faceMode === from.activeFaceMode))
    if (staticMouthLoop) {
      const scales = request.mouthScaleSamples!
      const baseline = await render(0, from.activeFaceMode, 1, true)
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
      const count = request.plan.samples.length, columns = Math.ceil(Math.sqrt(count)), rows = Math.ceil(count / columns)
      const atlasWidth = patchWidth * columns, atlasHeight = patchHeight * rows
      const atlasPixels = atlasWidth * atlasHeight
      if (atlasWidth > 8192 || atlasHeight > 8192 || atlasPixels > Math.min(8_000_000, request.maxAtlasPixels ?? 8_000_000)) throw Error(`A camada facial em resolução nativa precisa de ${atlasPixels.toLocaleString('pt-BR')} pixels e excede o limite seguro; reduza o número de personagens falando simultaneamente neste trecho.`)
      const atlas = document.createElement('canvas'); atlas.width = atlasWidth; atlas.height = atlasHeight
      const context = atlas.getContext('2d')!
      const x = (left - sourceCrop.left) / sourceCrop.width, y = (top - sourceCrop.top) / sourceCrop.height
      const width = patchWidth / sourceCrop.width, height = patchHeight / sourceCrop.height
      if (x < 0 || y < 0 || x + width > 1.000001 || y + height > 1.000001) throw Error('A região facial não cabe no recorte original do personagem.')
      const frames: EditorV6MotionFrame[] = []
      for (const [index, sample] of request.plan.samples.entries()) {
        const frame = await render(0, sample.faceMode, scales[index] ?? 1)
        try {
          const sx = index % columns * patchWidth, sy = Math.floor(index / columns) * patchHeight
          context.drawImage(frame.canvas, left, top, patchWidth, patchHeight, sx, sy, patchWidth, patchHeight)
          frames.push({ offset: sample.offset, sprite: { x: sx, y: sy, width: patchWidth, height: patchHeight, atlasWidth, atlasHeight }, x: from.x, y: from.y, width: from.width, height: from.height, rotation: from.rotation, flipX: Boolean(from.flipX), facePatch: { sprite: { x: sx, y: sy, width: patchWidth, height: patchHeight, atlasWidth, atlasHeight }, x, y, width, height } })
        } finally { frame.dispose() }
      }
      const assetId = crypto.randomUUID(), dataUrl = atlas.toDataURL('image/png')
      atlas.width = atlas.height = 1
      return { asset: { id: assetId, category: 'character', name: 'Camada facial da boca', mimeType: 'image/png', dataUrl, timelineSnapshot: true }, motion: { version: 1, key: request.plan.key, assetId, frames }, metrics: { milliseconds: performance.now() - began, preparedRigs, samples: count, atlasPixels } }
    }
    const first = await render(0, staticMouthLoop ? from.activeFaceMode : undefined, 1, Boolean(request.mouthScaleSamples)), fromCrop = first.crop, fullWidth = first.width, fullHeight = first.height
    first.dispose()
    const last = staticMouthLoop ? null : await render(1), toCrop = last?.crop ?? fromCrop
    const maximumWidth = Math.max(fullWidth, last?.width ?? fullWidth), maximumHeight = Math.max(fullHeight, last?.height ?? fullHeight)
    last?.dispose()
    const count = request.plan.samples.length, columns = Math.ceil(Math.sqrt(count)), rows = Math.ceil(count / columns)
    const maxAtlasPixels = Math.min(8_000_000, request.maxAtlasPixels ?? 8_000_000)
    const ratio = Math.min(1, 4096 / columns / maximumWidth, 4096 / rows / maximumHeight, Math.sqrt(maxAtlasPixels / (columns * rows * maximumWidth * maximumHeight)))
    if (ratio < 1) throw Error(`A transição deste personagem precisa de ${Math.ceil(columns * maximumWidth)}×${Math.ceil(rows * maximumHeight)} pixels em resolução nativa e excede o limite seguro. A exportação foi interrompida para não reduzir a nitidez do personagem.`)
    const cellWidth = Math.ceil(maximumWidth * ratio), cellHeight = Math.ceil(maximumHeight * ratio)
    const atlas = document.createElement('canvas'); atlas.width = cellWidth * columns; atlas.height = cellHeight * rows
    const context = atlas.getContext('2d')!
    const aa = editorV6ElementSize(request.plan.from), bb = editorV6ElementSize(request.plan.to)
    const fromScale = { x: aa.width * 19.2 / fromCrop.width, y: aa.height * 10.8 / fromCrop.height }, toScale = { x: bb.width * 19.2 / toCrop.width, y: bb.height * 10.8 / toCrop.height }
    const frames: EditorV6MotionFrame[] = []
    const facePatches: BakedFacePatch[] = []
    for (const [index, sample] of request.plan.samples.entries()) {
      const t = motionEase(sample.progress), mouthScale = request.mouthScaleSamples?.[index] ?? 1
      const frame = await render(t, sample.faceMode, 1), crop = frame.crop
      try {
        const x = index % columns * cellWidth, y = Math.floor(index / columns) * cellHeight, width = Math.max(1, Math.ceil(crop.width * ratio)), height = Math.max(1, Math.ceil(crop.height * ratio))
        context.drawImage(frame.canvas, crop.left, crop.top, crop.width, crop.height, x, y, width, height)
        const sx = motionLerp(fromScale.x, toScale.x, t), sy = motionLerp(fromScale.y, toScale.y, t)
        const originX = motionLerp(-aa.width * 9.6 - fromCrop.left * fromScale.x, -bb.width * 9.6 - toCrop.left * toScale.x, t)
        const originY = motionLerp(-aa.height * 5.4 - fromCrop.top * fromScale.y, -bb.height * 5.4 - toCrop.top * toScale.y, t)
        const rotation = motionAngle(from.rotation, to.rotation, t), flipX = Boolean(t < .5 ? from.flipX : to.flipX)
        const dx = (originX + (crop.left + crop.width / 2) * sx) * (flipX ? -1 : 1), dy = originY + (crop.top + crop.height / 2) * sy, radians = rotation * Math.PI / 180
        frames.push({ offset: sample.offset, sprite: { x, y, width, height, atlasWidth: atlas.width, atlasHeight: atlas.height }, x: motionLerp(from.x, to.x, t) + (dx * Math.cos(radians) - dy * Math.sin(radians)) / 19.2, y: motionLerp(from.y, to.y, t) + (dx * Math.sin(radians) + dy * Math.cos(radians)) / 10.8, width: crop.width * sx / 19.2, height: crop.height * sy / 10.8, rotation, flipX })
        if (request.mouthScaleSamples && sample.faceMode === 'talk' && mouthScale > 1.000001) {
          const baselinePixels = new Uint8ClampedArray(frame.canvas.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, frame.width, frame.height).data)
          const scaled = await render(t, sample.faceMode, mouthScale)
          try {
            const pixels = scaled.canvas.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, scaled.width, scaled.height).data
            const changed = changedBounds(baselinePixels, pixels, scaled.width, scaled.height)
            if (!changed) throw Error('A boca aberta não alterou pixels durante a transição; confira a variante de boca aberta no catálogo facial.')
            const padding = 3
            const left = Math.max(crop.left, changed.left - padding), top = Math.max(crop.top, changed.top - padding)
            const right = Math.min(crop.left + crop.width - 1, changed.right + padding), bottom = Math.min(crop.top + crop.height - 1, changed.bottom + padding)
            const patchWidth = right - left + 1, patchHeight = bottom - top + 1
            const patchCanvas = document.createElement('canvas'); patchCanvas.width = patchWidth; patchCanvas.height = patchHeight
            patchCanvas.getContext('2d')!.drawImage(scaled.canvas, left, top, patchWidth, patchHeight, 0, 0, patchWidth, patchHeight)
            facePatches.push({ index, canvas: patchCanvas, left, top, width: patchWidth, height: patchHeight, crop })
          } finally { scaled.dispose() }
        }
      } finally { frame.dispose() }
    }
    let faceAsset: EditorV6MotionBakeResult['faceAsset']
    if (facePatches.length) {
      const faceWidth = facePatches.reduce((total, patch) => total + patch.width, 0), faceHeight = Math.max(...facePatches.map((patch) => patch.height))
      const facePixels = faceWidth * faceHeight, bodyPixels = atlas.width * atlas.height
      if (faceWidth > 8192 || faceHeight > 8192 || facePixels + bodyPixels > maxAtlasPixels) throw Error('As camadas faciais desta transição excedem o limite seguro em resolução nativa. A exportação foi interrompida para não reduzir a nitidez do personagem.')
      const faceAtlas = document.createElement('canvas'); faceAtlas.width = faceWidth; faceAtlas.height = faceHeight
      const faceContext = faceAtlas.getContext('2d')!
      let offsetX = 0
      for (const patch of facePatches) {
        faceContext.drawImage(patch.canvas, offsetX, 0)
        const frame = frames[patch.index]
        frame.facePatch = { sprite: { x: offsetX, y: 0, width: patch.width, height: patch.height, atlasWidth: faceWidth, atlasHeight: faceHeight }, x: (patch.left - patch.crop.left) / patch.crop.width, y: (patch.top - patch.crop.top) / patch.crop.height, width: patch.width / patch.crop.width, height: patch.height / patch.crop.height }
        offsetX += patch.width
        patch.canvas.width = patch.canvas.height = 1
      }
      const faceAssetId = crypto.randomUUID(), assetId = crypto.randomUUID()
      const faceDataUrl = faceAtlas.toDataURL('image/png'), bodyDataUrl = atlas.toDataURL('image/png')
      faceAsset = { id: faceAssetId, category: 'character', name: 'Camadas faciais da transição', mimeType: 'image/png', dataUrl: faceDataUrl, timelineSnapshot: true }
      atlas.width = atlas.height = 1
      faceAtlas.width = faceAtlas.height = 1
      return { asset: { id: assetId, category: 'character', name: 'Transição de personagem', mimeType: 'image/png', dataUrl: bodyDataUrl, timelineSnapshot: true }, faceAsset, motion: { version: 1, key: request.plan.key, assetId, faceAssetId, frames }, metrics: { milliseconds: performance.now() - began, preparedRigs, samples: count, atlasPixels: bodyPixels + facePixels } }
    }
    const assetId = crypto.randomUUID(), atlasPixels = atlas.width * atlas.height, dataUrl = atlas.toDataURL('image/png')
    atlas.width = atlas.height = 1
    return { asset: { id: assetId, category: 'character', name: 'Transição de personagem', mimeType: 'image/png', dataUrl, timelineSnapshot: true }, motion: { version: 1, key: request.plan.key, assetId, frames }, metrics: { milliseconds: performance.now() - began, preparedRigs, samples: count, atlasPixels } }
  } finally { reusable?.dispose(); if (!session || materials.size > 4) materials.clear() }
}

import type { CharacterRenderAssetProvider } from '../../../../../shared/characterRenderAssets'
import type { FaceComponentPartId } from '../../../../../shared/customizer'
import type { FaceElementKind, FaceTransform } from '../../../../../shared/fabricator'
import type { EditorV6Element, EditorV6FaceRenderMode, EditorV6FaceTransform } from '../../../../../shared/editorV6'
import type { EditorV6MotionBakeRequest, EditorV6MotionBakeResult, EditorV6MotionFrame } from '../../../../../shared/editorV6Motion'
import { editorV6FaceModeDuringMotion } from '../../../../../shared/editorV6FaceSchedule'
import { interpolateEditorV6Face, interpolateEditorV6Pose, motionAngle, motionEase, motionLerp } from '../../../../../shared/editorV6MotionInterpolation'
import { editorV6ElementSize } from '../../../../../shared/editorV6SceneModel'
import { loadStandardExpressionEffects, prepareSavedCharacterRenderer, type GachaReusableMaterialCache } from '../../../characters/editorV6CharacterRenderer'

type Renderer = Awaited<ReturnType<typeof prepareSavedCharacterRenderer>>
type Crop = { left: number; top: number; width: number; height: number; fingerprint?: number }
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

/** Bake seven or fewer canonical rig samples into one bounded PNG atlas, off the UI thread. */
export type EditorV6BakeSession = { provider: CharacterRenderAssetProvider; materials: GachaReusableMaterialCache }
export function createEditorV6BakeSession(provider: CharacterRenderAssetProvider): EditorV6BakeSession {
  return { provider: cachedProvider(provider, true), materials: new Map() }
}
export async function bakeEditorV6Motion(request: EditorV6MotionBakeRequest, rawProvider: CharacterRenderAssetProvider, session?: EditorV6BakeSession): Promise<EditorV6MotionBakeResult> {
  const began = performance.now(), provider = cachedProvider(session?.provider ?? rawProvider), slot = request.character.customization.modelSlot ?? 1
  const source = await provider.loadFabricatorSlot(slot)
  if (!source) throw Error('O modelo do personagem não está disponível para animar.')
  const pose = async (state: EditorV6Element) => {
    const slotId = state.poseSlot === undefined ? request.character.customization.poseSlot : state.poseSlot
    if (slotId === null || slotId === undefined) return source
    const loaded = await provider.loadFabricatorPose(slot, slotId)
    if (!loaded) throw Error(`A pose ${slotId} não está disponível para animar.`)
    return loaded
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
  const render = async (progress: number, faceMode?: EditorV6FaceRenderMode, mouthScale = 1) => {
    const renderer = await prepare(progress), face = scaleMouthForExport(interpolateEditorV6Face(from, to, progress), mouthScale)
    try {
      const result = await renderer.renderToCanvas(face.appearance, face.transforms, face.effects, editorV6FaceModeDuringMotion(faceMode ?? face.mode))
      return { ...result, crop: cropOf(result.canvas, Boolean(request.mouthScaleSamples)), dispose: () => { if (!samePose) renderer.dispose() } }
    } catch (error) { if (!samePose) renderer.dispose(); throw error }
  }
  try {
    const first = await render(0), fromCrop = first.crop, fullWidth = first.width, fullHeight = first.height
    first.dispose()
    const last = await render(1), toCrop = last.crop
    const maximumWidth = Math.max(fullWidth, last.width), maximumHeight = Math.max(fullHeight, last.height)
    last.dispose()
    const count = request.plan.samples.length, columns = Math.ceil(Math.sqrt(count)), rows = Math.ceil(count / columns)
    const ratio = Math.min(1, 4096 / columns / maximumWidth, 4096 / rows / maximumHeight, Math.sqrt(8_000_000 / (columns * rows * maximumWidth * maximumHeight)))
    const cellWidth = Math.ceil(maximumWidth * ratio), cellHeight = Math.ceil(maximumHeight * ratio)
    const atlas = document.createElement('canvas'); atlas.width = cellWidth * columns; atlas.height = cellHeight * rows
    const context = atlas.getContext('2d')!
    const aa = editorV6ElementSize(request.plan.from), bb = editorV6ElementSize(request.plan.to)
    const fromScale = { x: aa.width * 19.2 / fromCrop.width, y: aa.height * 10.8 / fromCrop.height }, toScale = { x: bb.width * 19.2 / toCrop.width, y: bb.height * 10.8 / toCrop.height }
    const frames: EditorV6MotionFrame[] = []
    for (const [index, sample] of request.plan.samples.entries()) {
      const t = motionEase(sample.progress), frame = await render(t, sample.faceMode, request.mouthScaleSamples?.[index] ?? 1), crop = frame.crop
      try {
        if (request.mouthScaleSamples && index === request.mouthScaleSamples.length - 1 && crop.fingerprint === fromCrop.fingerprint) throw Error('A boca aberta não respondeu à ampliação; confira se o personagem tem uma variante de boca aberta editável no catálogo facial.')
        const x = index % columns * cellWidth, y = Math.floor(index / columns) * cellHeight, width = Math.max(1, Math.ceil(crop.width * ratio)), height = Math.max(1, Math.ceil(crop.height * ratio))
        context.drawImage(frame.canvas, crop.left, crop.top, crop.width, crop.height, x, y, width, height)
        const sx = motionLerp(fromScale.x, toScale.x, t), sy = motionLerp(fromScale.y, toScale.y, t)
        const originX = motionLerp(-aa.width * 9.6 - fromCrop.left * fromScale.x, -bb.width * 9.6 - toCrop.left * toScale.x, t)
        const originY = motionLerp(-aa.height * 5.4 - fromCrop.top * fromScale.y, -bb.height * 5.4 - toCrop.top * toScale.y, t)
        const rotation = motionAngle(from.rotation, to.rotation, t), flipX = Boolean(t < .5 ? from.flipX : to.flipX)
        const dx = (originX + (crop.left + crop.width / 2) * sx) * (flipX ? -1 : 1), dy = originY + (crop.top + crop.height / 2) * sy, radians = rotation * Math.PI / 180
        frames.push({ offset: sample.offset, sprite: { x, y, width, height, atlasWidth: atlas.width, atlasHeight: atlas.height }, x: motionLerp(from.x, to.x, t) + (dx * Math.cos(radians) - dy * Math.sin(radians)) / 19.2, y: motionLerp(from.y, to.y, t) + (dx * Math.sin(radians) + dy * Math.cos(radians)) / 10.8, width: crop.width * sx / 19.2, height: crop.height * sy / 10.8, rotation, flipX })
      } finally { frame.dispose() }
    }
    const assetId = crypto.randomUUID(), atlasPixels = atlas.width * atlas.height, dataUrl = atlas.toDataURL('image/png')
    atlas.width = atlas.height = 1
    return { asset: { id: assetId, category: 'character', name: 'Transição de personagem', mimeType: 'image/png', dataUrl, timelineSnapshot: true }, motion: { version: 1, key: request.plan.key, assetId, frames }, metrics: { milliseconds: performance.now() - began, preparedRigs, samples: count, atlasPixels } }
  } finally { reusable?.dispose(); if (!session || materials.size > 4) materials.clear() }
}

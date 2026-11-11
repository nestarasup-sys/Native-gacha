import type { CharacterRenderAssetProvider } from '../../../../../shared/characterRenderAssets'
import type { EditorV6Element, EditorV6FaceRenderMode } from '../../../../../shared/editorV6'
import type { EditorV6MotionBakeRequest, EditorV6MotionBakeResult, EditorV6MotionFrame } from '../../../../../shared/editorV6Motion'
import { editorV6FaceModeDuringMotion } from '../../../../../shared/editorV6FaceSchedule'
import { interpolateEditorV6Face, interpolateEditorV6Pose, motionAngle, motionEase, motionLerp } from '../../../../../shared/editorV6MotionInterpolation'
import type { prepareSavedCharacterRenderer, GachaReusableMaterialCache, PreparedGachaLayerFrame } from '../../../characters/editorV6CharacterRenderer'
import { chooseMotionAtlasLayout, MAX_MOTION_ATLAS_PIXELS } from './motionAtlasLayout'
import {
  changedMotionPixelBounds as changedBounds,
  normalizedMotionReplacementBounds as normalizedReplacementBounds,
  unionMotionCrops as unionCrop,
  unionMotionPixelBounds as unionBounds,
  type MotionPixelBounds as PixelBounds,
  type MotionPixelCrop as Crop
} from './motionPixelAnalysis'
import { createMotionPoseResolver } from './motionPoseResolver'
import { motionEndpointScale } from './motionEndpointScale'
import { resolveMotionBakeEndpointGeometry } from './motionBakeEndpointGeometry'
import type { HairBakeEndpointCrop } from './hairBakeEndpointGeometry'
import { cacheEditorV6MotionAssetProvider } from './motionAssetProviderCache'
import { createEditorV6BakeSession, type EditorV6BakeSession } from './bakeSession'
import { prepareEditorV6MotionFacePair, scaleEditorV6MotionMouth } from './motionFacePreparation'
import { createEditorV6MotionRigPreparer } from './motionRigPreparation'
import { cropPreparedMotionLayers, disposeCroppedMotionLayers, type CroppedMotionLayers } from './motionLayerCrops'
import { createChangedMotionPixelPatch, cropMotionCanvas, createTransparentMotionPatch, readMotionCanvasCrop } from './motionCanvasRegions'
import { prepareEditorV6MotionFacePatch, type BakedFacePatch } from './motionFacePatchPreparation'
import { buildEditorV6MotionFaceAtlas } from './motionFaceAtlas'

export { createEditorV6BakeSession }
export type { EditorV6BakeSession }

type Renderer = Awaited<ReturnType<typeof prepareSavedCharacterRenderer>>
type MotionFrameRender = { canvas: HTMLCanvasElement; width: number; height: number; crop: Crop; renderer: Renderer; layers?: PreparedGachaLayerFrame; mouthCanvas?: HTMLCanvasElement; mouthCrop?: Crop; dispose: () => void }
type BakedBodySample = { canvas: HTMLCanvasElement; crop: Crop; layers?: CroppedMotionLayers }
export type EditorV6MotionLayerAtlasCapture = {
  frames: Array<Pick<EditorV6MotionFrame, 'offset' | 'sprite' | 'x' | 'y' | 'width' | 'height' | 'rotation' | 'flipX'> & { crop: Omit<Crop, 'fingerprint'>; facePatch?: EditorV6MotionFrame['facePatch'] }>
  behindFace: HTMLCanvasElement
  face: HTMLCanvasElement
  posteriorHair: HTMLCanvasElement | null
  inFrontOfFace: HTMLCanvasElement | null
  eyesAboveRearHair: HTMLCanvasElement | null
}
function isBlinkUnavailable(error: unknown): boolean {
  return error instanceof Error && /Blink precisa|olho fechado correspondente|Selecione olhos do catálogo|assets de Olhos Dev/.test(error.message)
}
/** Bake canonical rig samples into one bounded PNG atlas, off the UI thread. */
export async function bakeEditorV6Motion(request: EditorV6MotionBakeRequest, rawProvider: CharacterRenderAssetProvider, session?: EditorV6BakeSession, captureLayerAtlases?: (capture: EditorV6MotionLayerAtlasCapture) => void, endpointCrops?: { from: HairBakeEndpointCrop; to: HairBakeEndpointCrop }): Promise<EditorV6MotionBakeResult> {
  const began = performance.now(), provider = cacheEditorV6MotionAssetProvider(session?.provider ?? rawProvider), slot = request.character.customization.modelSlot ?? 1
  const source = await provider.loadFabricatorSlot(slot)
  if (!source) throw Error('O modelo do personagem não está disponível para animar.')
  const resolvePose = createMotionPoseResolver(source, provider)
  const pose = (state: EditorV6Element) => {
    const slotId = state.poseSlot === undefined ? request.character.customization.poseSlot : state.poseSlot
    return resolvePose(slotId)
  }
  const [[fromPose, toPose], [from, to]] = await Promise.all([
    Promise.all([pose(request.plan.from), pose(request.plan.to)]),
    prepareEditorV6MotionFacePair(request.plan.from, request.plan.to, request.character.customization, provider)
  ])
  const materials: GachaReusableMaterialCache = session?.materials ?? new Map()
  const rigPreparer = createEditorV6MotionRigPreparer({
    character: request.character,
    source,
    provider,
    materials,
    session,
    fromPose,
    toPose,
    interpolateArtwork: progress => interpolateEditorV6Pose(fromPose, toPose, progress)
  })
  const { samePose, prepare } = rigPreparer
  let preparedAtlasFrames: BakedBodySample[] | undefined, pendingFacePatches: BakedFacePatch[] | undefined
  let facePatchAtlas: HTMLCanvasElement | undefined
  let behindFaceAtlas: HTMLCanvasElement | undefined, faceLayerAtlas: HTMLCanvasElement | undefined, posteriorHairAtlas: HTMLCanvasElement | null | undefined, inFrontOfFaceAtlas: HTMLCanvasElement | null | undefined, eyesAboveRearHairAtlas: HTMLCanvasElement | null | undefined
  const layerFrames: EditorV6MotionLayerAtlasCapture['frames'] = []
  const render = async (progress: number, faceMode?: EditorV6FaceRenderMode, mouthScale = 1, fingerprint = false, preparedRenderer?: Renderer, referenceMode = false, captureLayers = false): Promise<MotionFrameRender> => {
    const renderer = preparedRenderer ?? await prepare(progress), face = scaleEditorV6MotionMouth(interpolateEditorV6Face(from, to, progress), mouthScale)
    try {
      const mode = faceMode ?? face.mode
      const renderMode = referenceMode ? mode : editorV6FaceModeDuringMotion(mode)
      const isolateMouth = Boolean(request.mouthScaleSamples && (mode === 'talk' || mode === 'talk-blink') && renderer.canIsolateMouth(face.appearance))
      // A hair-layer bake needs both the full body and split layers. Render
      // expensive face assets once, not twice for every intermediate sample.
      const mouthOptions = isolateMouth ? { mouthLayer: 'without-mouth' as const } : undefined
      const layered = captureLayers
        ? await renderer.renderToCanvasWithLayers(face.appearance, face.transforms, face.effects, renderMode, mouthOptions)
        : undefined
      const result = layered ?? await renderer.renderToCanvas(face.appearance, face.transforms, face.effects, renderMode, mouthOptions)
      const layers = layered?.layers
      const mouth = isolateMouth ? await renderer.renderMouthToCanvas(face.appearance, face.transforms, face.effects, renderMode) : undefined
      return { ...result, crop: readMotionCanvasCrop(result.canvas, fingerprint), renderer, ...(layers ? { layers } : {}), ...(mouth ? { mouthCanvas: mouth.canvas, mouthCrop: readMotionCanvasCrop(mouth.canvas, fingerprint, 0) } : {}), dispose: () => {
        if (!samePose && !preparedRenderer && !(session && [...session.endpointRenderers.values()].includes(renderer))) renderer.dispose()
      } }
    } catch (error) {
      if (!samePose && !preparedRenderer && !(session && [...session.endpointRenderers.values()].includes(renderer))) renderer.dispose()
      throw error
    }
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
        let sourceCrop = readMotionCanvasCrop(fullTalk.canvas, false, 0)
        try {
          const fullTalkBlink = await baseline.renderer.renderToCanvas(from.faceAppearance, from.faceTransforms, from.activeExpressionEffects, 'talk-blink', { mouthLayer: 'all' })
          sourceCrop = unionCrop(sourceCrop, readMotionCanvasCrop(fullTalkBlink.canvas, false, 0))
        } catch (error) { if (!isBlinkUnavailable(error)) throw error }
        const isolatedBaseline = await render(0, from.activeFaceMode, 1, true, baseline.renderer, true)
        const baseTalkId = crypto.randomUUID()
        const baseTalkCanvas = cropMotionCanvas(isolatedBaseline.canvas, sourceCrop)
        const baseTalkDataUrl = baseTalkCanvas.toDataURL('image/png')
        const mouthlessBaseAssets: NonNullable<EditorV6MotionBakeResult['mouthlessBaseAssets']> = [{
          faceMode: 'talk', asset: { id: baseTalkId, category: 'character', name: 'Personagem sem boca · fala', mimeType: 'image/png', dataUrl: baseTalkDataUrl, timelineSnapshot: true }
        }]
        baseTalkCanvas.width = baseTalkCanvas.height = 1
        try {
          const talkBlink = await render(0, 'talk-blink', 1, false, isolatedBaseline.renderer, true)
          try {
            const baseTalkBlinkId = crypto.randomUUID()
            const baseTalkBlinkCanvas = cropMotionCanvas(talkBlink.canvas, sourceCrop)
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
          isolatedPatches.push({ canvas: createTransparentMotionPatch(isolatedBaseline.mouthCanvas!, baselineMouthCrop), crop: baselineMouthCrop })
          for (let index = 1; index < scales.length; index++) {
            const comparison = await render(0, from.activeFaceMode, scales[index], index === scales.length - 1, baseline.renderer)
            try {
              if (!comparison.mouthCanvas || !comparison.mouthCrop) throw Error('Não foi possível isolar a peça da boca para o ciclo de fala.')
              if (index === scales.length - 1 && comparison.mouthCrop.fingerprint === baselineMouthCrop.fingerprint) throw Error('A boca aberta não respondeu à ampliação; confira se o personagem tem uma variante de boca aberta editável no catálogo facial.')
              isolatedPatches.push({ canvas: createTransparentMotionPatch(comparison.mouthCanvas, comparison.mouthCrop), crop: comparison.mouthCrop })
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
            metrics: { milliseconds: performance.now() - began, ...rigPreparer.metrics(), samples: count, atlasPixels }
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
          patchCanvas = createChangedMotionPixelPatch(frame.canvas, { left, top, right, bottom })
          context.drawImage(patchCanvas, cellX, cellY)
          frames.push({ offset: sample.offset, sprite: { x: sx, y: sy, width: patchWidth, height: patchHeight, atlasWidth, atlasHeight }, x: from.x, y: from.y, width: from.width, height: from.height, rotation: from.rotation, flipX: Boolean(from.flipX), facePatch: { sprite: { x: sx, y: sy, width: patchWidth, height: patchHeight, atlasWidth, atlasHeight }, x, y, width, height, replace: true, replaceBounds: normalizedReplacementBounds(bounds, { left, top, right, bottom }) } })
        } finally { if (patchCanvas) { patchCanvas.width = 1; patchCanvas.height = 1 }; frame.dispose() }
      }
      const assetId = crypto.randomUUID(), dataUrl = atlas.toDataURL('image/png')
      atlas.width = atlas.height = 1
      return { asset: { id: assetId, category: 'character', name: 'Camada facial da boca', mimeType: 'image/png', dataUrl, timelineSnapshot: true }, assetRole: 'face-atlas', mouthIsolationMode: 'legacy-patch', motion: { version: 1, key: request.plan.key, assetId, frames }, metrics: { milliseconds: performance.now() - began, preparedRigs: rigPreparer.metrics().preparedRigs, reusedRigs: rigPreparer.metrics().reusedRigs, samples: count, atlasPixels } }
    }
    const { fromCrop, toCrop, maximumCanvasWidth, maximumCanvasHeight } = await resolveMotionBakeEndpointGeometry({
      captureLayerAtlases: Boolean(captureLayerAtlases),
      endpointCrops,
      staticMouthLoop,
      hasMouthScaleSamples: Boolean(request.mouthScaleSamples),
      firstFaceMode: from.activeFaceMode,
      render
    })
    const count = request.plan.samples.length
    const maxAtlasPixels = Math.min(MAX_MOTION_ATLAS_PIXELS, request.maxAtlasPixels ?? MAX_MOTION_ATLAS_PIXELS)
    let maximumWidth = maximumCanvasWidth, maximumHeight = maximumCanvasHeight
    let layout = chooseMotionAtlasLayout(count, maximumWidth, maximumHeight, 4096, maxAtlasPixels)
    let ratio = layout.ratio
    const frames: EditorV6MotionFrame[] = []
    const facePatches: BakedFacePatch[] = pendingFacePatches = []
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
          preparedAtlasFrames.push({ canvas: cropped, crop: frame.crop, ...(frame.layers ? { layers: cropPreparedMotionLayers(frame.layers, frame.crop) } : {}) })
          const facePatch = await prepareEditorV6MotionFacePatch({ index, faceMode: sample.faceMode, progress: t, mouthScale, mouthScaleSamples: request.mouthScaleSamples, frame, render })
          if (facePatch) facePatches.push(facePatch)
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
          const layers = baked?.layers ?? (frame?.layers ? cropPreparedMotionLayers(frame.layers, crop) : undefined)
          if (!layers || !behindFaceAtlas || !faceLayerAtlas || !inFrontOfFaceAtlas) throw Error('A preparação do cabelo não capturou as camadas da pose intermediária.')
          const drawLayer = (target: HTMLCanvasElement, source: HTMLCanvasElement | null) => {
            if (!source) return
            const targetContext = target.getContext('2d')!
            targetContext.drawImage(source, 0, 0, source.width, source.height, x, y, width, height)
          }
          drawLayer(behindFaceAtlas, layers.behindFace)
          drawLayer(faceLayerAtlas, layers.face)
          if (layers.posteriorHair) {
            if (!posteriorHairAtlas) { posteriorHairAtlas = document.createElement('canvas'); posteriorHairAtlas.width = atlas.width; posteriorHairAtlas.height = atlas.height }
            drawLayer(posteriorHairAtlas, layers.posteriorHair)
          }
          drawLayer(inFrontOfFaceAtlas, layers.inFrontOfFace)
          if (layers.eyesAboveRearHair) {
            if (!eyesAboveRearHairAtlas) { eyesAboveRearHairAtlas = document.createElement('canvas'); eyesAboveRearHairAtlas.width = atlas.width; eyesAboveRearHairAtlas.height = atlas.height }
            drawLayer(eyesAboveRearHairAtlas, layers.eyesAboveRearHair)
          }
          layerFrames.push({ offset: sample.offset, sprite: motionFrame.sprite, x: motionFrame.x, y: motionFrame.y, width: motionFrame.width, height: motionFrame.height, rotation: motionFrame.rotation, flipX: motionFrame.flipX, crop: { left: crop.left, top: crop.top, width: crop.width, height: crop.height } })
          if (baked?.layers) disposeCroppedMotionLayers(baked.layers)
          else if (layers !== baked?.layers) disposeCroppedMotionLayers(layers)
        }
        if (frame) {
          const facePatch = await prepareEditorV6MotionFacePatch({ index, faceMode: sample.faceMode, progress: t, mouthScale, mouthScaleSamples: request.mouthScaleSamples, frame, render })
          if (facePatch) facePatches.push(facePatch)
        }
      } finally {
        frame?.dispose()
        if (baked) baked.canvas.width = baked.canvas.height = 1
      }
    }
    let faceAsset: EditorV6MotionBakeResult['faceAsset']
    if (facePatches.length) {
      const bodyPixels = atlas.width * atlas.height
      const faceAtlas = buildEditorV6MotionFaceAtlas({ patches: facePatches, frames, bodyPixels, maxAtlasPixels })
      facePatchAtlas = faceAtlas.faceAtlas
      faceAsset = faceAtlas.faceAsset
      const { faceAssetId, assetId, facePixels } = faceAtlas
      const bodyDataUrl = atlas.toDataURL('image/png')
      if (captureLayerAtlases) captureLayerAtlases({ frames: frames.map(frame => {
        const captured = layerFrames.find(item => item.offset === frame.offset)
        if (!captured) throw Error('A preparação perdeu um quadro da pose sem cabelo.')
        return { ...captured, ...(frame.facePatch ? { facePatch: frame.facePatch } : {}) }
      }), behindFace: behindFaceAtlas!, face: faceLayerAtlas!, posteriorHair: posteriorHairAtlas ?? null, inFrontOfFace: inFrontOfFaceAtlas!, eyesAboveRearHair: eyesAboveRearHairAtlas ?? null })
      atlas.width = atlas.height = 1
      facePatchAtlas.width = facePatchAtlas.height = 1
      facePatchAtlas = undefined
      return { asset: { id: assetId, category: 'character', name: 'Transição de personagem', mimeType: 'image/png', dataUrl: bodyDataUrl, timelineSnapshot: true }, faceAsset, motion: { version: 1, key: request.plan.key, assetId, faceAssetId, frames }, metrics: { milliseconds: performance.now() - began, preparedRigs: rigPreparer.metrics().preparedRigs, reusedRigs: rigPreparer.metrics().reusedRigs, samples: count, atlasPixels: bodyPixels + facePixels } }
    }
    const assetId = crypto.randomUUID(), atlasPixels = atlas.width * atlas.height, dataUrl = atlas.toDataURL('image/png')
    if (captureLayerAtlases) captureLayerAtlases({ frames: frames.map(frame => {
      const captured = layerFrames.find(item => item.offset === frame.offset)
      if (!captured) throw Error('A preparação perdeu um quadro da pose sem cabelo.')
      return { ...captured, ...(frame.facePatch ? { facePatch: frame.facePatch } : {}) }
    }), behindFace: behindFaceAtlas!, face: faceLayerAtlas!, posteriorHair: posteriorHairAtlas ?? null, inFrontOfFace: inFrontOfFaceAtlas!, eyesAboveRearHair: eyesAboveRearHairAtlas ?? null })
    atlas.width = atlas.height = 1
    return { asset: { id: assetId, category: 'character', name: 'Transição de personagem', mimeType: 'image/png', dataUrl, timelineSnapshot: true }, motion: { version: 1, key: request.plan.key, assetId, frames }, metrics: { milliseconds: performance.now() - began, preparedRigs: rigPreparer.metrics().preparedRigs, reusedRigs: rigPreparer.metrics().reusedRigs, samples: count, atlasPixels } }
  } finally {
    preparedAtlasFrames?.forEach(({ canvas, layers }) => { canvas.width = canvas.height = 1; disposeCroppedMotionLayers(layers) })
    pendingFacePatches?.forEach(({ canvas }) => { canvas.width = canvas.height = 1 })
    if (behindFaceAtlas) behindFaceAtlas.width = behindFaceAtlas.height = 1
    if (faceLayerAtlas) faceLayerAtlas.width = faceLayerAtlas.height = 1
    if (posteriorHairAtlas) posteriorHairAtlas.width = posteriorHairAtlas.height = 1
    if (inFrontOfFaceAtlas) inFrontOfFaceAtlas.width = inFrontOfFaceAtlas.height = 1
    if (eyesAboveRearHairAtlas) eyesAboveRearHairAtlas.width = eyesAboveRearHairAtlas.height = 1
    if (facePatchAtlas) facePatchAtlas.width = facePatchAtlas.height = 1
    rigPreparer.disposeTransientReusable()
    session?.trim()
    if (!session || materials.size > 4) materials.clear()
  }
}

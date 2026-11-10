import { bakeFaceModeAssets, measureFaceModeCrop, trimTransparentCanvas } from '../../src/renderer/src/features/editorV6/faceModeAssets'
import { defaultCharacterBodyDimensions, defaultCharacterProportions } from '../../src/shared/customizer'
import { bindWardrobeComponent } from '../../src/shared/wardrobePose'
import { editorV6MouthLoopScaleAtFrame } from '../../src/shared/editorV6Export'
import { buildEditorV6ExpressionTransforms } from '../../src/renderer/src/characters/editorV6ExpressionTransforms'
import type { FaceComponentAsset, FaceExpressionPreset, HairStyle } from '../../src/shared/fabricator'
import { checkConcurrentSourceRefresh } from './sourceRefresh.browser'
import { createElement, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { EditorV6Timeline } from '../../src/renderer/src/features/editorV6/EditorV6Timeline'
import type { CharacterRenderAssetProvider } from '../../src/shared/characterRenderAssets'
import type { CustomizerCharacter } from '../../src/shared/customizer'
import type { FaceCatalogItem, FabricatorProject } from '../../src/shared/fabricator'
import { createEditorV6Timeline, type EditorV6Document, type EditorV6Element } from '../../src/shared/editorV6'
import { editorV6MotionResultSchema } from '../../src/shared/editorV6Schema'
import { editorV6MotionPlan, editorV6MotionPlans } from '../../src/shared/editorV6Motion'
import { FIRST_HAIR_MOTION_PRESET } from '../../src/shared/hairMotionEngine'
import { prepareSavedCharacterRenderer } from '../../src/renderer/src/characters/editorV6CharacterRenderer'
import { bakeEditorV6Motion } from '../../src/renderer/src/features/editorV6/motion/bakeMotion'
import { SceneSurface } from '../../src/renderer/src/features/editorV6/SceneSurface'
import { composeEditorV6FaceReplacements } from '../../src/renderer/src/features/editorV6/sceneFaceComposition'
import { faceRenderGeometry } from '../../src/renderer/src/characters/characterGeometry'
import { prepareEditorV6HairMotionBundle } from '../../src/renderer/src/features/editorV6/editorV6HairMotionPreparation'
const assert = (ok: unknown, message: string) => { if (!ok) throw Error(message) }
function png(color: string) { const c = document.createElement('canvas'); c.width = c.height = 10; const x = c.getContext('2d')!; x.fillStyle = color; x.fillRect(0,0,10,10); return c.toDataURL() }
async function image(url: string) { const i = new Image(); i.src = url; await i.decode(); return i }
async function captureScene(scene: unknown, assets: unknown[], renderLayer: 'all' | 'foreground') {
  const mount = document.createElement('div'); document.body.append(mount)
  const root = createRoot(mount)
  flushSync(() => root.render(createElement(SceneSurface, { scene, assets, renderLayer, outputWidth: 384, outputHeight: 216 } as never)))
  const svg = mount.querySelector('svg')!
  const source = new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' })
  const url = URL.createObjectURL(source)
  try {
    const rendered = await image(url), canvas = document.createElement('canvas'); canvas.width = 384; canvas.height = 216
    const context = canvas.getContext('2d', { willReadFrequently: true })!; context.drawImage(rendered, 0, 0)
    return new Uint8ClampedArray(context.getImageData(0, 0, 384, 216).data)
  } finally { URL.revokeObjectURL(url); root.unmount(); mount.remove() }
}
;(globalThis as unknown as { runMotionCheck: () => Promise<unknown> }).runMotionCheck = async () => {
  const variantCanvas = document.createElement('canvas')
  variantCanvas.width = variantCanvas.height = 100
  const variantContext = variantCanvas.getContext('2d')!
  const variantRenderer = { renderToCanvas: async (_a: unknown, _t: unknown, _e: unknown, mode: string) => {
    variantContext.clearRect(0, 0, 100, 100)
    variantContext.fillStyle = '#ff0000'
    variantContext.fillRect(40, 40, 20, 20)
    if (mode !== 'idle') variantContext.fillRect(70, 70, 5, 5)
    return { canvas: variantCanvas, width: 100, height: 100 }
  } } as unknown as Parameters<typeof bakeFaceModeAssets>[1]
  const variants = await bakeFaceModeAssets('Synthetic union', variantRenderer, undefined, undefined, undefined, 'idle')
  assert(variants.crop?.left === 40 && variants.crop.top === 40 && variants.crop.width === 35 && variants.crop.height === 35, 'Facial variants were cropped using idle bounds')
  const measuredCrop = await measureFaceModeCrop('Synthetic union', variantRenderer, undefined, undefined, undefined, 'idle')
  assert(measuredCrop?.left === variants.crop.left && measuredCrop.top === variants.crop.top && measuredCrop.width === variants.crop.width && measuredCrop.height === variants.crop.height, 'Hair preparation used a different crop from the saved facial snapshots')
  for (const asset of variants.extraAssets) {
    const decoded = await image(asset.dataUrl)
    const check = document.createElement('canvas'); check.width = check.height = 35
    const ctx = check.getContext('2d')!; ctx.drawImage(decoded, 0, 0)
    assert(ctx.getImageData(32, 32, 1, 1).data[3] === 255, 'A facial variant lost pixels outside idle bounds')
  }
  const source: FabricatorProject = { schemaVersion: 1, slot: 1, name: 'Synthetic', sourceName: 'test', sourceAssetName: 'test', sourceDataUrl: '', width: 100, height: 100, tolerance: 0, updatedAt: new Date().toISOString(), joints: [], layerOrder: ['head','arm'], parts: [ { id: 'head', name: 'head', x: 35, y: 20, width: 30, height: 60, rotation: 0, dataUrl: png('#ff0000') }, { id: 'arm', name: 'arm', x: 10, y: 50, width: 10, height: 10, rotation: 0, dataUrl: png('#0000ff') } ] }
  const target = { ...source, parts: source.parts.map(p => p.id === 'arm' ? { ...p, x: 80 } : p) }
  const character: CustomizerCharacter = { id: 'alice', name: 'Alice', hair: '', outfit: '', skin: '', createdAt: source.updatedAt, updatedAt: source.updatedAt, customization: { modelSlot: 1, poseSlot: null, partOverrides: {}, layerOrder: [] } }
  const actor: EditorV6Element = { id: crypto.randomUUID(), kind: 'character', characterId: character.id, text: 'Alice', x: 0, y: 0, width: 20, height: 40, rotation: 0, zIndex: 1, poseSlot: 1 }
  const previous = { id: crypto.randomUUID(), elementId: actor.id, label: 'A', startFrame: 0, durationFrames: 30, state: actor }
  const next = { ...previous, id: crypto.randomUUID(), startFrame: 30, state: { ...actor, poseSlot: 2 } }
  const track = { id: crypto.randomUUID(), kind: 'character' as const, name: 'Alice', characterId: character.id, blocks: [previous,next] }
  const plan = editorV6MotionPlan(track,previous,next)!
  const reads: Record<string,number> = {}
  const provider = new Proxy({}, { get: (_, name: string) => async (...args: unknown[]) => { reads[name] = (reads[name] ?? 0) + 1; if (name === 'loadFabricatorSlot') return source; if (name === 'loadFabricatorPose') return args[1] === 1 ? source : target; if (name.startsWith('list')) return []; return null } }) as CharacterRenderAssetProvider
  const original = HTMLCanvasElement.prototype.getContext
  const canvases = new Set<HTMLCanvasElement>()
  HTMLCanvasElement.prototype.getContext = function (...args: unknown[]) { canvases.add(this); return original.apply(this, args as never) } as typeof original
  let serializedTransitionLayers: { frames: Array<{ sprite: { atlasWidth: number; atlasHeight: number } }>; dataUrls: string[] } | undefined
  const result = await bakeEditorV6Motion({ id: crypto.randomUUID(), plan, character }, provider, undefined, capture => {
    serializedTransitionLayers = {
      frames: capture.frames,
      dataUrls: [capture.behindFace, capture.face, capture.posteriorHair, capture.inFrontOfFace, capture.eyesAboveRearHair].filter((canvas): canvas is HTMLCanvasElement => Boolean(canvas)).map(canvas => canvas.toDataURL('image/png'))
    }
  })
  HTMLCanvasElement.prototype.getContext = original
  assert(result.metrics.samples === 7 && result.metrics.atlasPixels <= 8_100_000, 'Invalid atlas budget or sample count')
  const capturedLayers = serializedTransitionLayers
  if (!capturedLayers) throw Error('The export-only layer callback returned no atlas')
  assert(capturedLayers.frames.length === 7 && capturedLayers.dataUrls.length === 3, 'The export-only layer callback did not capture every intermediate body/face atlas')
  const transitionLayerImages = await Promise.all(capturedLayers.dataUrls.map(image))
  assert(transitionLayerImages.every(atlas => atlas.width === capturedLayers.frames[0].sprite.atlasWidth && atlas.height === capturedLayers.frames[0].sprite.atlasHeight && atlas.width > 1 && atlas.height > 1), 'A transition layer atlas was serialized after its canvas had been released')
  const behindLayerCanvas = document.createElement('canvas')
  behindLayerCanvas.width = transitionLayerImages[0].width; behindLayerCanvas.height = transitionLayerImages[0].height
  const behindLayerContext = behindLayerCanvas.getContext('2d', { willReadFrequently: true })!
  behindLayerContext.drawImage(transitionLayerImages[0], 0, 0)
  const behindLayerAlpha = behindLayerContext.getImageData(0, 0, behindLayerCanvas.width, behindLayerCanvas.height).data.filter((_value, index) => index % 4 === 3 && _value > 0).length
  assert(behindLayerAlpha > 100, 'The serialized hairless body atlas is blank')
  assert(result.metrics.preparedRigs === 9, 'Pose rigs were incorrectly reused')
  assert(reads.loadFabricatorSlot === 1 && reads.loadFabricatorPose === 2, 'Source reads were repeated per sample')
  let hairlessFrames: import('../../src/renderer/src/features/editorV6/motion/bakeMotion').EditorV6MotionLayerAtlasCapture['frames'] = []
  const originalBounds = { left: 0, top: 0, width: 100, height: 100 }
  await bakeEditorV6Motion({ id: crypto.randomUUID(), plan, character }, provider, undefined, capture => { hairlessFrames = capture.frames }, { from: originalBounds, to: originalBounds })
  assert(hairlessFrames.length === 7 && hairlessFrames.every(frame => Math.abs(frame.width / frame.crop.width - actor.width / originalBounds.width) < 1e-9 && Math.abs(frame.height / frame.crop.height - actor.height / originalBounds.height) < 1e-9), 'The hairless transition scaled its body using its own crop instead of the original character bounds')
  assert(hairlessFrames.some(frame => frame.crop.height < originalBounds.height), 'The fixture must distinguish the hairless crop from the original character bounds')
  const expandedSource = { ...source, width: 1122, height: 1402 }
  const expandedTarget = { ...target, width: 1122, height: 1402 }
  const expandedProvider = new Proxy({}, { get: (_, name: string) => async (...args: unknown[]) => {
    if (name === 'loadFabricatorSlot') return expandedSource
    if (name === 'loadFabricatorPose') return args[1] === 1 ? expandedSource : expandedTarget
    if (name.startsWith('list')) return []
    return null
  } }) as CharacterRenderAssetProvider
  const transparentMargins = await bakeEditorV6Motion({ id: crypto.randomUUID(), plan, character }, expandedProvider)
  const compactAtlas = await image(transparentMargins.asset.dataUrl)
  assert(transparentMargins.metrics.atlasPixels === compactAtlas.width * compactAtlas.height
    && transparentMargins.metrics.atlasPixels < 8_000_000
    && compactAtlas.width < 3366 && compactAtlas.height < 4206,
  'Transparent canvas margins incorrectly caused a native transition atlas limit failure')
  assert(transparentMargins.metrics.preparedRigs === 9, 'Compacting a transition atlas rendered its pose rigs more than once')
  const tallSource = {
    ...source,
    width: 744,
    height: 1217,
    parts: source.parts.map((part) => part.id === 'head'
      ? { ...part, x: 0, y: 0, width: 744, height: 1217 }
      : part)
  }
  const tallTarget = {
    ...tallSource,
    parts: tallSource.parts.map((part) => part.id === 'arm' ? { ...part, x: 80 } : part)
  }
  const tallProvider = new Proxy({}, { get: (_, name: string) => async (...args: unknown[]) => {
    if (name === 'loadFabricatorSlot') return tallSource
    if (name === 'loadFabricatorPose') return args[1] === 1 ? tallSource : tallTarget
    if (name.startsWith('list')) return []
    return null
  } }) as CharacterRenderAssetProvider
  const packedPortrait = await bakeEditorV6Motion({ id: crypto.randomUUID(), plan, character }, tallProvider)
  const packedPortraitAtlas = await image(packedPortrait.asset.dataUrl)
  assert(packedPortrait.metrics.samples === 7 && packedPortrait.metrics.atlasPixels === 2_976 * 2_434
    && packedPortraitAtlas.width === 2_976 && packedPortraitAtlas.height === 2_434,
  'Seven native portrait samples were rejected because the atlas reserved two empty cells')
  const atlas = await image(result.asset.dataUrl)
  const blueXs = []
  for (const frame of result.motion.frames) {
    const c = document.createElement('canvas'); c.width = frame.sprite.width; c.height = frame.sprite.height; const x = c.getContext('2d')!; const s = frame.sprite
    x.drawImage(atlas,s.x,s.y,s.width,s.height,0,0,c.width,c.height)
    const pixels = x.getImageData(0,0,c.width,c.height).data
    let sum = 0, count = 0
    for (let i=0;i<pixels.length;i+=4) if (pixels[i+2]>200 && pixels[i]<20 && pixels[i+3]>240) { sum += ((i/4)%c.width)/c.width; count++ }
    assert(count > 20, 'Moving arm disappeared or became translucent')
    blueXs.push(sum/count)
  }
  assert(blueXs.every((x,i)=>i===0 || x>blueXs[i-1]), 'Parts did not move progressively across atlas samples')
  const alive = [...canvases].filter(c=>c.width>1 && c.height>1)
  // Only temporary source/warp surfaces may remain; all nine prepared 100x100 rigs must be released.
  assert(alive.filter(c=>c.width===100 && c.height===100).length===0, 'Prepared rig backing stores were retained')
  const mouth: FaceCatalogItem = { schemaVersion: 1, id: 'mouth-test', modelSlot: 1, category: 'mouth-closed', name: 'Test mouth', sheet: { kind: 'mouth-closed', name: 'Mouth', width: 10, height: 10, tolerance: 0, dataUrl: png('#00ff00') }, pieces: [{ id: 'mouth', sheet: 'mouth-closed', index: 0, crop: { x: 0,y: 0,width: 10,height: 10 }, width: 10,height: 10,dataUrl: png('#00ff00') }], transforms: { mouth: { x: 5,y: 35,scaleX: .5,scaleY: .5,rotation: 0 } }, eyeLinked: true,browLinked: true,selectedNose: 0,selectedExpression: 0,updatedAt: source.updatedAt }
  const openMouth: FaceCatalogItem = { ...mouth, id: 'mouth-open-test', category: 'mouth-open', sheet: { ...mouth.sheet, kind: 'mouth-open' }, pieces: mouth.pieces.map((piece) => ({ ...piece, sheet: 'mouth-open' })) }
  const facialProvider = { ...Object.fromEntries(['loadFabricatorSlot','loadFabricatorPose','loadHairStyle','loadWardrobeSet','loadFaceSet','listFaceComponentAssets','loadFaceComponentAsset','listFaceCatalog','listFaceExpressionPresets','loadFaceExpressionPreset'].map(name => [name, provider[name as keyof typeof provider]])), loadFaceCatalogItem: async (_modelSlot: number, id: string) => id === openMouth.id ? openMouth : mouth } as CharacterRenderAssetProvider
  const appearance = { modelSlot: 1,mouthClosedCatalogId: mouth.id,mouthOpenCatalogId: openMouth.id,eyeState: 0 as const,eyebrows: false,noseIndex: 0,expressionIndex: 0,mouthOpen: false }
  const facialCharacter = { ...character, customization: { ...character.customization, faceAppearance: appearance } }
  // The export-only hair bake previously drew the entire face twice: once
  // into the body and again into a separate face layer. Assert exact native
  // RGBA equality before relying on the new single-pass dual-output route.
  const dualRenderer = await prepareSavedCharacterRenderer(facialCharacter, { source, artwork: source, assetProvider: facialProvider })
  try {
    for (const mode of ['idle', 'talk'] as const) {
      const originalFrame = await dualRenderer.renderToCanvas(appearance, undefined, undefined, mode)
      const reference = new Uint8ClampedArray(originalFrame.canvas.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, originalFrame.width, originalFrame.height).data)
      const pairedFrame = await dualRenderer.renderToCanvasWithLayers(appearance, undefined, undefined, mode)
      const changed = pairedFrame.canvas.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, pairedFrame.width, pairedFrame.height).data
      assert(pairedFrame.width === originalFrame.width && pairedFrame.height === originalFrame.height, 'Dual-output face composition changed its canvas dimensions')
      let differences = 0
      let maximumDelta = 0
      let alphaDifferences = 0
      const differentPixels = new Set<number>()
      const samples: Array<{ x: number; y: number; channel: number; expected: number; actual: number }> = []
      for (let channel = 0; channel < reference.length; channel++) if (reference[channel] !== changed[channel]) {
        differences++
        const delta = Math.abs(reference[channel] - changed[channel])
        maximumDelta = Math.max(maximumDelta, delta)
        const pixel = Math.floor(channel / 4)
        differentPixels.add(pixel)
        if (channel % 4 === 3) alphaDifferences++
        if (samples.length < 12) samples.push({ x: pixel % pairedFrame.width, y: Math.floor(pixel / pairedFrame.width), channel: channel % 4, expected: reference[channel], actual: changed[channel] })
      }
      // Canvas stores each intermediate transparent layer in 8-bit premultiplied
      // form. Drawing that layer over the already composited body can therefore
      // round an antialiased color edge by one LSB compared with direct painting.
      // Keep the visual tolerance explicit and tight: alpha must remain exact,
      // color delta <= 1, and fewer than 0.2% of pixels may differ.
      const pixelBudget = Math.floor(reference.length / 4 * 0.002)
      assert(alphaDifferences === 0 && maximumDelta <= 1 && differentPixels.size <= pixelBudget,
        `Single-pass face parity exceeded its 1-LSB color-edge budget in ${mode} mode (${differences} channels/${differentPixels.size} pixels; alpha ${alphaDifferences}; max delta ${maximumDelta}; allowed pixels ${pixelBudget}; samples ${JSON.stringify(samples)})`)
      assert(pairedFrame.layers.face.width > 1 && pairedFrame.layers.behindFace.width > 1, 'Dual-output renderer lost the export-only layers')
    }
  } finally { dualRenderer.dispose() }
  const talkFrom = { ...previous, state: { ...actor, faceAppearance: appearance, activeFaceMode: 'talk' as const } }
  const talkTo = { ...next, state: { ...actor, poseSlot: 2, faceAppearance: appearance, activeFaceMode: 'talk' as const } }
  const talkPlanBase = editorV6MotionPlan(track, talkFrom, talkTo)!
  const talkPlan = { ...talkPlanBase, key: 'synthetic-talking-pose-transition', samples: talkPlanBase.samples.map((sample) => ({ ...sample, faceMode: 'talk' as const })) }
  const talkScales = [1, 1.05, 1.1025, 1.05, 1.1025, 1.05, 1.1025]
  const talkingTransition = await bakeEditorV6Motion({ id: crypto.randomUUID(), plan: talkPlan, character: facialCharacter, mouthScaleSamples: talkScales }, facialProvider)
  assert(talkingTransition.metrics.preparedRigs === 9, 'Talking mouth samples prepared duplicate pose rigs during a transition')
  assert(talkingTransition.motion.frames.slice(1).every((frame) => Boolean(frame.facePatch)), 'Talking mouth samples lost their local facial patches during a pose transition')
  const legacyTransitionScales = talkingTransition.motion.frames.map((frame) => frame.width / frame.sprite.width)
  assert(Math.max(...legacyTransitionScales) - Math.min(...legacyTransitionScales) < 0.000001, 'An older project without characterCanvasWidth changed character scale while its pose moved')
  assert(Boolean(talkingTransition.faceAsset), 'Talking transition did not return the localized facial atlas')
  const transitionFaceAtlas = await image(talkingTransition.faceAsset!.dataUrl)
  for (const frame of talkingTransition.motion.frames) if (frame.facePatch) {
    const sprite = frame.facePatch.sprite, patchCanvas = document.createElement('canvas')
    patchCanvas.width = sprite.width; patchCanvas.height = sprite.height
    const patchContext = patchCanvas.getContext('2d')!
    patchContext.drawImage(transitionFaceAtlas, sprite.x, sprite.y, sprite.width, sprite.height, 0, 0, sprite.width, sprite.height)
    const pixels = patchContext.getImageData(0, 0, sprite.width, sprite.height).data
    let coloredPixels = 0
    for (let offset = 0; offset < pixels.length; offset += 4) if (pixels[offset + 3] > 0) {
      coloredPixels++
      assert(pixels[offset] < 30 && pixels[offset + 1] > 220 && pixels[offset + 2] < 30, 'The isolated mouth atlas contains pixels from skin, eyes, hair, or clothing')
    }
    assert(frame.facePatch.replace !== true && coloredPixels > 0, 'The mouth is not a transparent overlay made from the mouth piece alone')
  }
  assert(editorV6MotionResultSchema.safeParse(talkingTransition).success, 'A talking pose transition exceeded the motion result contract')
  const expressionActor = { ...actor, width: 20, height: 26.6666666667, characterCanvasWidth: 25 }
  const firstFace = { ...previous,state: { ...expressionActor,faceAppearance: appearance } }
  const same = { ...next, state: { ...expressionActor,faceAppearance: appearance,activeExpressionPresetId: 'other',faceTransforms: { 'expression:mouth-closed:mouth-test': { x: 0,y: 0,width: 100,height: 100,rotation: 0,sourceTransformOverride: { x: 65,y: 35,scaleX: .5,scaleY: .5,rotation: 0 } } } } }
  const expressionPlan = editorV6MotionPlan(track,firstFace,same)!
  const expressionRenderer = await prepareSavedCharacterRenderer(facialCharacter, { source, artwork: source, assetProvider: facialProvider })
  const fromExpression = await expressionRenderer.renderToCanvas(appearance, firstFace.state.faceTransforms, firstFace.state.activeExpressionEffects, 'idle')
  const sourceCanvasWidth = fromExpression.width, sourceCanvasHeight = fromExpression.height
  const sourcePixels = fromExpression.canvas.getContext('2d')!.getImageData(0, 0, sourceCanvasWidth, sourceCanvasHeight).data
  const fromCrop = trimTransparentCanvas(fromExpression.canvas)
  const toExpression = await expressionRenderer.renderToCanvas(appearance, same.state.faceTransforms, same.state.activeExpressionEffects, 'idle')
  const toCrop = trimTransparentCanvas(toExpression.canvas)
  const stableFrom = { ...firstFace.state, ...faceRenderGeometry(firstFace.state, fromExpression, fromCrop, 1920, 1080) }
  const stableTo = { ...same.state, ...faceRenderGeometry(same.state, toExpression, toCrop, 1920, 1080, fromCrop) }
  fromExpression.canvas.width = fromExpression.canvas.height = toExpression.canvas.width = toExpression.canvas.height = 1
  expressionRenderer.dispose()
  const stableExpressionPlan = { ...expressionPlan, key: 'expression-with-stable-crop-anchor', from: stableFrom, to: stableTo }
  const facial = await bakeEditorV6Motion({ id: crypto.randomUUID(), plan: stableExpressionPlan, character: facialCharacter },facialProvider)
  assert(facial.metrics.preparedRigs === 1, 'Expression-only transition rebuilt the static rig')
  assert(new Set(facial.motion.frames.map((frame) => frame.sprite.width)).size > 1, 'The expression fixture did not change the visible crop bounds')
  const perPixelCharacterScale = facial.motion.frames.map((frame) => frame.width / frame.sprite.width)
  assert(Math.max(...perPixelCharacterScale) - Math.min(...perPixelCharacterScale) < 0.000001, 'Changing facial crop bounds changed the character scale during an expression transition')
  const expressionAtlas = await image(facial.asset.dataUrl)
  const bodyLandmark = (pixels: Uint8ClampedArray, width: number, height: number) => {
    let x = 0, y = 0, count = 0
    for (let offset = 0; offset < pixels.length; offset += 4) if (pixels[offset] < 40 && pixels[offset + 1] < 40 && pixels[offset + 2] > 200 && pixels[offset + 3] > 200) { x += (offset / 4) % width; y += Math.floor(offset / 4 / width); count++ }
    assert(count > 10, 'A transição facial perdeu o marcador sintético do corpo.')
    return { x: x / count, y: y / count }
  }
  const sourceLandmark = bodyLandmark(sourcePixels, sourceCanvasWidth, sourceCanvasHeight)
  const sourceCenterX = (fromCrop?.left ?? 0) + (fromCrop?.width ?? sourceCanvasWidth) / 2
  const sourceCenterY = (fromCrop?.top ?? 0) + (fromCrop?.height ?? sourceCanvasHeight) / 2
  const expectedLandmark = {
    x: (50 + stableFrom.x) * 19.2 + (sourceLandmark.x - sourceCenterX) * stableFrom.characterCanvasWidth! * 19.2 / sourceCanvasWidth,
    y: (50 + stableFrom.y) * 10.8 + (sourceLandmark.y - sourceCenterY) * stableFrom.characterCanvasWidth! * 19.2 / sourceCanvasWidth
  }
  let maxLandmarkDrift = 0
  for (const frame of facial.motion.frames) {
    const sprite = frame.sprite, frameCanvas = document.createElement('canvas'); frameCanvas.width = sprite.width; frameCanvas.height = sprite.height
    const frameContext = frameCanvas.getContext('2d')!
    frameContext.drawImage(expressionAtlas, sprite.x, sprite.y, sprite.width, sprite.height, 0, 0, sprite.width, sprite.height)
    const landmark = bodyLandmark(frameContext.getImageData(0, 0, sprite.width, sprite.height).data, sprite.width, sprite.height)
    const point = {
      x: (50 + frame.x) * 19.2 + (landmark.x / sprite.width - .5) * frame.width * 19.2,
      y: (50 + frame.y) * 10.8 + (landmark.y / sprite.height - .5) * frame.height * 10.8
    }
    maxLandmarkDrift = Math.max(maxLandmarkDrift, Math.hypot(point.x - expectedLandmark.x, point.y - expectedLandmark.y))
  }
  assert(maxLandmarkDrift < 1, `O corpo derivou ${maxLandmarkDrift.toFixed(3)} px durante uma transição apenas facial.`)
  const faceAtlas = await image(facial.asset.dataUrl), greenXs: number[] = []
  for (const frame of facial.motion.frames) {
    const c = document.createElement('canvas'),s = frame.sprite; c.width=s.width;c.height=s.height;const ctx=c.getContext('2d')!;ctx.drawImage(faceAtlas,s.x,s.y,s.width,s.height,0,0,c.width,c.height)
    const pixels=ctx.getImageData(0,0,c.width,c.height).data;let sum=0,count=0
    for(let i=0;i<pixels.length;i+=4) if(pixels[i+1]>200 && pixels[i]<20 && pixels[i+2]<20 && pixels[i+3]>240) {sum+=(i/4)%c.width;count++}
    assert(count>0,'Mouth disappeared during facial interpolation');greenXs.push(sum/count)
  }
  assert(greenXs.every((x,i)=>i===0 || x>=greenXs[i-1]) && greenXs[6]-greenXs[0]>10,'Facial preset did not interpolate from the actual catalog calibration')
  const mouthState: EditorV6Element = { ...actor, faceAppearance: appearance, activeFaceMode: 'talk' }
  const mouthSamples = [-3, -2, -1].map((offset, index) => ({ offset, progress: .6 + index * .13, faceMode: 'talk' as const }))
  const mouthPlan = { blockId: crypto.randomUUID(), elementId: actor.id, characterId: character.id, key: 'synthetic-mouth-loop', startFrame: .5, endFrame: 8, from: mouthState, to: { ...mouthState }, samples: mouthSamples }
  const mouthOptimized = await bakeEditorV6Motion({ id: crypto.randomUUID(), plan: mouthPlan, character: facialCharacter, mouthScaleSamples: [1, 1.05, 1.1025], maxAtlasPixels: 8_000_000 }, facialProvider)
  const mouthReferencePlan = { ...mouthPlan, key: 'synthetic-mouth-reference', to: { ...mouthState, text: 'Alice reference' } }
  const mouthReference = await bakeEditorV6Motion({ id: crypto.randomUUID(), plan: mouthReferencePlan, character: facialCharacter, mouthScaleSamples: [1, 1.05, 1.1025], maxAtlasPixels: 8_000_000 }, facialProvider)
  const localizedAtlas = mouthOptimized.motion.frames[0].facePatch!.sprite
  assert(mouthOptimized.metrics.samples === 3 && mouthOptimized.motion.frames.every(frame => Boolean(frame.facePatch))
    && mouthOptimized.mouthlessBaseAssets?.length === 2
    && localizedAtlas.atlasWidth * localizedAtlas.atlasHeight === mouthOptimized.metrics.atlasPixels
    && mouthOptimized.metrics.atlasPixels < mouthReference.metrics.atlasPixels,
    'The static mouth loop did not keep its complete animation in a localized facial atlas')
  const hiCanvas = document.createElement('canvas'); hiCanvas.width = 640; hiCanvas.height = 960
  const hiContext = hiCanvas.getContext('2d')!; hiContext.fillStyle = '#e7bf48'; hiContext.fillRect(0, 0, 640, 960)
  hiContext.strokeStyle = '#573c24'; hiContext.lineWidth = 2
  for (let x = 0; x <= 640; x += 8) { hiContext.beginPath(); hiContext.moveTo(x, 0); hiContext.lineTo(x, 960); hiContext.stroke() }
  for (let y = 0; y <= 960; y += 8) { hiContext.beginPath(); hiContext.moveTo(0, y); hiContext.lineTo(640, y); hiContext.stroke() }
  const hiSource: FabricatorProject = { ...source, width: 640, height: 960, joints: [], layerOrder: ['torso', 'thigh', 'head'], parts: [
    { id: 'head', name: 'Head', x: 160, y: 40, width: 320, height: 400, rotation: 0, dataUrl: hiCanvas.toDataURL() },
    { id: 'torso', name: 'Torso', x: 220, y: 440, width: 200, height: 250, rotation: 0, dataUrl: png('#d9ac89') },
    { id: 'thigh', name: 'Thigh', x: 220, y: 690, width: 160, height: 200, rotation: 0, dataUrl: png('#d9ac89') }
  ] }
  const shirt = { id: 'synthetic-shirt', name: 'Synthetic shirt', category: 'camisa' as const, attachedPartId: 'torso', x: 215, y: 445, width: 210, height: 220, rotation: 0, dataUrl: png('#3377bb') }
  const wardrobe = { schemaVersion: 1 as const, id: 'synthetic-wardrobe', modelSlot: 1, modelName: 'Synthetic', name: 'Synthetic wardrobe', width: 640, height: 960, updatedAt: source.updatedAt, components: [{ ...shirt, binding: bindWardrobeComponent(shirt, hiSource.parts[1]) }] }
  const hiMouth: FaceCatalogItem = { ...mouth, sheet: { ...mouth.sheet, width: 80, height: 60, dataUrl: png('#00ff00') }, pieces: [{ ...mouth.pieces[0], crop: { x: 0, y: 0, width: 80, height: 60 }, width: 80, height: 60, dataUrl: png('#00ff00') }], transforms: { mouth: { x: 160, y: 200, scaleX: .8, scaleY: .8, rotation: 0 } } }
  const hiOpenMouth: FaceCatalogItem = { ...hiMouth, id: 'mouth-open-hi', category: 'mouth-open', sheet: { ...hiMouth.sheet, kind: 'mouth-open' }, pieces: hiMouth.pieces.map(piece => ({ ...piece, sheet: 'mouth-open' })) }
  const eye: FaceComponentAsset = { schemaVersion: 1, id: 'synthetic-eye', modelSlot: 1, kind: 'eye', name: 'Synthetic left', pairId: 'synthetic-eye-pair', width: 60, height: 20, defaultTransform: { x: 110, y: 130, scaleX: 1, scaleY: 1, rotation: 0 }, updatedAt: source.updatedAt, dataUrl: png('#ffffff') }
  const closedEye: FaceComponentAsset = { ...eye, id: 'synthetic-eye-closed', kind: 'eye-closed', height: 4, dataUrl: png('#111111') }
  const pupil: FaceComponentAsset = { ...eye, id: 'synthetic-pupil', kind: 'pupil', width: 10, height: 14, defaultTransform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 }, dataUrl: png('#aa2244') }
  const extra: FaceComponentAsset = { ...eye, id: 'synthetic-head-extra', kind: 'head-extra', width: 40, height: 10, defaultTransform: { x: 160, y: 80, scaleX: 1, scaleY: 1, rotation: 0 }, dataUrl: png('#8855aa') }
  const hair: HairStyle = { schemaVersion: 1, id: 'synthetic-hair', modelSlot: 1, name: 'Synthetic hair', front: { dataUrl: png('#aa55aa'), width: 90, height: 30 }, back: null,
    transforms: { front: { x: 160, y: 45, scaleX: 1, scaleY: 1, rotation: 0 }, back: { x: 160, y: 45, scaleX: 1, scaleY: 1, rotation: 0 } }, createdAt: source.updatedAt, updatedAt: source.updatedAt }
  const components = new Map([eye, closedEye, pupil, extra].map(asset => [asset.id, asset]))
  const hiProvider = { ...facialProvider, loadHairStyle: async () => hair, listFaceComponentAssets: async (_slot: number, kind: string) => kind === 'eye-closed' ? [closedEye] : [], loadFaceComponentAsset: async (_slot: number, id: string) => components.get(id) ?? null, loadWardrobeSet: async () => wardrobe, loadFabricatorSlot: async () => hiSource, loadFabricatorPose: async () => hiSource, loadFaceCatalogItem: async (_modelSlot: number, id: string) => id === hiOpenMouth.id ? hiOpenMouth : hiMouth } as CharacterRenderAssetProvider
  const hiAppearance = { ...appearance, mouthClosedCatalogId: hiMouth.id, mouthOpenCatalogId: hiOpenMouth.id, headExtras: { glasses: extra.id }, components: { 'eye-left': { assetId: eye.id }, 'pupil-left': { assetId: pupil.id } } }
  const overlapHair: HairStyle = { ...hair, id: 'synthetic-posterior-hair', transforms: { ...hair.transforms, front: { x: 110, y: 130, scaleX: 1, scaleY: 1, rotation: 0 } } }
  const overlapFringe: HairStyle = { ...hair, id: 'synthetic-front-fringe', front: null, fringe: { dataUrl: png('#22cc44'), width: 90, height: 30 }, transforms: { ...hair.transforms, fringe: { x: 170, y: 130, scaleX: 1, scaleY: 1, rotation: 0 } } }
  const overlapProvider = { ...hiProvider, loadHairStyle: async (_slot: number, id: string) => id === overlapFringe.id ? overlapFringe : overlapHair } as CharacterRenderAssetProvider
  const layerAppearance = { modelSlot: 1, eyeState: 0 as const, eyebrows: false, noseIndex: 0, expressionIndex: 0, mouthOpen: false, components: { 'eye-left': { assetId: eye.id }, 'pupil-left': { assetId: pupil.id } } }
  const layerCharacter = { ...character, customization: { ...character.customization, faceAppearance: layerAppearance, hairAppearance: { modelSlot: 1, parts: { rearHair: overlapHair.id, frontHair: overlapFringe.id } } } }
  const underHairRenderer = await prepareSavedCharacterRenderer(layerCharacter, { source: hiSource, artwork: hiSource, assetProvider: overlapProvider })
  const aboveHairRenderer = await prepareSavedCharacterRenderer({ ...layerCharacter, customization: { ...layerCharacter.customization, faceAppearance: { ...layerAppearance, eyesAboveRearHair: true } } }, { source: hiSource, artwork: hiSource, assetProvider: overlapProvider })
  try {
    const underHair = await underHairRenderer.renderToCanvas(layerAppearance)
    const aboveAppearance = { ...layerAppearance, eyesAboveRearHair: true }
    const aboveHair = await aboveHairRenderer.renderToCanvasWithLayers(aboveAppearance)
    const pixelAt = (canvas: HTMLCanvasElement, x: number, y: number) => Array.from(canvas.getContext('2d', { willReadFrequently: true })!.getImageData(x, y, 1, 1).data)
    const coveredPixel = pixelAt(underHair.canvas, 270, 170)
    const raisedPixel = pixelAt(aboveHair.canvas, 270, 170)
    const fringePixel = pixelAt(aboveHair.canvas, 290, 170)
    const raisedLayerPixel = pixelAt(aboveHair.layers.eyesAboveRearHair!, 270, 170)
    assert(coveredPixel[0] > 130 && coveredPixel[1] < 110 && coveredPixel[2] > 130, 'Posterior hair should cover the eyes when the option is disabled')
    assert(raisedPixel[0] > 120 && raisedPixel[1] < 80 && raisedPixel[2] < 100 && raisedPixel[3] > 240, 'The eyes and pupil should render above posterior hair when enabled')
    assert(fringePixel[1] > 150 && fringePixel[0] < 80, 'Fringe should remain in front of the raised eyes')
    assert(raisedLayerPixel[0] > 120 && raisedLayerPixel[1] < 80 && raisedLayerPixel[2] < 100, 'The raised eye layer should be preserved for Editor V6 motion compositing')
  } finally { underHairRenderer.dispose(); aboveHairRenderer.dispose() }
  const hiCharacter = { ...character, customization: { ...character.customization, faceAppearance: hiAppearance,
    hairAppearance: { modelSlot: 1, parts: { frontHair: hair.id } },
    proportions: { ...defaultCharacterProportions, head: 110 }, bodyDimensions: { ...defaultCharacterBodyDimensions, thighsWidth: 125, torsoWidth: 108 },
    wardrobeGroups: [{ modelSlot: 1, setId: wardrobe.id, category: 'camisa' as const, componentId: shirt.id, offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1, rotation: 0 }]
  } }
  const hiActor: EditorV6Element = { ...actor, characterId: hiCharacter.id, faceAppearance: hiAppearance, activeFaceMode: 'talk', poseSlot: 1 }
  const hiPlan = { ...mouthPlan, elementId: hiActor.id, characterId: hiCharacter.id, key: 'native-resolution-mouth-patch', from: hiActor, to: { ...hiActor }, samples: mouthSamples }
  const hiMouthBake = await bakeEditorV6Motion({ id: crypto.randomUUID(), plan: hiPlan, character: hiCharacter, mouthScaleSamples: [1, 1.05, 1.1025], maxAtlasPixels: 8_000_000 }, hiProvider)
  const hiPatchAtlas = await image(hiMouthBake.asset.dataUrl)
  const hiPatchSprite = hiMouthBake.motion.frames[2].facePatch!.sprite
  const hiPatchCanvas = document.createElement('canvas'); hiPatchCanvas.width = hiPatchSprite.width; hiPatchCanvas.height = hiPatchSprite.height
  const hiPatchContext = hiPatchCanvas.getContext('2d')!
  hiPatchContext.drawImage(hiPatchAtlas, hiPatchSprite.x, hiPatchSprite.y, hiPatchSprite.width, hiPatchSprite.height, 0, 0, hiPatchSprite.width, hiPatchSprite.height)
  const hiPatchPixels = hiPatchContext.getImageData(0, 0, hiPatchSprite.width, hiPatchSprite.height).data
  assert(hiMouthBake.motion.frames[2].facePatch?.replace !== true && hiMouthBake.mouthlessBaseAssets?.length === 2
    && hiPatchPixels.length === hiPatchSprite.width * hiPatchSprite.height * 4, 'A high-resolution mouth patch is not a transparent mouth-only overlay')
  const hiBodyRenderer = await prepareSavedCharacterRenderer(hiCharacter, { source: hiSource, artwork: hiSource, assetProvider: hiProvider })
  const hiBody = await hiBodyRenderer.renderToCanvas(hiAppearance, {}, undefined, 'idle')
  const hiBodyCrop = trimTransparentCanvas(hiBody.canvas)
  const hiBodyDataUrl = hiBodyCrop?.dataUrl ?? hiBody.canvas.toDataURL('image/png')
  const baseModes = await bakeFaceModeAssets('Synthetic body and clothes', hiBodyRenderer, hiAppearance, {}, undefined, 'idle')
  assert(Boolean(baseModes.assetIds.blink && baseModes.assetIds['talk-blink']), 'Combined fixture has no blink variants')
  const neutralTransform = { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 }
  const ptPreset: FaceExpressionPreset = { schemaVersion: 1, id: 'synthetic-expression', modelSlot: 1, name: 'Synthetic PT', updatedAt: source.updatedAt, noseOpacity: 1,
    selections: { eyes: { left: eye.id, right: null }, pupils: { left: pupil.id, right: null }, eyebrows: { left: null, right: null }, nose: { catalogId: null, index: 0 }, mouth: { catalogId: hiMouth.id, kind: 'mouth-closed', index: 0 } },
    transforms: { eyeLeft: eye.defaultTransform, eyeRight: neutralTransform, pupilLeft: pupil.defaultTransform, pupilRight: neutralTransform, browLeft: neutralTransform, browRight: neutralTransform, nose: neutralTransform, mouth: { ...hiMouth.transforms.mouth!, x: 168 } },
    ptPupilMotion: { version: 1, layers: { left: { dx: -.1, dy: 0, rotation: 0 } } }
  }
  const targetTransforms = await buildEditorV6ExpressionTransforms(ptPreset, hiAppearance, {}, async id => components.get(id) ?? null, async () => hiMouth, 'left')
  assert(targetTransforms['expression-component:pupil-left']?.sourceTransformOverride?.x !== pupil.defaultTransform.x, 'PT did not change pupil position')
  const targetModes = await bakeFaceModeAssets('Synthetic expression target', hiBodyRenderer, hiAppearance, targetTransforms, undefined, 'idle')
  const targetMouthState = { ...hiActor, faceTransforms: targetTransforms }
  const targetMouth = await bakeEditorV6Motion({ id: crypto.randomUUID(), plan: { ...hiPlan, key: 'target-mouth', from: targetMouthState, to: { ...targetMouthState } }, character: hiCharacter, mouthScaleSamples: [1, 1.05, 1.1025] }, hiProvider)
  const expressionFrom = { ...hiActor, x: -32, width: 20, height: 20 * 1920 / 1080 * (hiBodyCrop?.height ?? hiBody.height) / (hiBodyCrop?.width ?? hiBody.width), activeFaceMode: 'idle' as const,
    characterCanvasWidth: 20 * hiBody.width / (hiBodyCrop?.width ?? hiBody.width) }
  const expressionTo = { ...expressionFrom, activeExpressionPresetId: 'synthetic-expression', faceTransforms: targetTransforms }
  const expressionBlockFrom = { id: crypto.randomUUID(), elementId: expressionFrom.id, label: 'Normal', startFrame: 0, durationFrames: 23, state: expressionFrom }
  const expressionBlockTo = { ...expressionBlockFrom, id: crypto.randomUUID(), label: 'Expression', startFrame: 23, durationFrames: 17, state: expressionTo }
  const combinedPlan = editorV6MotionPlan({ ...track, blocks: [expressionBlockFrom, expressionBlockTo] }, expressionBlockFrom, expressionBlockTo)!
  const combinedTransition = await bakeEditorV6Motion({ id: crypto.randomUUID(), character: hiCharacter,
    plan: { ...combinedPlan, samples: combinedPlan.samples.map(sample => ({ ...sample, faceMode: 'talk' as const })) },
    mouthScaleSamples: combinedPlan.samples.map(sample => editorV6MouthLoopScaleAtFrame(23 + sample.offset, 0, 30)) }, hiProvider)
  // Exercise the actual export preparer with hair extending beyond the body and
  // an intentionally nonstandard displayed height, not a hand-built bundle.
  const longHair = { ...hair, front: { ...hair.front!, width: 180, height: 180 }, transforms: { ...hair.transforms, front: { ...hair.transforms.front!, y: -30 } } }
  const longHairProvider = { ...hiProvider, loadHairStyle: async () => longHair }
  const longHairCharacter = { ...hiCharacter, customization: { ...hiCharacter.customization, hairAppearance: { modelSlot: 1, parts: { rearHair: hair.id } }, proportions: { ...defaultCharacterProportions }, bodyDimensions: { ...defaultCharacterBodyDimensions } } }
  const expectedRenderer = await prepareSavedCharacterRenderer(longHairCharacter, { source: hiSource, artwork: hiSource, assetProvider: longHairProvider })
  let expectedBaseCrop: { left: number; top: number; width: number; height: number }
  let expectedTargetCrop: typeof expectedBaseCrop
  try {
    const base = await bakeFaceModeAssets('Synthetic hair base', expectedRenderer, hiAppearance, {}, undefined, 'idle')
    const target = await bakeFaceModeAssets('Synthetic hair expression', expectedRenderer, hiAppearance, targetTransforms, undefined, 'idle')
    expectedBaseCrop = base.crop ?? { left: 0, top: 0, width: expectedRenderer.width, height: expectedRenderer.height }
    expectedTargetCrop = target.crop ?? { left: 0, top: 0, width: expectedRenderer.width, height: expectedRenderer.height }
  } finally { expectedRenderer.dispose() }
  const hairlessRenderer = await prepareSavedCharacterRenderer({ ...longHairCharacter, customization: { ...longHairCharacter.customization, hairAppearance: undefined } }, { source: hiSource, artwork: hiSource, assetProvider: longHairProvider })
  try {
    const withoutHair = await bakeFaceModeAssets('Synthetic hairless', hairlessRenderer, hiAppearance, {}, undefined, 'idle')
    assert(withoutHair.crop && expectedBaseCrop.top < withoutHair.crop.top, 'The fixture must have different bounds with and without hair')
  } finally { hairlessRenderer.dispose() }
  const exportEyesAppearance = { ...hiAppearance, eyesAboveRearHair: true }
  const exportBase: EditorV6Element = { ...expressionFrom, assetId: 'synthetic-hair-base', width: 18, height: 82, faceAppearance: exportEyesAppearance, faceTransforms: {}, activeFaceMode: 'idle' }
  const exportTarget: EditorV6Element = { ...exportBase, assetId: 'synthetic-hair-expression', activeExpressionPresetId: 'synthetic-expression', faceTransforms: targetTransforms }
  const hairTimeline = createEditorV6Timeline([exportBase])
  hairTimeline.durationFrames = 40
  const hairTrack = hairTimeline.tracks.find(item => item.kind === 'character')!
  hairTrack.blocks = [
    { id: crypto.randomUUID(), elementId: exportBase.id, label: 'Base', startFrame: 0, durationFrames: 23, state: exportBase },
    { id: crypto.randomUUID(), elementId: exportBase.id, label: 'Expression', startFrame: 23, durationFrames: 17, state: exportTarget }
  ]
  const hairProject = { id: crypto.randomUUID(), elements: [exportBase], timeline: hairTimeline } as EditorV6Document
  const hairPlan = editorV6MotionPlans(hairProject)[0]
  assert(hairPlan?.samples.length === 7, 'The hair export fixture must contain an expression transition')
  const previousDesktop = Object.getOwnPropertyDescriptor(window, 'desktop')
  Object.defineProperty(window, 'desktop', { configurable: true, value: { customizer: { listCustomizerCharacters: async () => [longHairCharacter] }, fabricator: longHairProvider } })
  try {
    const prepared = await prepareEditorV6HairMotionBundle(hairProject, 1, FIRST_HAIR_MOTION_PRESET, { startFrame: 0, endFrame: 40, width: 1280, height: 720, turbo: false, encoder: 'cpu' })
    const baseRig = prepared.rigs.find(rig => rig.assetId === exportBase.assetId)!
    const targetRig = prepared.rigs.find(rig => rig.assetId === exportTarget.assetId)!
    const raisedEyeSurface = prepared.surfaces.find(surface => surface.id === baseRig.eyesAboveRearHairSurfaceId)
    assert(Boolean(raisedEyeSurface), 'The Editor V6 hair rig did not prepare a surface above posterior hair')
    const raisedEyeImage = await image(raisedEyeSurface!.dataUrl)
    const raisedEyeCanvas = document.createElement('canvas'); raisedEyeCanvas.width = raisedEyeImage.naturalWidth; raisedEyeCanvas.height = raisedEyeImage.naturalHeight
    const raisedEyeContext = raisedEyeCanvas.getContext('2d')!; raisedEyeContext.drawImage(raisedEyeImage, 0, 0)
    const exportRaisedPixel = Array.from(raisedEyeContext.getImageData(270, 170, 1, 1).data)
    assert(exportRaisedPixel[0] > 120 && exportRaisedPixel[1] < 80 && exportRaisedPixel[2] < 100, 'The Editor V6 hair export surface lost the raised eye and pupil overlay')
    raisedEyeCanvas.width = raisedEyeCanvas.height = 1
    assert(JSON.stringify(baseRig.sourceCrop) === JSON.stringify({ left: expectedBaseCrop.left, top: expectedBaseCrop.top, width: expectedBaseCrop.width, height: expectedBaseCrop.height }), 'The prepared hair rig did not use the saved face-mode union')
    assert(JSON.stringify(targetRig.sourceCrop) === JSON.stringify({ left: expectedTargetCrop.left, top: expectedTargetCrop.top, width: expectedTargetCrop.width, height: expectedTargetCrop.height }), 'The expression rig did not use the saved face-mode union')
    assert(!prepared.motionTransitions?.length, 'An expression-only change unnecessarily baked a hairless body transition')
  } finally {
    if (previousDesktop) Object.defineProperty(window, 'desktop', previousDesktop)
    else delete (window as unknown as { desktop?: unknown }).desktop
  }
  hiBody.canvas.width = hiBody.canvas.height = 1
  hiBodyRenderer.dispose()
  const concurrentSourceRefresh = await checkConcurrentSourceRefresh(hiCharacter, hiProvider, hiBodyDataUrl)
  const hiPatch = hiMouthBake.motion.frames[2].facePatch
  assert(Boolean(hiPatch) && hiPatch!.sprite.width < 640 / 4 && hiPatch!.sprite.height < 960 / 4, `A boca não ficou localizada: ${hiPatch?.sprite.width}×${hiPatch?.sprite.height} em personagem 640×960.`)
  assert(hiMouthBake.motion.frames.every(frame => frame.facePatch?.sprite.width === hiPatch!.sprite.width && frame.facePatch?.sprite.height === hiPatch!.sprite.height), 'As amostras de boca perderam a mesma geometria local.')
  assert(hiMouthBake.metrics.atlasPixels < 640 * 960, `O atlas facial reteve resolução de corpo inteiro (${hiMouthBake.metrics.atlasPixels} pixels).`)

  // Reproduce a face layer that removes old pixels. A source-over overlay cannot
  // erase that content, so the composed scene must match a full renderer frame.
  const compositeBase = document.createElement('canvas'); compositeBase.width = compositeBase.height = 96
  const compositeBaseContext = compositeBase.getContext('2d')!
  compositeBaseContext.fillStyle = '#f4d1ad'; compositeBaseContext.beginPath(); compositeBaseContext.ellipse(48, 48, 35, 40, 0, 0, Math.PI * 2); compositeBaseContext.fill()
  compositeBaseContext.fillStyle = '#291b23'; compositeBaseContext.fillRect(38, 36, 14, 3)
  compositeBaseContext.fillStyle = '#40212a'; compositeBaseContext.beginPath(); compositeBaseContext.ellipse(47, 62, 9, 3, 0, 0, Math.PI * 2); compositeBaseContext.fill()
  const compositeNext = document.createElement('canvas'); compositeNext.width = compositeNext.height = 96
  compositeNext.getContext('2d')!.drawImage(compositeBase, 0, 0)
  const compositeNextContext = compositeNext.getContext('2d')!
  compositeNextContext.fillStyle = '#f4d1ad'; compositeNextContext.fillRect(36, 34, 18, 7) // expression no longer has this brow
  compositeNextContext.clearRect(42, 35, 1, 1) // RGBA replacement must preserve a pixel that became transparent
  compositeNextContext.fillStyle = '#f4d1ad'; compositeNextContext.fillRect(37, 57, 28, 12) // remove the old mouth completely
  compositeNextContext.fillStyle = '#291b23'; compositeNextContext.beginPath(); compositeNextContext.ellipse(51, 63, 12, 7, 0, 0, Math.PI * 2); compositeNextContext.fill()
  compositeNextContext.fillStyle = '#cf5966'; compositeNextContext.beginPath(); compositeNextContext.ellipse(51, 65, 7, 3, 0, 0, Math.PI * 2); compositeNextContext.fill()
  const replacement = document.createElement('canvas'); replacement.width = 46; replacement.height = 52
  replacement.getContext('2d')!.drawImage(compositeNext, 29, 26, 46, 52, 0, 0, 46, 52)
  const baseCompositeAsset = { id: 'base-face-fixture', category: 'character' as const, name: 'synthetic base', mimeType: 'image/png' as const, dataUrl: compositeBase.toDataURL('image/png') }
  const fullCompositeAsset = { id: 'full-face-fixture', category: 'character' as const, name: 'synthetic full frame', mimeType: 'image/png' as const, dataUrl: compositeNext.toDataURL('image/png') }
  const replacementAsset = { id: 'replacement-face-fixture', category: 'character' as const, name: 'synthetic replacement', mimeType: 'image/png' as const, dataUrl: replacement.toDataURL('image/png') }
  const checkerCanvas = document.createElement('canvas'); checkerCanvas.width = checkerCanvas.height = 16
  const checkerContext = checkerCanvas.getContext('2d')!
  checkerContext.fillStyle = '#ffffff'; checkerContext.fillRect(0, 0, 16, 16); checkerContext.fillStyle = '#bbbbbb'; checkerContext.fillRect(0, 0, 8, 8); checkerContext.fillRect(8, 8, 8, 8)
  const checkerAsset = { id: 'checker-face-fixture', category: 'background' as const, name: 'checker', mimeType: 'image/png' as const, dataUrl: checkerCanvas.toDataURL('image/png') }
  const compositeActor: EditorV6Element = { id: 'composite-face-actor', kind: 'character', assetId: baseCompositeAsset.id, text: 'RGBA', x: 0, y: 0, width: 34, height: 50, rotation: 27, flipX: true, zIndex: 1,
    mouthPatch: { assetId: replacementAsset.id, sprite: { x: 2, y: 2, width: 42, height: 48, atlasWidth: 46, atlasHeight: 52 }, x: 31 / 96, y: 28 / 96, width: 42 / 96, height: 48 / 96,
      replace: true, replaceBounds: { x: 5 / 42, y: 5 / 48, width: 30 / 42, height: 40 / 48 } } }
  const compositeScene = (backgroundColor: string, backgroundAssetId: string | null, elements: EditorV6Element[]) => ({
    frame: 0, elements, background: { backgroundColor, backgroundAssetId, backgroundX: 0, backgroundY: 0, backgroundWidth: 100, backgroundHeight: 100, backgroundRotation: 0 }
  })
  const compositionComparisons: Array<{ background: string; changedPixels: number; maxDifference: number }> = []
  for (const [label, backgroundColor, backgroundAssetId, layer] of [
    ['transparent', '#000000', null, 'foreground'], ['black', '#000000', null, 'all'], ['white', '#ffffff', null, 'all'], ['colored', '#287f48', null, 'all'], ['checkerboard', '#ffffff', checkerAsset.id, 'all']
  ] as const) {
    const expected = await captureScene(compositeScene(backgroundColor, backgroundAssetId, [{ ...compositeActor, assetId: fullCompositeAsset.id, mouthPatch: undefined }]), [fullCompositeAsset, checkerAsset], layer)
    const composed = await composeEditorV6FaceReplacements(compositeScene(backgroundColor, backgroundAssetId, [compositeActor]), [baseCompositeAsset, replacementAsset, checkerAsset])
    const actual = await captureScene(composed.scene, composed.assets, layer)
    let changedPixels = 0, maxDifference = 0, maxDifferenceAt = '', minX = 384, minY = 216, maxX = -1, maxY = -1, firstDifference = ''
    for (let offset = 0; offset < expected.length; offset += 4) if (expected[offset] !== actual[offset] || expected[offset + 1] !== actual[offset + 1] || expected[offset + 2] !== actual[offset + 2] || expected[offset + 3] !== actual[offset + 3]) {
      changedPixels++; const pixel = offset / 4, x = pixel % 384, y = Math.floor(pixel / 384)
      const difference = Math.max(...[0, 1, 2, 3].map((channel) => Math.abs(expected[offset + channel] - actual[offset + channel])))
      if (difference > maxDifference) { maxDifference = difference; maxDifferenceAt = `(${x},${y}) esperado ${Array.from(expected.slice(offset, offset + 4))}, obtido ${Array.from(actual.slice(offset, offset + 4))}` }
      minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y)
      if (!firstDifference) firstDifference = `(${x},${y}) esperado ${Array.from(expected.slice(offset, offset + 4))}, obtido ${Array.from(actual.slice(offset, offset + 4))}`
    }
    assert(changedPixels === 0, `A composição facial divergiu da renderização completa em ${label}: ${changedPixels} pixels, max ${maxDifference} em ${maxDifferenceAt}, bounds ${minX},${minY}–${maxX},${maxY}; ${firstDifference}.`)
    compositionComparisons.push({ background: label, changedPixels, maxDifference })
  }
  const revisedBase = { ...baseCompositeAsset, dataUrl: fullCompositeAsset.dataUrl }
  const revisedBaseComposition = await composeEditorV6FaceReplacements(compositeScene('#000000', null, [compositeActor]), [revisedBase, replacementAsset])
  const revisedBaseExpected = await captureScene(compositeScene('#000000', null, [{ ...compositeActor, assetId: fullCompositeAsset.id, mouthPatch: undefined }]), [fullCompositeAsset], 'all')
  const revisedBaseActual = await captureScene(revisedBaseComposition.scene, revisedBaseComposition.assets, 'all')
  assert(revisedBaseExpected.every((value, index) => value === revisedBaseActual[index]), 'Uma nova revisão do asset reutilizou uma composição facial antiga.')

  const baseTimeline = createEditorV6Timeline([actor])
  const timelineBackground = { id: crypto.randomUUID(), label: 'Fundo: teste.png', startFrame: 0, durationFrames: 300, background: { backgroundColor: '#ffffff', backgroundAssetId: null, backgroundX: 0, backgroundY: 0, backgroundWidth: 100, backgroundHeight: 100, backgroundRotation: 0 } }
  const videoClip = { id: crypto.randomUUID(), mediaId: 'video-test', label: 'Vídeo de teste', startFrame: 0, durationFrames: 150 }
  const uiProject: EditorV6Document = { schemaVersion: 1,id: crypto.randomUUID(),title: 'UI motion',color: '#ffffff',createdAt: source.updatedAt,updatedAt: source.updatedAt,backgroundColor: '#ffffff',backgroundAssetId: null,backgroundX: 0,backgroundY: 0,backgroundWidth: 100,backgroundHeight: 100,backgroundRotation: 0,elements: [actor],assets: [],timeline: { ...baseTimeline,tracks: baseTimeline.tracks.map(t=>t.kind==='character'?{...t,blocks:[previous,next]}:t.kind==='video'?{...t,blocks:[timelineBackground,videoClip]}:t) } }
  const mount=document.createElement('div');document.body.append(mount);const uiRoot=createRoot(mount)
  function TimelineDemo() {
    const [project,setProject]=useState(uiProject),[selected,onSelect]=useState<string|null>(null)
    return createElement(EditorV6Timeline,{document:project,frame:0,playing:false,selectedId:selected,onSeek:()=>{},onPlay:()=>{},onSelect:b=>onSelect(b.id),onChange:setProject})
  }
  flushSync(()=>uiRoot.render(createElement(TimelineDemo)))
  const lanes=Array.from(mount.querySelectorAll<HTMLElement>('.editor-v6-timeline-track'))
  const videoLane=lanes.find(lane=>lane.querySelector('.editor-v6-timeline-track-heading strong')?.textContent==='Vídeo')
  const backgroundLane=lanes.at(-1)
  assert(backgroundLane?.querySelector('.editor-v6-timeline-track-heading strong')?.textContent==='Fundo','Dedicated background lane is missing or not at the bottom')
  assert(!Array.from(videoLane?.querySelectorAll('.editor-v6-timeline-block')??[]).some(block=>block.textContent?.includes('Fundo: teste.png')),'Background appeared as a block in the video lane')
  assert(Array.from(videoLane?.querySelectorAll('.editor-v6-timeline-block')??[]).some(block=>block.textContent?.includes('Vídeo de teste')),'Regular video clips disappeared from the video lane')
  assert(Array.from(backgroundLane?.querySelectorAll('.editor-v6-timeline-block')??[]).some(block=>block.textContent?.includes('Fundo: teste.png')),'Background state was not shown in its dedicated lane')
  const tick=()=>new Promise(resolve=>requestAnimationFrame(()=>resolve(undefined)))
  const toggle=()=>mount.querySelector<HTMLButtonElement>('button[title="Animar trocas de pose e expressão nesta faixa (250 ms)"]')!
  assert(mount.querySelectorAll('.v6-motion-range').length===1,'Timeline did not mark the anticipatory transition')
  toggle().click();await tick()
  assert(toggle().getAttribute('aria-pressed')==='false' && !mount.querySelector('.v6-motion-range'),'Character motion switch failed')
  toggle().click();await tick()
  const destinationBlock=mount.querySelectorAll<HTMLElement>('.editor-v6-timeline-block.kind-character')[1]
  destinationBlock.click();await tick()
  assert(destinationBlock.classList.contains('selected'),'Destination block selection failed')
  assert(!editorV6MotionPlan(track,previous,{...next,motionEnabled:false}),'Destination block motion opt-out was ignored')
  uiRoot.unmount();mount.remove()
  return {
    passed: true, metrics: result.metrics, concurrentSourceRefresh, timelineControls: true, expressionRigs: facial.metrics.preparedRigs, blueXs, greenXs,
    facialGeometry: { maxBodyLandmarkDriftPixels: maxLandmarkDrift, exactAnchorThresholdPixels: 1 },
    faceComposition: { backgrounds: compositionComparisons, assetRevisionInvalidation: true, characterRotationDegrees: compositeActor.rotation, mirrored: compositeActor.flipX },
    highResolutionMouth: { source: '640x960', atlasPixels: hiMouthBake.metrics.atlasPixels, patchPixels: hiPatch!.sprite.width * hiPatch!.sprite.height, patch: { width: hiPatch!.sprite.width, height: hiPatch!.sprite.height, x: hiPatch!.x, y: hiPatch!.y, widthRatio: hiPatch!.width, heightRatio: hiPatch!.height } },
    mouthExportFixture: {
      sourceDataUrl: hiBodyDataUrl,
      sourceWidth: hiBodyCrop?.width ?? hiBody.width,
      sourceHeight: hiBodyCrop?.height ?? hiBody.height,
      asset: hiMouthBake.asset,
      mouthlessBaseAssets: hiMouthBake.mouthlessBaseAssets,
      metrics: hiMouthBake.metrics,
      combined: { transition: combinedTransition, targetMouth, baseModes, targetModes, targetTransforms, characterHeight: expressionFrom.height, characterCanvasWidth: expressionFrom.characterCanvasWidth,
        customizations: hiCharacter.customization },
      bakeMilliseconds: hiMouthBake.metrics.milliseconds,
      frames: hiMouthBake.motion.frames.map(frame => ({ facePatch: frame.facePatch }))
    },
    reads
  }
}

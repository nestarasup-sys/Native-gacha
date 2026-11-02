import { bakeFaceModeAssets, trimTransparentCanvas } from '../../src/renderer/src/features/editorV6/faceModeAssets'
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
import { editorV6MotionPlan } from '../../src/shared/editorV6Motion'
import { prepareSavedCharacterRenderer } from '../../src/renderer/src/characters/editorV6CharacterRenderer'
import { bakeEditorV6Motion } from '../../src/renderer/src/features/editorV6/motion/bakeMotion'
import { SceneSurface } from '../../src/renderer/src/features/editorV6/SceneSurface'
import { composeEditorV6FaceReplacements } from '../../src/renderer/src/features/editorV6/sceneFaceComposition'
import { faceRenderGeometry } from '../../src/renderer/src/characters/characterGeometry'
import { trimTransparentCanvas } from '../../src/renderer/src/features/editorV6/faceModeAssets'
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
  const result = await bakeEditorV6Motion({ id: crypto.randomUUID(), plan, character },provider)
  HTMLCanvasElement.prototype.getContext = original
  assert(result.metrics.samples === 7 && result.metrics.atlasPixels <= 8_100_000, 'Invalid atlas budget or sample count')
  assert(result.metrics.preparedRigs === 9, 'Pose rigs were incorrectly reused')
  assert(reads.loadFabricatorSlot === 1 && reads.loadFabricatorPose === 2, 'Source reads were repeated per sample')
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
    assert(frame.facePatch.replace === true && patchContext.getImageData(0, 0, sprite.width, sprite.height).data.length === sprite.width * sprite.height * 4, 'Mouth patch is not a complete RGBA replacement region')
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
  assert(hiMouthBake.motion.frames[2].facePatch?.replace === true && hiPatchPixels.length === hiPatchSprite.width * hiPatchSprite.height * 4, 'A high-resolution mouth patch is not a complete RGBA replacement region')
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
      metrics: hiMouthBake.metrics,
      combined: { transition: combinedTransition, targetMouth, baseModes, targetModes, targetTransforms, characterHeight: expressionFrom.height, characterCanvasWidth: expressionFrom.characterCanvasWidth,
        customizations: hiCharacter.customization },
      bakeMilliseconds: hiMouthBake.metrics.milliseconds,
      frames: hiMouthBake.motion.frames.map(frame => ({ facePatch: frame.facePatch }))
    },
    reads
  }
}

import { createElement, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { EditorV6Timeline } from '../../src/renderer/src/features/editorV6/EditorV6Timeline'
import type { CharacterRenderAssetProvider } from '../../src/shared/characterRenderAssets'
import type { CustomizerCharacter } from '../../src/shared/customizer'
import type { FaceCatalogItem, FabricatorProject } from '../../src/shared/fabricator'
import { createEditorV6Timeline, type EditorV6Document, type EditorV6Element } from '../../src/shared/editorV6'
import { editorV6MotionPlan } from '../../src/shared/editorV6Motion'
import { prepareSavedCharacterRenderer } from '../../src/renderer/src/characters/editorV6CharacterRenderer'
import { bakeEditorV6Motion } from '../../src/renderer/src/features/editorV6/motion/bakeMotion'
const assert = (ok: unknown, message: string) => { if (!ok) throw Error(message) }
function png(color: string) { const c = document.createElement('canvas'); c.width = c.height = 10; const x = c.getContext('2d')!; x.fillStyle = color; x.fillRect(0,0,10,10); return c.toDataURL() }
async function image(url: string) { const i = new Image(); i.src = url; await i.decode(); return i }
;(globalThis as unknown as { runMotionCheck: () => Promise<unknown> }).runMotionCheck = async () => {
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
  const firstFace = { ...previous,state: { ...actor,faceAppearance: appearance } }
  const same = { ...next, state: { ...actor,faceAppearance: appearance,activeExpressionPresetId: 'other',faceTransforms: { 'expression:mouth-closed:mouth-test': { x: 0,y: 0,width: 100,height: 100,rotation: 0,sourceTransformOverride: { x: 25,y: 35,scaleX: .5,scaleY: .5,rotation: 0 } } } } }
  const expressionPlan = editorV6MotionPlan(track,firstFace,same)!
  const facial = await bakeEditorV6Motion({ id: crypto.randomUUID(), plan: expressionPlan, character: facialCharacter },facialProvider)
  assert(facial.metrics.preparedRigs === 1, 'Expression-only transition rebuilt the static rig')
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
  const hiSource: FabricatorProject = { ...source, width: 640, height: 960, parts: [{ id: 'head', name: 'Head', x: 0, y: 0, width: 640, height: 960, rotation: 0, dataUrl: hiCanvas.toDataURL() }] }
  const hiMouth: FaceCatalogItem = { ...mouth, sheet: { ...mouth.sheet, width: 80, height: 60, dataUrl: png('#00ff00') }, pieces: [{ ...mouth.pieces[0], crop: { x: 0, y: 0, width: 80, height: 60 }, width: 80, height: 60, dataUrl: png('#00ff00') }], transforms: { mouth: { x: 320, y: 480, scaleX: .8, scaleY: .8, rotation: 0 } } }
  const hiOpenMouth: FaceCatalogItem = { ...hiMouth, id: 'mouth-open-hi', category: 'mouth-open', sheet: { ...hiMouth.sheet, kind: 'mouth-open' }, pieces: hiMouth.pieces.map(piece => ({ ...piece, sheet: 'mouth-open' })) }
  const hiProvider = { ...facialProvider, loadFabricatorSlot: async () => hiSource, loadFabricatorPose: async () => hiSource, loadFaceCatalogItem: async (_modelSlot: number, id: string) => id === hiOpenMouth.id ? hiOpenMouth : hiMouth } as CharacterRenderAssetProvider
  const hiAppearance = { ...appearance, mouthClosedCatalogId: hiMouth.id, mouthOpenCatalogId: hiOpenMouth.id }
  const hiCharacter = { ...character, customization: { ...character.customization, faceAppearance: hiAppearance } }
  const hiActor: EditorV6Element = { ...actor, characterId: hiCharacter.id, faceAppearance: hiAppearance, activeFaceMode: 'talk', poseSlot: 1 }
  const hiPlan = { ...mouthPlan, elementId: hiActor.id, characterId: hiCharacter.id, key: 'native-resolution-mouth-patch', from: hiActor, to: { ...hiActor }, samples: mouthSamples }
  const hiMouthBake = await bakeEditorV6Motion({ id: crypto.randomUUID(), plan: hiPlan, character: hiCharacter, mouthScaleSamples: [1, 1.05, 1.1025], maxAtlasPixels: 8_000_000 }, hiProvider)
  const hiBodyRenderer = await prepareSavedCharacterRenderer(hiCharacter, { source: hiSource, artwork: hiSource, assetProvider: hiProvider })
  const hiBody = await hiBodyRenderer.renderToCanvas(hiAppearance, {}, undefined, 'idle')
  const hiBodyDataUrl = hiBody.canvas.toDataURL('image/png')
  hiBody.canvas.width = hiBody.canvas.height = 1
  hiBodyRenderer.dispose()
  const hiPatch = hiMouthBake.motion.frames[2].facePatch
  assert(Boolean(hiPatch) && hiPatch!.sprite.width < 640 / 4 && hiPatch!.sprite.height < 960 / 4, `A boca não ficou localizada: ${hiPatch?.sprite.width}×${hiPatch?.sprite.height} em personagem 640×960.`)
  assert(hiMouthBake.motion.frames.every(frame => frame.facePatch?.sprite.width === hiPatch!.sprite.width && frame.facePatch?.sprite.height === hiPatch!.sprite.height), 'As amostras de boca perderam a mesma geometria local.')
  assert(hiMouthBake.metrics.atlasPixels < 640 * 960, `O atlas facial reteve resolução de corpo inteiro (${hiMouthBake.metrics.atlasPixels} pixels).`)
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
    passed: true, metrics: result.metrics, timelineControls: true, expressionRigs: facial.metrics.preparedRigs, blueXs, greenXs,
    highResolutionMouth: { source: '640x960', atlasPixels: hiMouthBake.metrics.atlasPixels, patchPixels: hiPatch!.sprite.width * hiPatch!.sprite.height, patch: { width: hiPatch!.sprite.width, height: hiPatch!.sprite.height, x: hiPatch!.x, y: hiPatch!.y, widthRatio: hiPatch!.width, heightRatio: hiPatch!.height } },
    mouthExportFixture: {
      sourceDataUrl: hiBodyDataUrl,
      sourceWidth: hiBody.width,
      sourceHeight: hiBody.height,
      asset: hiMouthBake.asset,
      metrics: hiMouthBake.metrics,
      bakeMilliseconds: hiMouthBake.metrics.milliseconds,
      frames: hiMouthBake.motion.frames.map(frame => ({ facePatch: frame.facePatch }))
    },
    reads
  }
}

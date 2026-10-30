import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { selectOriginalModelSource, selectMountedModelSource } from '../src/shared/fabricatorModelViews.ts'
import { interpolateFrames } from '../src/renderer/src/features/fabricator/models/animationInterpolation.ts'
import { BoundedSeamMixerSurfaceCache } from '../src/renderer/src/features/fabricator/models/seamMixerSurfaceCache.ts'
import { createSeamMixerSession } from '../src/renderer/src/features/fabricator/models/seamMixerSession.ts'
import { buildFabricatorJointMarkers } from '../src/renderer/src/features/fabricator/models/jointMarkerModel.ts'

/** Rasterizador sintético de caixas, não screenshots do Canvas/Electron.
 * Captura geometria e ordem de composição sem introduzir motor de render paralelo.
 */
const WIDTH = 10, HEIGHT = 10
const palette = {
  '.': [0,0,0,0], H: [255,200,0,255], C: [255,220,180,255],
  T: [30,110,210,255]
}
function raster(parts) {
  const pixels = new Uint8Array(WIDTH*HEIGHT*4)
  for(const part of parts) {
    for(let y=part.y;y<part.y+part.height;y++) for(let x=part.x;x<part.x+part.width;x++){
      if(x<0||y<0||x>=WIDTH||y>=HEIGHT)continue
      const offset=(y*WIDTH+x)*4
      pixels.set(palette[part.symbol],offset)
    }
  }
  return pixels
}
function golden(rows) {
  assert.equal(rows.length,HEIGHT)
  const pixels=new Uint8Array(WIDTH*HEIGHT*4)
  rows.forEach((row,y)=>{
    assert.equal(row.length,WIDTH)
    Array.from(row).forEach((c,x)=>pixels.set(palette[c],(y*WIDTH+x)*4))
  })
  return pixels
}
const model={
  schemaVersion:1,slot:1,name:'Test rig',sourceName:'rig.png',
  sourceAssetName:'source-1234abcd.png',sourceDataUrl:'data:image/png;base64,',
  width:WIDTH,height:HEIGHT,tolerance:74,updatedAt:'2026-10-22T09:00:00Z',
  parts:[
    {id:'torso',name:'Tronco',symbol:'T',x:4,y:4,width:3,height:4,rotation:0,dataUrl:'data:image/png;base64,',sourceTransform:{x:5,y:4,width:3,height:4,rotation:0}},
    {id:'head',name:'Cabeça',symbol:'C',x:5,y:1,width:3,height:3,rotation:0,dataUrl:'data:image/png;base64,',sourceTransform:{x:1,y:1,width:3,height:3,rotation:0}},
    {id:'hair',name:'Cabelo',symbol:'H',x:5,y:1,width:3,height:1,rotation:0,dataUrl:'data:image/png;base64,',sourceTransform:{x:1,y:1,width:3,height:1,rotation:0}}
  ],
  joints:[{id:'neck',parentPartId:'torso',childPartId:'head',fixed:true}],
  layerOrder:['torso','head','hair'],hiddenPartIds:[]
}
const sourceGolden=[
 '..........','.HHH......','.CCC......','.CCC......',
 '.....TTT..','.....TTT..','.....TTT..','.....TTT..',
 '..........','..........'
]
const mountedGolden=[
 '..........','.....HHH..','.....CCC..','.....CCC..',
 '....TTT...','....TTT...','....TTT...','....TTT...',
 '..........','..........'
]
test('geometria visual da imagem original permanece igual ao fixture golden',()=>{
 const src=selectOriginalModelSource(model)
 const parts=src.parts.map(p=>({...p,symbol:model.parts.find(x=>x.id===p.id).symbol}))
 const actual=raster(parts)
 assert.deepEqual(actual,golden(sourceGolden))
})
test('modelo montado tem golden independente e Poses DEV não usa folha bruta',()=>{
 const mounted=selectMountedModelSource(model)
 assert.deepEqual(raster(mounted.parts),golden(mountedGolden))
 assert.equal(mounted.joints[0].childPartId,'head')
 assert.notDeepEqual(golden(sourceGolden),golden(mountedGolden))
})
test('animação interpola cabeça e tronco sem alterar o PNG original ou catálogo',()=>{
 const frames=[
  {id:'start',durationMs:100,transforms:{head:{x:5,y:1,rotation:350}},joints:[],thumbnailDataUrl:''},
  {id:'end',durationMs:100,transforms:{head:{x:6,y:1,rotation:10}},joints:[],thumbnailDataUrl:''}
 ]
 const mid=interpolateFrames(frames,50,'smooth','once')
 assert.equal(mid.transforms.head.x,5.5)
 assert.equal(mid.transforms.head.rotation,360)
 assert.equal(model.parts[1].x,5)
 assert.equal(selectOriginalModelSource(model).parts[1].x,1)
})

test('marcadores das juntas preservam âncoras, espaçamento, seleção e fixação', async () => {
 const parts = [
  { id:'torso', name:'Tronco', x:0, y:0, width:20, height:20, rotation:0, dataUrl:'', jointAnchor:{x:10,y:10} },
  { id:'upper', name:'Braço superior', x:40, y:40, width:20, height:20, rotation:0, dataUrl:'' },
  { id:'forearm', name:'Antebraço', x:80, y:80, width:20, height:20, rotation:0, dataUrl:'', jointAnchor:{x:10,y:10} },
  { id:'lower', name:'Canela', x:9, y:9, width:2, height:2, rotation:0, dataUrl:'' },
  { id:'head', name:'Cabeça', x:0, y:0, width:20, height:20, rotation:0, dataUrl:'', jointAnchor:{x:10,y:10} }
 ]
 const joints = [
  { id:'neck', parentPartId:'torso', childPartId:'upper', parentAnchor:{x:50,y:50}, childAnchor:{x:10,y:10}, fixed:true },
  { id:'elbow', parentPartId:'upper', childPartId:'forearm', parentAnchor:{x:50,y:50}, childAnchor:{x:30,y:30}, fixed:false }
 ]

 const markers = buildFabricatorJointMarkers(parts, joints, ['forearm'])

 assert.deepEqual(markers.map(({ part, anchor, offset, fixed, selected }) => ({ id:part.id, anchor, offset, fixed, selected })), [
  { id:'upper', anchor:{x:10,y:10}, offset:-20, fixed:true, selected:false },
  { id:'lower', anchor:{x:10,y:10}, offset:20, fixed:false, selected:false },
  { id:'head', anchor:{x:10,y:10}, offset:40, fixed:false, selected:false },
  { id:'forearm', anchor:{x:10,y:10}, offset:0, fixed:false, selected:true }
 ])

 const page = await readFile('src/renderer/src/features/fabricator/FabricatorPage.tsx', 'utf8')
 assert.match(page, /buildFabricatorJointMarkers\(project\.parts, project\.joints, selectedIds\)/)
 assert.doesNotMatch(page, /group\.findIndex\(/)
})

test('cache do Misturador aplica LRU, limite de bytes e contabilidade correta',()=>{
 const cache=new BoundedSeamMixerSurfaceCache(2,24)
 const surface=(width,height)=>({canvas:{width,height},context:{}})

 cache.set('a',surface(3,1))
 cache.set('b',surface(3,1))
 assert.equal(cache.estimatedRetainedBytes,24)
 assert.equal(cache.get('a')?.canvas.width,3,'leitura promove a entrada mais recente')
 cache.set('c',surface(3,1))
 assert.equal(cache.has('a'),true)
 assert.equal(cache.has('b'),false,'a entrada menos usada sai primeiro')
 assert.equal(cache.has('c'),true)
 assert.equal(cache.estimatedRetainedBytes,24)

 cache.set('a',surface(1,1))
 assert.equal(cache.estimatedRetainedBytes,16,'substituição remove a contagem anterior')
 cache.set('too-large',surface(4,4))
 assert.equal(cache.has('too-large'),false,'uma superfície maior que o orçamento não é retida')
 assert.equal(cache.estimatedRetainedBytes,16)

 cache.delete('c')
 assert.equal(cache.estimatedRetainedBytes,4)
 cache.clear()
 assert.equal(cache.estimatedRetainedBytes,0)
 assert.equal(cache.size,0)
})

test('a página do Fabricador compõe canvas e painel sem absorver a renderização', async () => {
 const [page,canvas,panel]=await Promise.all([
  readFile('src/renderer/src/features/fabricator/FabricatorPage.tsx','utf8'),
  readFile('src/renderer/src/features/fabricator/FabricatorModelCanvas.tsx','utf8'),
  readFile('src/renderer/src/features/fabricator/FabricatorModelPanel.tsx','utf8')
 ])

 assert.match(page,/<FabricatorModelCanvas\b/)
 assert.match(page,/<FabricatorModelPanel\b/)
 assert.doesNotMatch(page,/<TemporaryThighWarpPreview\b|className="model-joint-layer"/)
 assert.match(canvas,/canvasParts\.filter\(\(part\) => !hiddenIds\.has\(part\.id\)\)/)
 assert.match(canvas,/beginAnchorDrag\(event, part\.id, offset\)/)
 assert.match(canvas,/onWarpStateChange=\{onWarpStateChange\}/)
 assert.match(panel,/actions\.layers\.toggleFix\(part\.id\)/)
 assert.match(panel,/actions\.joints\.autoConnect/)
 assert.match(panel,/isTorsoPart\(selectedPart\)/)
 assert.doesNotMatch(panel,/window\.desktop|saveFabricatorProject/)
})

test('Misturador usa o canvas local mesmo se o limite retirar a superfície do cache',async()=>{
 const source=await readFile('src/renderer/src/features/fabricator/models/seamMixer.ts','utf8')
 const page=await readFile('src/renderer/src/features/fabricator/FabricatorPage.tsx','utf8')
 const hook=await readFile('src/renderer/src/features/fabricator/useFabricatorSeamMixer.ts','utf8')
 assert.match(source,/const surfacesForSegment = new Map<string, SeamMixerSurface>/)
 assert.match(source,/let surface = surfacesForSegment\.get\(part\.id\) \?\? surfaces\.get\(part\.id\)/)
 assert.match(source,/surfacesForSegment\.get\(partId\)/)
 assert.match(page,/useFabricatorSeamMixer/)
 assert.doesNotMatch(page,/BoundedSeamMixerSurfaceCache|paintMixerSegment/)
 assert.match(hook,/new BoundedSeamMixerSurfaceCache\(\)/)
 assert.match(hook,/const currentProject = projectRef\.current/)
 assert.match(hook,/orderedParts\(currentProject\.parts, currentProject\.layerOrder\)\.reverse\(\)/)
})

test('Misturador serializa segmentos e mantém pixels tocados durante o mesmo traço',async()=>{
 const calls=[]
 let releaseFirst
 let markFirstStarted
 const firstStarted=new Promise(resolve=>{markFirstStarted=resolve})
 const firstGate=new Promise(resolve=>{releaseFirst=resolve})
 const state={
  stroke:{current:{pointerId:1,x:0,y:0}},
  touchedPixels:{current:new Map()},
  queue:{current:Promise.resolve()},
  generation:{current:0}
 }
 const session=createSeamMixerSession(state,async(fromX,_fromY,_toX,_toY,touchedPixels,generation)=>{
  calls.push({fromX,touchedPixels,generation})
  if(fromX===1){markFirstStarted();await firstGate}
 },()=>{})

 session.queueSegment(1,0,2,0)
 session.queueSegment(2,0,3,0)
 await firstStarted
 assert.deepEqual(calls.map(call=>call.fromX),[1])
 releaseFirst()
 await state.queue.current
 assert.deepEqual(calls.map(call=>call.fromX),[1,2])
 assert.equal(calls[0].touchedPixels,calls[1].touchedPixels)
 assert.deepEqual(calls.map(call=>call.generation),[0,0])
})

test('Misturador invalida trabalho pendente ao trocar de modelo sem mostrar erro atrasado',async()=>{
 const calls=[]
 const errors=[]
 let releaseFirst
 let markFirstStarted
 const firstStarted=new Promise(resolve=>{markFirstStarted=resolve})
 const firstGate=new Promise(resolve=>{releaseFirst=resolve})
 const state={
  stroke:{current:{pointerId:9,x:3,y:4}},
  touchedPixels:{current:new Map([['arm',new Uint8Array([1])]])},
  queue:{current:Promise.resolve()},
  generation:{current:0}
 }
 const oldTouchedPixels=state.touchedPixels.current
 const session=createSeamMixerSession(state,async(fromX)=>{
  calls.push(fromX)
  if(fromX===1){markFirstStarted();await firstGate;throw Error('falha antiga')}
 },message=>errors.push(message))

 session.queueSegment(1,0,2,0)
 session.queueSegment(2,0,3,0)
 await firstStarted
 session.reset()
 releaseFirst()
 await state.queue.current
 assert.deepEqual(calls,[1])
 assert.deepEqual(errors,[])
 assert.equal(state.generation.current,1)
 assert.equal(state.stroke.current,null)
 assert.notEqual(state.touchedPixels.current,oldTouchedPixels)
 assert.equal(state.touchedPixels.current.size,0)
})

test('falha do Misturador não bloqueia o próximo segmento do traço',async()=>{
 const calls=[]
 const errors=[]
 const state={
  stroke:{current:null},touchedPixels:{current:new Map()},
  queue:{current:Promise.resolve()},generation:{current:0}
 }
 const session=createSeamMixerSession(state,async(fromX)=>{
  calls.push(fromX)
  if(fromX===1)throw Error('canvas indisponível')
 },message=>errors.push(message))

 session.queueSegment(1,0,1,0)
 session.queueSegment(2,0,2,0)
 await state.queue.current
 assert.deepEqual(calls,[1,2])
 assert.deepEqual(errors,['Misturador: canvas indisponível'])
})

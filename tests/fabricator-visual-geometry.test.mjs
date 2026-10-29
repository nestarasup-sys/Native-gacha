import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { selectOriginalModelSource, selectMountedModelSource } from '../src/shared/fabricatorModelViews.ts'
import { interpolateFrames } from '../src/renderer/src/features/fabricator/models/animationInterpolation.ts'
import { BoundedSeamMixerSurfaceCache } from '../src/renderer/src/features/fabricator/models/seamMixerSurfaceCache.ts'

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

test('Misturador usa o canvas local mesmo se o limite retirar a superfície do cache',async()=>{
 const source=await readFile('src/renderer/src/features/fabricator/models/seamMixer.ts','utf8')
 const page=await readFile('src/renderer/src/features/fabricator/FabricatorPage.tsx','utf8')
 assert.match(source,/const surfacesForSegment = new Map<string, SeamMixerSurface>/)
 assert.match(source,/let surface = surfacesForSegment\.get\(part\.id\) \?\? surfaces\.get\(part\.id\)/)
 assert.match(source,/surfacesForSegment\.get\(partId\)/)
 assert.match(page,/useRef\(new BoundedSeamMixerSurfaceCache\(\)\)/)
 assert.match(page,/const currentProject = projectRef\.current/)
 assert.match(page,/orderedParts\(currentProject\.parts, currentProject\.layerOrder\)\.reverse\(\)/)
})

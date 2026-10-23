import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { pupilDeltaFromDrag,pupilScreenOffset,pupilSourceMirrored }
  from '../src/shared/facePupilGeometry.ts'
import { FACE_COMPONENT_SELECTION_STORAGE_KEY,savedFaceLibraryParts,pickFaceLibraryBase }
  from '../src/shared/faceLibrarySelection.ts'

test('o arraste aplica a inversa EXATA da geometria da prévia para todo ângulo e lado',()=>{
  for (const rotationDegrees of [-170,-90,-37,0,23,75,179]) {
    for (const mirrorSourceX of [false,true]) {
      for (const [targetX,targetY] of [[7,0],[0,11],[-4,9],[70,-19]]) {
        const screen=pupilScreenOffset(targetX,targetY,rotationDegrees,mirrorSourceX)
        const drag=pupilDeltaFromDrag(screen.x/.72,screen.y/.64,{
          rotationDegrees,mirrorSourceX,modelPerPixelX:.72,modelPerPixelY:.64})
        assert.ok(Math.abs(drag.x-targetX)<1e-9,`x rot=${rotationDegrees} mirrored=${mirrorSourceX}`)
        assert.ok(Math.abs(drag.y-targetY)<1e-9)
      }
    }
  }
})

test('arrastar a direita 60 passos nunca inverte sozinho, nem perto da base ou cruzando x=0',()=>{
  for (const mirrorSourceX of [false,true]) {
    let lastScreen=-Infinity
    const start=-22
    for (let step=0;step<=60;step++) {
      const delta=pupilDeltaFromDrag(step*7,0,{
        rotationDegrees:0,mirrorSourceX,modelPerPixelX:1,modelPerPixelY:1
      })
      const projected=pupilScreenOffset(start+delta.x,delta.y,0,mirrorSourceX)
      assert.ok(projected.x>=lastScreen,`posição voltou para esquerda no passo ${step}`)
      lastScreen=projected.x
    }
  }
})

test('posição da pupila não tem limite artificial por fração da cabeça',()=>{
  const far=pupilDeltaFromDrag(1200,-800,{
    rotationDegrees:0,mirrorSourceX:false,modelPerPixelX:.5,modelPerPixelY:.75})
  assert.deepEqual(far,{x:600,y:-600})
})

test('seleções do Olhos DEV para um NOVO conjunto preservam IDs e pares, sem escolher peças erradas',()=>{
  const data=JSON.stringify({'1':{parts:{
    'eye-left':'eyeB-L','eye-right':'eyeB-R',
    'pupil-left':'pupilB-L','pupil-right':'pupilB-R',
    'brow-left':'browB-L','brow-right':'browB-R'
  },linked:{eye:false,pupil:true,eyebrow:false}}})
  const asset=(id,kind,right,pairId)=>({id,name:`Grupo B · ${kind} ${right?'direita':'esquerda'}`,kind,
    pairId,rightSidePositioned:right,defaultTransform:{x:id.includes('pupil')?4:120,y:id.includes('pupil')?-5:40,scaleX:1.7,scaleY:.84,rotation:-27}})
  const assets=['eye','pupil','eyebrow'].flatMap(kind=>[
    asset(`${kind}A-L`,kind,false,'A'),asset(`${kind}A-R`,kind,true,'A'),
    asset(kind==='eye'?'eyeB-L':kind==='pupil'?'pupilB-L':'browB-L',kind,false,'B'),
    asset(kind==='eye'?'eyeB-R':kind==='pupil'?'pupilB-R':'browB-R',kind,true,'B')
  ])
  const selections=savedFaceLibraryParts(data,1)
  assert.equal(FACE_COMPONENT_SELECTION_STORAGE_KEY,'gacha-nymi:face-dev-component-selections')
  for(const [kind,label] of [['eye','eyeB'],['pupil','pupilB'],['eyebrow','browB']]){
    const left=pickFaceLibraryBase(kind,'left',selections,assets)
    const right=pickFaceLibraryBase(kind,'right',selections,assets,left)
    assert.equal(left.id,`${label}-L`)
    assert.equal(right.id,`${label}-R`)
    assert.deepEqual(right.defaultTransform,assets.find(x=>x.id===right.id).defaultTransform)
  }
  const missingRight={...selections,'eye-right':'deleted'}
  assert.equal(pickFaceLibraryBase('eye','right',missingRight,assets,
    pickFaceLibraryBase('eye','left',missingRight,assets)).id,'eyeB-R')
})

test('seleções quebradas ou JSON truncado não sobrescrevem conjuntos existentes',()=>{
  for (const raw of ['{corrupted','[]','null','{"1":null}','{"1":{"parts":[]}}',null]) {
    assert.deepEqual(savedFaceLibraryParts(raw,1),{})
  }
  const assets=[{id:'left',kind:'eye',rightSidePositioned:false},{id:'unrelated-right',kind:'eye',rightSidePositioned:true}]
  assert.equal(pickFaceLibraryBase('eye','right',{},assets,assets[0]),undefined)
  assert.equal(pupilSourceMirrored('right',false),true)
  assert.equal(pupilSourceMirrored('right',true),false)
})

test('ambos os editores usam o mesmo inversor, sem clamping ou gesto PT que mude o preset',async()=>{
  const [eyes,presets,core]=await Promise.all([
    readFile('src/renderer/src/features/fabricator/face/FaceComponentsWorkspace.tsx','utf8'),
    readFile('src/renderer/src/features/fabricator/ExpressionPresetWorkspace.tsx','utf8'),
    readFile('src/shared/facePupilGeometry.ts','utf8')])
  assert.match(eyes,/pupilDeltaFromDrag\(/)
  assert.match(presets,/pupilDeltaFromDrag\(/)
  assert.match(eyes,/drag\.pupil \? \{x,y\}/)
  assert.doesNotMatch(eyes,/head\.width \* \.25/)
  assert.doesNotMatch(eyes,/head\.height \* \.25/)
  assert.match(presets,/if \(open \|\| previewGaze==='right'\)return raw/)
  assert.match(presets,/previewGaze==='right' && \(selectedLayer === pupilLayer/)
  assert.match(presets,/FACE_COMPONENT_SELECTION_STORAGE_KEY/)
  assert.match(core,/pupilScreenOffset/)
  assert.match(core,/pupilDeltaFromDrag/)
})

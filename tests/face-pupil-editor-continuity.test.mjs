import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { faceExpressionDefaults } from '../src/shared/faceExpressionDefaults.ts'
import { pupilDeltaFromDrag,pupilScreenOffset,pupilSourceMirrored }
  from '../src/shared/facePupilGeometry.ts'
import { FACE_COMPONENT_SELECTION_STORAGE_KEY,savedFaceLibraryParts,pickFaceLibraryBase,savedLegacyPupilParts }
  from '../src/shared/faceLibrarySelection.ts'
import { deriveFacePairTransformMetrics } from '../src/renderer/src/features/fabricator/face/facePairTransformModel.ts'

const pairAsset=(id,kind,x,y,width,height,scaleX=1,scaleY=1,extra={})=>({
  id,kind,width,height,...extra,
  defaultTransform:{x,y,scaleX,scaleY,rotation:0}
})

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

test('ambos os editores usam o mesmo inversor, incluindo pupila PT sem clamping nem alteração da normal',async()=>{
  const [dragHook,presets,previewInteraction,core]=await Promise.all([
    readFile('src/renderer/src/features/fabricator/face/useFacePreviewDrag.ts','utf8'),
    readFile('src/renderer/src/features/fabricator/ExpressionPresetWorkspace.tsx','utf8'),
    readFile('src/renderer/src/features/fabricator/expressionPreviewInteraction.ts','utf8'),
    readFile('src/shared/facePupilGeometry.ts','utf8')])
  assert.match(dragHook,/pupilDeltaFromDrag\(/)
  assert.match(presets,/createExpressionPreviewInteraction\(/)
  assert.match(previewInteraction,/pupilDeltaFromDrag\(/)
  assert.match(dragHook,/current\.pupil \? \{ x, y \}/)
  assert.doesNotMatch(dragHook,/head\.width \* \.25/)
  assert.doesNotMatch(dragHook,/head\.height \* \.25/)
  assert.match(presets,/if \(open \|\| previewGaze==='right'\)return raw/)
  assert.match(presets,/const canDrag = selectedLayer === pupilLayer/)
  assert.match(presets,/setPtPupils\(/)
  assert.match(presets,/ptPupilMotion:compilePtPupilMotion/)
  assert.match(presets,/FACE_COMPONENT_SELECTION_STORAGE_KEY/)
  assert.match(core,/pupilScreenOffset/)
  assert.match(core,/pupilDeltaFromDrag/)
})

test('conjunto novo reproduz sem arredondar posições, escalas, rotações e flipX salvos em Olhos DEV',()=>{
  const face=(id,kind,defaultTransform)=>({id,kind,defaultTransform})
  const components={
    'eye-l':face('eye-l','eye',{x:31.4,y:22.7,scaleX:.86,scaleY:1.17,rotation:23,flipX:true}),
    'eye-r':face('eye-r','eye',{x:172.2,y:29.9,scaleX:1.8,scaleY:.92,rotation:-19}),
    'pupil-l':face('pupil-l','pupil',{x:-17.25,y:4.5,scaleX:.39,scaleY:.54,rotation:0}),
    'pupil-r':face('pupil-r','pupil',{x:28.3,y:-2.5,scaleX:.78,scaleY:.33,rotation:31,flipX:true}),
    'brow-l':face('brow-l','eyebrow',{x:60,y:12,scaleX:1.2,scaleY:1.3,rotation:-5}),
    'brow-r':face('brow-r','eyebrow',{x:162,y:12,scaleX:.8,scaleY:1.1,rotation:6})
  }
  const catalogs={
    nose:{transforms:{nose:{x:99,y:105,scaleX:.43,scaleY:.99,rotation:-8}}},
    mouth:{transforms:{mouth:{x:110,y:148,scaleX:1.9,scaleY:.48,rotation:13}}}
  }
  const selection={
    eyes:{left:'eye-l',right:'eye-r'},pupils:{left:'pupil-l',right:'pupil-r'},
    eyebrows:{left:'brow-l',right:'brow-r'},nose:{catalogId:'nose',index:0},
    mouth:{catalogId:'mouth',index:4,kind:'mouth-closed'}
  }
  const before=structuredClone({selection,components,catalogs})
  const actual=faceExpressionDefaults(selection,components,catalogs)
  for(const [layer,id] of Object.entries({eyeLeft:'eye-l',eyeRight:'eye-r',pupilLeft:'pupil-l',pupilRight:'pupil-r',
    browLeft:'brow-l',browRight:'brow-r'})){
    assert.deepEqual(actual[layer],components[id].defaultTransform,`novo preset distorceu ${layer}`)
    assert.notStrictEqual(actual[layer],components[id].defaultTransform,'não pode mutar o asset fonte')
  }
  assert.deepEqual(actual.nose,catalogs.nose.transforms.nose)
  assert.deepEqual(actual.mouth,catalogs.mouth.transforms.mouth)
  assert.deepEqual({selection,components,catalogs},before)
})

test('métricas de olhos tratam imagens espelhadas e assets posicionados à direita',()=>{
  const head={width:200,height:100}
  const left=pairAsset('left','eye',40,50,20,10,.5,.5)
  const mirroredRight=pairAsset('right-mirrored','eye',60,48,20,10,1,1)
  const mirrored=deriveFacePairTransformMetrics({head,category:'eye',movementLeftAsset:left,movementRightAsset:mirroredRight})
  assert.deepEqual(mirrored,{pairHeightAsset:left,pairX:90,pairY:49,eyeSeparation:100,eyeSeparationMax:180,pairWidthPercent:5,pairHeightPercent:5})

  const positionedRight=pairAsset('right-positioned','eye',60,48,20,10,1,1,{rightSidePositioned:true})
  const positioned=deriveFacePairTransformMetrics({head,category:'eye',movementLeftAsset:left,movementRightAsset:positionedRight})
  assert.equal(positioned.pairX,50)
  assert.equal(positioned.eyeSeparation,20)
})

test('métricas de pupilas usam proporções do olho e olhos fechados separam as alturas das abertas',()=>{
  const head={width:200,height:100}
  const leftPupil=pairAsset('pupil-left','pupil',7,5,4,4,1.5,.8)
  const rightPupil=pairAsset('pupil-right','pupil',19,7,4,4,1,1)
  const eye=pairAsset('eye-left','eye',50,40,30,20,1.2,1.4)
  const pupil=deriveFacePairTransformMetrics({head,category:'pupil',movementLeftAsset:leftPupil,movementRightAsset:rightPupil,leftEyeForPupil:eye})
  assert.equal(pupil.pairX,13)
  assert.equal(pupil.pairY,6)
  assert.equal(pupil.eyeSeparation,0)
  assert.equal(pupil.pairWidthPercent,27)
  assert.ok(Math.abs(pupil.pairHeightPercent-22.4)<1e-12)

  const openEye=pairAsset('eye-left','eye',50,40,30,20,.5,.7)
  const closedEye=pairAsset('closed-left','eye-closed',44,42,15,8,.9,.25)
  const closed=deriveFacePairTransformMetrics({head,category:'eye-closed',movementLeftAsset:openEye,leftPairAsset:closedEye})
  assert.equal(closed.pairHeightAsset,closedEye)
  assert.equal(closed.pairWidthPercent,7.5)
  assert.equal(closed.pairHeightPercent,2)
})

test('workspace delega a geometria dos pares ao modelo puro',async()=>{
  const workspace=await readFile('src/renderer/src/features/fabricator/face/FaceComponentsWorkspace.tsx','utf8')
  assert.match(workspace,/deriveFacePairTransformMetrics\(/)
  assert.doesNotMatch(workspace,/const rightPairX =/)
  assert.doesNotMatch(workspace,/const pairWidthSource =/)
})

test('não gerar expressões legadas implícitas nem sobrescrever presets parcialmente salvos',async()=>{
  const editor=await readFile('src/renderer/src/features/fabricator/ExpressionPresetWorkspace.tsx','utf8')
  assert.doesNotMatch(editor,/importLegacyStandardExpressions\(/)
  assert.doesNotMatch(editor,/saveFaceExpressionPreset\(modelSlot, preset\)\)\)/)
  assert.match(editor,/const loadedPresets = savedPresets/)
  assert.match(editor,/faceExpressionDefaults as defaultTransforms/)
  assert.match(editor,/if\(previewGaze==='left'\)\{setPtPupils\(\{\}\);return\}/)
  assert.match(editor,/ptPupils:structuredClone\(ptPupils\)/)
})

test('seleção legada de pupilas é lida somente como fallback, sem gravar storage',()=>{
  const legacy=JSON.stringify({'1':{left:'oldL',right:'oldR',linked:true}})
  assert.deepEqual(savedLegacyPupilParts(legacy,1),{'pupil-left':'oldL','pupil-right':'oldR'})
  assert.deepEqual(savedLegacyPupilParts(legacy,2),{})
  const current=savedFaceLibraryParts(JSON.stringify({'1':{parts:{'pupil-left':'newL'}}}),1)
  assert.deepEqual({...savedLegacyPupilParts(legacy,1),...current},{'pupil-left':'newL','pupil-right':'oldR'})
})

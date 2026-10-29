import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { compilePortableExpression, applyPortableExpressionLayer,
  isPortableExpressionMotion, resolvePresetPupilGaze, compilePtPupilMotion, applyPtPupilMotion,
  isPtPupilOverrides, isPtPupilMotion } from '../src/shared/portableExpression.ts'
import { buildStudioExpressionTransforms, buildStudioExpressionAppearance, resolveStudioExpressionBase }
  from '../src/renderer/src/characters/studioExpressionTransforms.ts'
import { buildEditorV6ExpressionTransforms }
  from '../src/renderer/src/characters/editorV6ExpressionTransforms.ts'
import { createSceneFaceActions }
  from '../src/renderer/src/characters/sceneFaceActions.ts'
import { selectedExpressionEyeAssets, selectedEyeAssetsByIds }
  from '../src/renderer/src/features/fabricator/eyePreviewSelection.ts'

const tf=(x=0,y=0,sx=1,sy=1,rotation=0)=>({x,y,scaleX:sx,scaleY:sy,rotation})
const transforms=()=>({eyeLeft:tf(10,20),eyeRight:tf(10,20),pupilLeft:tf(0,0),pupilRight:tf(0,0),
  browLeft:tf(16,5),browRight:tf(16,5),nose:tf(30,40),mouth:tf(30,60)})
const selections={
  eyes:{left:'author-eye-L',right:'author-eye-R'},
  pupils:{left:'author-pupil-L',right:'author-pupil-R'},
  eyebrows:{left:'author-brow-L',right:'author-brow-R'},
  nose:{catalogId:'author-nose',index:0},
  mouth:{catalogId:'author-mouth',kind:'mouth-closed',index:0}
}
const metrics={eyeLeft:{width:70,height:34},eyeRight:{width:70,height:34},
  pupilLeft:{width:70,height:34},pupilRight:{width:70,height:34},
  browLeft:{width:60,height:22},browRight:{width:60,height:22},
  nose:{width:20,height:22},mouth:{width:35,height:24}}

test('máscaras de prévia selecionam apenas olhos visíveis e únicos', () => {
  const leftEye = { id: 'eye-left', kind: 'eye', dataUrl: 'left' }
  const sharedEye = { id: 'eye-shared', kind: 'eye', dataUrl: 'shared' }
  const pupil = { id: 'pupil', kind: 'pupil', dataUrl: 'pupil' }
  const assets = { [leftEye.id]: leftEye, [sharedEye.id]: sharedEye, [pupil.id]: pupil }

  assert.deepEqual(selectedExpressionEyeAssets({ left: leftEye.id, right: leftEye.id }, assets), [leftEye])
  assert.deepEqual(selectedExpressionEyeAssets({ left: leftEye.id, right: sharedEye.id }, assets), [leftEye, sharedEye])
  assert.deepEqual(selectedExpressionEyeAssets({ left: pupil.id, right: 'missing' }, assets), [])
  assert.deepEqual(selectedEyeAssetsByIds([leftEye.id, sharedEye.id, leftEye.id], assets), [leftEye, sharedEye])
})
const neutral=transforms()
const authored=transforms()
authored.eyeLeft={...authored.eyeLeft,x:17,y:15,rotation:13}
authored.eyeRight={...authored.eyeRight,x:16,y:19}
authored.pupilLeft={...authored.pupilLeft,x:13}
authored.pupilRight={...authored.pupilRight,x:-13}
authored.browLeft={...authored.browLeft,y:11,scaleX:1.25,rotation:-12}
authored.browRight={...authored.browRight,y:9}
authored.nose={...authored.nose,y:44}
authored.mouth={...authored.mouth,scaleY:1.4,rotation:8}
const motion=compilePortableExpression(authored,neutral,metrics)
const preset={schemaVersion:1,id:'preset-angry',modelSlot:1,name:'Raiva',collectionId:'standard',
  expressionIndex:4,selections,transforms:authored,referenceTransforms:neutral,portableMotion:motion,
  noseOpacity:.2,updatedAt:'2026-10-23T12:00:00Z'}
const asset=(id,w,h,base)=>({id,width:w,height:h,rightSidePositioned:id.endsWith('-R'),
  defaultTransform:base,dataUrl:'data:image/png;base64,AA=='})
function setupCharacter(factor){
  const comps={
    'target-eye-L':asset('target-eye-L',82*factor,41*factor,tf(120,144,1.2,1.2,0)),
    'target-eye-R':asset('target-eye-R',82*factor,41*factor,tf(240,144,1.2,1.2,0)),
    'target-pupil-L':asset('target-pupil-L',21*factor,21*factor,tf(2,1)),
    'target-pupil-R':asset('target-pupil-R',21*factor,21*factor,tf(2,1)),
    'target-brow-L':asset('target-brow-L',74*factor,24*factor,tf(130,110)),
    'target-brow-R':asset('target-brow-R',74*factor,24*factor,tf(245,110)),
  }
  const catalogs={
    'target-nose':{id:'target-nose',transforms:{nose:tf(180,199)},pieces:[{sheet:'nose',index:0,width:25*factor,height:32*factor}]},
    'target-mouth-closed':{id:'target-mouth-closed',transforms:{mouth:tf(180,240)},pieces:[{sheet:'mouth-closed',index:4,width:42*factor,height:28*factor}]},
    'target-mouth-open':{id:'target-mouth-open',transforms:{mouth:tf(180,240)},pieces:[{sheet:'mouth-open',index:4,width:42*factor,height:33*factor}]}
  }
  const appearance={
    modelSlot:1,eyeState:0,expressionIndex:0,mouthOpen:false,
    noseOpacity:0,mouthClosedCatalogId:'target-mouth-closed',mouthOpenCatalogId:'target-mouth-open',noseCatalogId:'target-nose',
    partColors:{'eye-left':{base:'#00aaff'}},
    components:{
      'eye-left':{assetId:'target-eye-L',transform:tf(137,150,1.4,.9)},
      'eye-right':{assetId:'target-eye-R',transform:tf(250,150,1.4,.9)},
      'pupil-left':{assetId:'target-pupil-L',transform:tf(4,1)},
      'pupil-right':{assetId:'target-pupil-R',transform:tf(4,1)},
      'brow-left':{assetId:'target-brow-L',transform:tf(145,106,1.25,1)},
      'brow-right':{assetId:'target-brow-R',transform:tf(255,106,1.25,1)}
    }
  }
  const loaded=[]
  const loadComponent=async id=>{loaded.push(id);if(id.startsWith('author'))throw Error('Author PNG no longer exists');return comps[id]??null}
  const loadCatalog=async id=>{loaded.push(id);if(id.startsWith('author'))throw Error('Author catalog no longer exists');return catalogs[id]??null}
  return {appearance,comps,catalogs,loaded,loadComponent,loadCatalog}
}

test('movimento portátil não grava seleção nem ID da imagem e mantém deltas em unidade proporcional',()=>{
  const original=structuredClone({neutral,authored})
  assert.equal(isPortableExpressionMotion(motion),true)
  assert.doesNotMatch(JSON.stringify(motion),/author|\.png|data:image/)
  assert.equal(motion.layers.eyeLeft.dx,.1)
  assert.equal(motion.layers.eyeLeft.rotation,13)
  const target=tf(200,144,1.3,.8)
  const applied=applyPortableExpressionLayer(motion,'eyeLeft',target,{width:140,height:68})
  assert.equal(applied.x,214)
  assert.equal(applied.y,134)
  assert.equal(applied.rotation,13)
  assert.equal(applied.scaleX,1.3)
  assert.deepEqual({neutral,authored},original)
})

test('duas faces completamente distintas usam a mesma emoção sem carregar PNGs originais',async()=>{
  for (const factor of [.65,1.35]){
    const character=setupCharacter(factor)
    const original=structuredClone(character.appearance)
    const resolved=await buildStudioExpressionAppearance(preset,character.appearance,character.loadCatalog)
    assert.equal(resolved.noseOpacity,0)
    assert.deepEqual(resolved.partColors,character.appearance.partColors)
    const result=await buildStudioExpressionTransforms(preset,resolved,{},character.loadComponent,character.loadCatalog,'right')
    assert.equal(character.loaded.some(id=>id.startsWith('author')),false,'reference PNG is not necessary')
    const eye=result['expression-component:eye-left'].sourceTransformOverride
    assert.ok(Math.abs(eye.x-(137+82*factor*.1))<.001)
    const brow=result['expression-component:brow-left'].sourceTransformOverride
    assert.ok(Math.abs(brow.y-(106+24*factor*6/22))<.001)
    assert.equal(brow.rotation,-12)
    assert.ok(Math.abs(result['expression:nose:target-nose'].sourceTransformOverride.y-(199+32*factor*4/22))<1e-7)
    assert.deepEqual(character.appearance,original,'customizer base never mutates')
  }
})

test('normal e PT compartilham a expressão e PT fallback aplica direção sem acumular alterações',async()=>{
  const fixture=setupCharacter(1)
  const before=structuredClone(preset)
  const right=await buildStudioExpressionTransforms(preset,fixture.appearance,{},fixture.loadComponent,fixture.loadCatalog,'right')
  const left=await buildStudioExpressionTransforms(preset,fixture.appearance,{},fixture.loadComponent,fixture.loadCatalog,'left')
  assert.equal(right['expression-component:eye-left'].sourceTransformOverride.x,left['expression-component:eye-left'].sourceTransformOverride.x)
  assert.equal(right['expression-component:brow-right'].sourceTransformOverride.y,left['expression-component:brow-right'].sourceTransformOverride.y)
  for(const side of ['left','right']){
    const key=`expression-component:pupil-${side}`
    const neutralX=fixture.appearance.components[`pupil-${side}`].transform.x
    const eye=fixture.comps[`target-eye-${side==='left'?'L':'R'}`]
    const expected=resolvePresetPupilGaze(right[key].sourceTransformOverride.x,neutralX,eye.width,1.4,
      side,side==='right','left')
    assert.equal(left[key].sourceTransformOverride.x,expected)
    assert.equal(right[key].sourceTransformOverride.y,left[key].sourceTransformOverride.y)
  }
  for(let i=0;i<30;i++){
    const next=await buildStudioExpressionTransforms(preset,fixture.appearance,{},fixture.loadComponent,fixture.loadCatalog,i%2?'left':'right')
    assert.deepEqual(next,i%2?left:right)
  }
  assert.deepEqual(preset,before)
})

test('uma pupila neutra ainda olha realmente à direita na normal e esquerda em PT',()=>{
  assert.equal(resolvePresetPupilGaze(0,0,100,1,'left',false,'right'),16)
  assert.equal(resolvePresetPupilGaze(0,0,100,1,'left',false,'left'),-16)
  assert.equal(resolvePresetPupilGaze(0,0,100,1,'right',false,'left'),16)
})

test('PT manuais são isoladas por expressão, por lado e herdam todos os outros componentes',async()=>{
  const ptPupils={left:{x:-9,y:7,rotation:31},right:{x:8,y:-5,rotation:-26}}
  const ptPupilMotion=compilePtPupilMotion(ptPupils,neutral,metrics)
  assert.equal(isPtPupilOverrides(ptPupils),true)
  assert.equal(isPtPupilMotion(ptPupilMotion),true)
  assert.equal(isPtPupilOverrides({left:{x:NaN,y:0,rotation:1}}),false)
  assert.equal(isPtPupilMotion({version:1,layers:{left:{dx:Infinity,dy:0,rotation:1}}}),false)
  assert.deepEqual(compilePtPupilMotion({},neutral,metrics),undefined)
  const edited={...preset,ptPupils,ptPupilMotion}
  const serialized=JSON.parse(JSON.stringify(edited))
  const actor=setupCharacter(1)
  const prior=structuredClone(actor.appearance)
  const normal=await buildStudioExpressionTransforms(serialized,actor.appearance,{},actor.loadComponent,actor.loadCatalog,'right')
  const pt=await buildStudioExpressionTransforms(serialized,actor.appearance,{},actor.loadComponent,actor.loadCatalog,'left')
  const editorV6=await buildEditorV6ExpressionTransforms(serialized,actor.appearance,{},actor.loadComponent,actor.loadCatalog,'left')
  assert.deepEqual(editorV6,pt,'Editor V6 transfere a mesma posição PT que a prévia compartilhada')
  for(const key of Object.keys(normal)){
    if(key.includes('pupil-'))continue
    assert.deepEqual(pt[key],normal[key],'PT inherits regular layer '+key)
  }
  for(const [side,manual] of Object.entries(ptPupils)){
    const id='expression-component:pupil-'+side
    const pupil=pt[id].sourceTransformOverride
    const base=actor.appearance.components['pupil-'+side].transform
    const eye=actor.appearance.components['eye-'+side]
    assert.ok(Math.abs(pupil.x-(base.x+manual.x/70*82*eye.transform.scaleX))<1e-7)
    assert.ok(Math.abs(pupil.y-(base.y+manual.y/34*41*eye.transform.scaleY))<1e-7)
    assert.equal(pupil.rotation,manual.rotation)
    assert.equal(pupil.scaleX,normal[id].sourceTransformOverride.scaleX)
    assert.equal(pupil.scaleY,normal[id].sourceTransformOverride.scaleY)
    assert.equal(pupil.flipX,normal[id].sourceTransformOverride.flipX)
  }
  // Changing the normal eye, brow, or pupil size propagates to PT automatically.
  const changed=structuredClone(serialized)
  changed.portableMotion.layers.eyeLeft={...changed.portableMotion.layers.eyeLeft,dx:.21}
  changed.portableMotion.layers.pupilLeft={...changed.portableMotion.layers.pupilLeft,sx:1.6}
  const after=await buildStudioExpressionTransforms(changed,actor.appearance,{},actor.loadComponent,actor.loadCatalog,'left')
  assert.ok(after['expression-component:eye-left'].sourceTransformOverride.x!==pt['expression-component:eye-left'].sourceTransformOverride.x)
  assert.equal(after['expression-component:pupil-left'].sourceTransformOverride.scaleX,
    pt['expression-component:pupil-left'].sourceTransformOverride.scaleX*1.6)
  assert.equal(after['expression-component:pupil-left'].sourceTransformOverride.x,
    pt['expression-component:pupil-left'].sourceTransformOverride.x)
  assert.deepEqual(actor.appearance,prior,'source character remains untouched')
  assert.deepEqual(serialized.ptPupils,ptPupils)
})

test('normal preserva X e rotação autorais, sem o antigo recálculo obrigatório para a direita',async()=>{
  const original=structuredClone(preset)
  const actor=setupCharacter(1)
  const result=await buildStudioExpressionTransforms(preset,actor.appearance,{},actor.loadComponent,actor.loadCatalog,'right')
  const normal=result['expression-component:pupil-right'].sourceTransformOverride
  assert.equal(normal.x,4-13/70*82,'no forced positive right gaze')
  assert.equal(normal.rotation,0)
  const both=await buildStudioExpressionTransforms({...preset,ptPupilMotion:undefined},actor.appearance,{},actor.loadComponent,actor.loadCatalog,'left')
  assert.equal(both['expression-component:pupil-right'].sourceTransformOverride.x,
    resolvePresetPupilGaze(normal.x,4,82,1.4,'right',true,'left'),
    'PT legado usa a direção calculada; ela pode coincidir com um preset já olhando à esquerda')
  assert.deepEqual(preset,original)
})

test('PT sem edição permanece automática em todas as 21 expressões e após JSON roundtrip',async()=>{
  const actor=setupCharacter(.8)
  for(let i=0;i<21;i++){
    const edited=structuredClone({...preset,id:'face-'+i,expressionIndex:i,
      ptPupils:{left:{x:i-8,y:i/2,rotation:i*3}}})
    edited.ptPupilMotion=compilePtPupilMotion(edited.ptPupils,neutral,metrics)
    const load=JSON.parse(JSON.stringify(edited))
    const pt=await buildStudioExpressionTransforms(load,actor.appearance,{},actor.loadComponent,actor.loadCatalog,'left')
    const normal=await buildStudioExpressionTransforms(load,actor.appearance,{},actor.loadComponent,actor.loadCatalog,'right')
    const left=pt['expression-component:pupil-left'].sourceTransformOverride
    const right=pt['expression-component:pupil-right'].sourceTransformOverride
    assert.equal(left.rotation,i*3)
    assert.notEqual(left.x,normal['expression-component:pupil-left'].sourceTransformOverride.x)
    const eye=actor.comps['target-eye-R']
    const baseline=actor.appearance.components['pupil-right'].transform.x
    assert.equal(right.x,resolvePresetPupilGaze(normal['expression-component:pupil-right'].sourceTransformOverride.x,
      baseline,eye.width,1.4,'right',true,'left'),'unconfigured right retains fallback')
    assert.equal(right.y,normal['expression-component:pupil-right'].sourceTransformOverride.y)
  }
})

test('presets legados continuam transferindo usando referências; erro visível se asset faltou',async()=>{
  const legacy={...preset,portableMotion:undefined}
  const fixture=setupCharacter(1)
  await assert.rejects(buildStudioExpressionTransforms(legacy,fixture.appearance,{},id=>id.startsWith('author')?Promise.resolve(null):fixture.loadComponent(id),fixture.loadCatalog),/Preset antigo depende/)
  assert.equal(isPortableExpressionMotion({version:1,layers:{eyeLeft:{dx:Infinity,dy:0,sx:1,sy:1,rotation:0,flip:false}}}),false)
})

test('Studio e Editor V6 persistem a direção do olhar sem escrever outro preset',async()=>{
  const paths=['src/renderer/src/features/studio/StudioPage.tsx',
    'src/renderer/src/features/studio/useStudioCharacterSourceRefresh.ts',
    'src/renderer/src/features/editorV6/EditorV6Page.tsx',
    'src/renderer/src/features/editorV6/EditorV6PresetPanel.tsx',
    'src/renderer/src/characters/sceneFaceActions.ts',
    'src/renderer/src/features/fabricator/ExpressionPresetWorkspace.tsx']
  const [studio,studioRefresh,editorV6,editorV6Panel,sceneFaceActions,editor]=await Promise.all(paths.map(path=>readFile(path,'utf8')))
  assert.match(studio,/createSceneFaceActions/)
  assert.match(editorV6,/createSceneFaceActions/)
  assert.match(sceneFaceActions,/activeExpressionGaze: gaze/)
  assert.ok(editorV6Panel.includes('aria-label={`Pupilas à esquerda: ${preset.name}`}'))
  assert.match(studioRefresh,/element\.activeExpressionGaze \?\? 'right'/)
  assert.match(editorV6Panel,/activeExpressionGaze === 'left'/)
  assert.match(editor,/setPreviewGaze\(pupilsLeft\?'left':'right'\)/)
  assert.doesNotMatch(editor,/turnPupilsLeft\(/)
  assert.match(editor,/ExpressionCharacterPreview/)
  assert.match(editor,/saveFaceExpressionPresetBatch/)
})

test('ações faciais compartilhadas mantêm folha, variantes e modo de fala da cena',async()=>{
  const appearance={modelSlot:1,eyeState:0,eyebrows:true,noseIndex:1,expressionIndex:0,mouthOpen:false,eyeCatalogId:'eyes-old'}
  const element={kind:'character',faceTransforms:{nose:{x:12,y:8,width:20,height:20,rotation:0}}}
  const applied=[]
  const errors=[]
  const item={id:'mouth-open',modelSlot:1,category:'mouth-open',selectedNose:0,selectedExpression:2}
  const actions=createSceneFaceActions({
    character:{customization:{faceAppearance:appearance}},element,appearance,faceMode:'idle',modelSlot:1,
    expressionCollectionId:'standard',expressionBusy:false,faceBusy:false,
    setExpressionBusy:()=>{},setError:(error)=>errors.push(error),
    loadCatalogItem:async()=>item,
    applyAppearance:async(...args)=>applied.push(args)
  })

  await actions.chooseFaceSheet({id:item.id,modelSlot:1,category:item.category})

  assert.equal(applied.length,1)
  assert.deepEqual(applied[0][0],{
    ...appearance,setId:undefined,mouthOpenCatalogId:'mouth-open',expressionIndex:2,mouthOpen:true
  })
  assert.deepEqual(applied[0][1],element.faceTransforms)
  assert.equal(applied[0][3].activeFaceMode,'talk')
  assert.deepEqual(errors,[])
})

test('todas as 21 expressões são variações da base e PT não vira um novo preset',async()=>{
  const actor=setupCharacter(1.2)
  const baseline=structuredClone(actor.appearance)
  const emotionIds=[]
  for(let index=0;index<21;index++){
    const emotion={...preset,id:`emotion-${index}`,expressionIndex:index}
    const composed=await buildStudioExpressionAppearance(emotion,actor.appearance,actor.loadCatalog)
    for(const gaze of ['right','left']){
      const position=await buildStudioExpressionTransforms(emotion,composed,{},actor.loadComponent,actor.loadCatalog,gaze)
      assert.ok(position['expression-component:pupil-left'])
      assert.ok(position['expression-component:brow-right'])
      assert.equal(composed.components['eye-left'].assetId,baseline.components['eye-left'].assetId)
    }
    emotionIds.push(emotion.id)
  }
  assert.equal(new Set(emotionIds).size,21)
  assert.deepEqual(actor.appearance,baseline)
  assert.equal(actor.loaded.some(id=>id.startsWith('author')),false)
})

test('movimento da sobrancelha direita troca o sinal ao passar de PNG espelhado para direito real',()=>{
  const original=transforms()
  const edited=transforms()
  edited.browRight.x+=12
  edited.browRight.rotation+=19
  const mirrored=compilePortableExpression(edited,original,{browRight:{width:60,height:20,mirrored:true}})
  const target=tf(190,105,1.25,.95)
  const physical=applyPortableExpressionLayer(mirrored,'browRight',target,{width:90,height:30,mirrored:false})
  assert.equal(physical.x,172)
  assert.equal(physical.rotation,-19)
  const mirrorTarget=applyPortableExpressionLayer(mirrored,'browRight',target,{width:90,height:30,mirrored:true})
  assert.equal(mirrorTarget.x,208)
  assert.equal(mirrorTarget.rotation,19)
  assert.deepEqual(target,tf(190,105,1.25,.95))
})

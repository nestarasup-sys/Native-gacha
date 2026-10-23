import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { compilePortableExpression, applyPortableExpressionLayer,
  isPortableExpressionMotion, resolvePresetPupilGaze } from '../src/shared/portableExpression.ts'
import { buildStudioExpressionTransforms, buildStudioExpressionAppearance, resolveStudioExpressionBase }
  from '../src/renderer/src/characters/studioExpressionTransforms.ts'

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
    assert.equal(result['expression:nose:target-nose'].sourceTransformOverride.y,199+32*factor*4/22)
    assert.deepEqual(character.appearance,original,'customizer base never mutates')
  }
})

test('normal e PT são a MESMA expressão, só pupila muda X, sem acumular após alternar 30 vezes',async()=>{
  const fixture=setupCharacter(1)
  const before=structuredClone(preset)
  const right=await buildStudioExpressionTransforms(preset,fixture.appearance,{},fixture.loadComponent,fixture.loadCatalog,'right')
  const left=await buildStudioExpressionTransforms(preset,fixture.appearance,{},fixture.loadComponent,fixture.loadCatalog,'left')
  assert.equal(right['expression-component:eye-left'].sourceTransformOverride.x,left['expression-component:eye-left'].sourceTransformOverride.x)
  assert.equal(right['expression-component:brow-right'].sourceTransformOverride.y,left['expression-component:brow-right'].sourceTransformOverride.y)
  for(const side of ['left','right']){
    const key=`expression-component:pupil-${side}`
    const neutralX=fixture.appearance.components[`pupil-${side}`].transform.x
    assert.ok(right[key].sourceTransformOverride.x!==left[key].sourceTransformOverride.x)
    assert.ok(Math.abs((right[key].sourceTransformOverride.x-neutralX)+(left[key].sourceTransformOverride.x-neutralX))<1e-7)
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

test('presets legados continuam transferindo usando referências; erro visível se asset faltou',async()=>{
  const legacy={...preset,portableMotion:undefined}
  const fixture=setupCharacter(1)
  await assert.rejects(buildStudioExpressionTransforms(legacy,fixture.appearance,{},id=>id.startsWith('author')?Promise.resolve(null):fixture.loadComponent(id),fixture.loadCatalog),/Preset antigo depende/)
  assert.equal(isPortableExpressionMotion({version:1,layers:{eyeLeft:{dx:Infinity,dy:0,sx:1,sy:1,rotation:0,flip:false}}}),false)
})

test('Studio e Video Studio persistem o estado de PT sem escrever outro preset',async()=>{
  const paths=['src/renderer/src/features/studio/StudioPage.tsx',
    'src/renderer/src/features/videoStudio/VideoStudioEditor.tsx',
    'src/renderer/src/features/fabricator/ExpressionPresetWorkspace.tsx']
  const [studio,video,editor]=await Promise.all(paths.map(path=>readFile(path,'utf8')))
  assert.match(studio,/activeExpressionGaze: gaze/)
  assert.match(video,/activeExpressionGaze: gaze/)
  assert.match(video,/PT: /)
  assert.match(studio,/element\.activeExpressionGaze \?\? 'right'/)
  assert.match(video,/stateElement\.activeExpressionGaze \?\? 'right'/)
  assert.match(editor,/setPreviewGaze\(pupilsLeft\?'left':'right'\)/)
  assert.doesNotMatch(editor,/turnPupilsLeft\(/)
  assert.match(editor,/ExpressionCharacterPreview/)
  assert.match(editor,/saveFaceExpressionPresetBatch/)
})

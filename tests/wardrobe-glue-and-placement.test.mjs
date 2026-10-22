import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fixWardrobeGlue, releaseWardrobeGlue, editWardrobeGlue, wardrobeGlueState, suggestWardrobeGlueTarget } from '../src/shared/wardrobeGlue.ts'
import { mapWardrobeComponentToPose } from '../src/shared/wardrobePose.ts'
import { toggleWardrobeVisibility, updateWardrobeComponentGroups } from '../src/shared/wardrobePlacementModel.ts'

const bone = (id,name,x,y,width=42,height=80)=>({
  id,name,x:x+120,y:y+55,width,height,rotation:45,dataUrl:'data:image/png;base64,AA==',
  sourceTransform:{x,y,width,height,rotation:0}
})
const armRight=bone('forearm-right','Antebraço direito',260,60,38,83)
const armLeft=bone('forearm-left','Antebraço esquerdo',15,60,38,83)
const chest=bone('torso','Tronco',130,65,92,138)
const piece=(id='sleeve',x=263,y=69)=>({
  id,name:'Manga inferior direita',category:'manga-inferior',attachedPartId:'forearm-right',
  x,y,width:33,height:67,rotation:17,dataUrl:'data:image/png;base64,AA==',
  glue:{version:1,mode:'loose'}
})
const near=(a,b)=>assert.ok(Math.abs(a-b)<0.00001,`expected ${a} ~= ${b}`)

test('roupa começa solta, fixa manualmente sem mover um pixel e pode soltar sem perda',()=>{
  const loose=piece(),snapshot=structuredClone(loose)
  assert.equal(wardrobeGlueState(loose,armRight),'loose')
  const fixed=fixWardrobeGlue(loose,armRight)
  assert.equal(wardrobeGlueState(fixed,armRight),'fixed')
  for(const key of ['x','y','width','height','rotation','dataUrl','attachedPartId'])assert.equal(fixed[key],loose[key])
  assert.equal(fixed.binding.boneId,'forearm-right')
  assert.equal(fixed.glue.sourceFrame.x,260)
  const released=releaseWardrobeGlue(fixed)
  assert.equal(wardrobeGlueState(released,armRight),'loose')
  assert.equal(released.binding,undefined)
  assert.equal(released.x,loose.x)
  assert.deepEqual(loose,snapshot,'o PNG/rascunho original permanece imutável')
})

test('ajustar roupa fixada atualiza grude; arrastar peça solta nunca fixa sozinho',()=>{
  const loose=piece()
  const dragged=editWardrobeGlue(loose,{x:290,y:88,rotation:33},armRight)
  assert.equal(dragged.glue.mode,'loose')
  assert.equal(dragged.binding,undefined)
  const fixed=fixWardrobeGlue(dragged,armRight)
  const moved=editWardrobeGlue(fixed,{x:296,width:37},armRight)
  assert.equal(wardrobeGlueState(moved,armRight),'fixed')
  assert.notEqual(moved.binding.localCenterX,fixed.binding.localCenterX)
  assert.notEqual(moved.binding.widthRatio,fixed.binding.widthRatio)
  const retargeted=editWardrobeGlue(moved,{attachedPartId:'forearm-left'},armLeft)
  assert.equal(wardrobeGlueState(retargeted,armLeft),'loose')
  assert.equal(retargeted.binding,undefined,'troca de membro exige novo clique em Fixar')
})

test('grude congelado acompanha poses com escala não uniforme mesmo após revisão da fonte',()=>{
  const fixed=fixWardrobeGlue(piece(),armRight)
  const pose={...armRight,x:85,y:144,width:70,height:107,rotation:-64}
  const transform=mapWardrobeComponentToPose(fixed,armRight,pose)
  const newBone={...armRight,sourceTransform:{...armRight.sourceTransform,x:280,width:50}}
  assert.equal(wardrobeGlueState(fixed,newBone),'stale')
  const stillFixed=mapWardrobeComponentToPose(fixed,newBone,pose)
  assert.equal(stillFixed.matrix,transform.matrix)
  near(stillFixed.localLeft,transform.localLeft)
  near(stillFixed.localTop,transform.localTop)
  const refixed=fixWardrobeGlue(fixed,newBone)
  assert.equal(wardrobeGlueState(refixed,newBone),'fixed')
  assert.notEqual(refixed.binding.localCenterX,fixed.binding.localCenterX)
})

test('sugestão de alvo considera sobreposição, tipo e lado sem reposicionar roupa',()=>{
  const sleeve=piece()
  const matched=suggestWardrobeGlueTarget(sleeve,[armLeft,chest,armRight])
  assert.equal(matched?.id,'forearm-right')
  assert.equal(suggestWardrobeGlueTarget({...sleeve,x:390,y:390},[armLeft,armRight]),null)
  const wrongSide={...piece(),name:'Manga inferior esquerda',attachedPartId:''}
  assert.equal(suggestWardrobeGlueTarget(wrongSide,[armRight]),null,'nunca sugere membro direito para peça esquerda')
})

const group={
  modelSlot:1,setId:'uniform',category:'manga-inferior',offsetX:0,offsetY:0,scaleX:1,scaleY:1,rotation:0
}
const selected={modelSlot:1,setId:'uniform',category:'manga-inferior',componentId:'sleeve-right'}
const wardrobeComponents=[
  {...piece('sleeve-left',16,68),name:'Manga esquerda',attachedPartId:'forearm-left'},
  {...piece('sleeve-right',264,68),name:'Manga direita',attachedPartId:'forearm-right'}
]
test('Customizador separa seleção legada por ID e muda só a peça escolhida',()=>{
  const before=[group]
  const changed=updateWardrobeComponentGroups(before,before,selected,'transform',{offsetX:22,scaleX:1.4},['manga-inferior'],wardrobeComponents,[armLeft,armRight])
  assert.equal(changed.length,2)
  const left=changed.find(x=>x.componentId==='sleeve-left')
  const right=changed.find(x=>x.componentId==='sleeve-right')
  assert.equal(left.offsetX,0); assert.equal(left.scaleX,1)
  assert.equal(right.offsetX,22); assert.equal(right.scaleX,1.4)
  assert.deepEqual(before,[group])
  const hidden=updateWardrobeComponentGroups(changed,changed,selected,'toggle-hidden',undefined,['manga-inferior'],wardrobeComponents,[])
  assert.equal(hidden.find(x=>x.componentId==='sleeve-right').hidden,true)
  assert.notEqual(hidden.find(x=>x.componentId==='sleeve-left').hidden,true)
  assert.equal(toggleWardrobeVisibility({...group,hidden:true,opacity:.25}).opacity,undefined)
})

test('interface usa grude real, sem bolinha azul, sem mudar a folha desmontada',async()=>{
  const [workspace,controls,renderer,customizer]=await Promise.all([
    readFile('src/renderer/src/features/fabricator/wardrobe/WardrobeWorkspace.tsx','utf8'),
    readFile('src/renderer/src/features/fabricator/wardrobe/WardrobeGlueControls.tsx','utf8'),
    readFile('src/renderer/src/characters/characterRenderer.ts','utf8'),
    readFile('src/renderer/src/features/customizer/CustomizerPage.tsx','utf8')
  ])
  assert.match(workspace,/selectOriginalModelSource\(model\)/)
  assert.match(workspace,/fixWardrobeGlue\(piece, bone\)/)
  assert.match(workspace,/releaseWardrobeGlue\(piece\)/)
  assert.match(workspace,/component\.glue\?\.mode !== 'loose'/)
  assert.doesNotMatch(workspace,/wardrobe-binding-marker|showBindingMarkers/)
  assert.match(controls,/Fixar nesta parte/)
  assert.match(controls,/Soltar/)
  assert.match(renderer,/component\.glue\?\.mode === 'loose'/)
  assert.match(customizer,/updateWardrobeComponentGroups\(/)
})

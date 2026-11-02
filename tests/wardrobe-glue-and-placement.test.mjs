import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fixWardrobeGlue, releaseWardrobeGlue, editWardrobeGlue, wardrobeGlueState, suggestWardrobeGlueTarget } from '../src/shared/wardrobeGlue.ts'
import { applyWardrobeComponentEdit, nudgeWardrobeComponent, resizeWardrobeComponent, restoreWardrobeComponentOrigin, scaleWardrobeComponentAxis } from '../src/renderer/src/features/fabricator/wardrobe/wardrobeComponentEditing.ts'
import { mapWardrobeComponentToPose } from '../src/shared/wardrobePose.ts'
import { toggleWardrobeVisibility, updateWardrobeComponentGroups, recolorWardrobeComponents, selectWardrobePanelComponents, wardrobeGroupCategoryForSource } from '../src/shared/wardrobePlacementModel.ts'
import { createWardrobeGridHistory } from '../src/renderer/src/features/fabricator/wardrobe/wardrobeGridHistory.ts'
import { createWardrobeBindingCommands } from '../src/renderer/src/features/fabricator/wardrobe/wardrobeBindingCommands.ts'

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

test('comandos de grude gravam histórico e alteram somente a peça selecionada',()=>{
  const selected=piece()
  const draft={importKind:'pants-grid-3x4',components:[selected,{...piece('other'),id:'other'}]}
  const pairedGridHistoryRef={current:createWardrobeGridHistory()}
  let current=draft,dirty=false,error='erro anterior'
  const commands=createWardrobeBindingCommands({
    selected,referenceModel:{parts:[armRight]},pairedGridHistoryRef,
    setDraft:update=>{current=update(current)},setDirty:value=>{dirty=value},setError:value=>{error=value}
  })

  commands.fixSelectedBinding()
  assert.equal(current.components[0].glue.mode,'fixed')
  assert.equal(current.components[1].glue.mode,'loose')
  assert.equal(dirty,true)
  assert.equal(error,'')
  assert.equal(pairedGridHistoryRef.current.canUndo,true)

  commands.releaseSelectedBinding()
  assert.equal(current.components[0].glue.mode,'loose')
  assert.equal(current.components[1].glue.mode,'loose')
  assert.equal(pairedGridHistoryRef.current.canUndo,true)
})

test('edição de peça infere categoria/nome pelo osso e protege a camada de acessórios',()=>{
  const model={width:400,height:400,parts:[armLeft,armRight,chest]}
  const original={...piece(),renderAboveHair:true}
  const attached=applyWardrobeComponentEdit(original,{attachedPartId:'forearm-left'},model,400)
  assert.equal(attached.category,'manga-inferior')
  assert.equal(attached.name,'Manga inferior esquerda')
  assert.equal(attached.renderAboveHair,false)
  assert.equal(original.attachedPartId,'forearm-right')
  assert.equal(original.renderAboveHair,true)

  const accessory=applyWardrobeComponentEdit({...original,category:'oculos'},{category:'acessorio-cabeca'},model,400)
  assert.equal(accessory.category,'acessorio-cabeca')
  assert.equal(accessory.renderAboveHair,true)
  assert.equal(applyWardrobeComponentEdit(original,{category:'camisa'},model,400).renderAboveHair,false)
})

test('categorias de sapato e luva escolhem somente um osso sem sobrescrever escolha explícita',()=>{
  const leftFoot={...bone('foot-left','Pé esquerdo',160,340,40,30),x:160,y:340,rotation:0}
  const rightFoot={...bone('foot-right','Pé direito',200,340,40,30),x:200,y:340,rotation:0}
  const model={width:400,height:400,parts:[leftFoot,rightFoot,armLeft,armRight]}
  const left=applyWardrobeComponentEdit({...piece(),x:205,width:30},{category:'sapato'},model,500)
  assert.equal(left.attachedPartId,'foot-left','a seleção lateral usa a largura do conjunto atual, não a do modelo fonte')
  assert.equal(left.name,'Manga inferior direita','a categoria sugerida não renomeia a peça automaticamente')
  const explicit=applyWardrobeComponentEdit({...piece(),x:340,width:25},{category:'sapato',attachedPartId:'foot-left'},model,400)
  assert.equal(explicit.attachedPartId,'foot-left')
})

test('transformações de peça são puras, mantêm o centro e recuperam o quadro original',()=>{
  const selected={...piece(),x:10,y:20,width:40,height:60,originX:8,originY:17,originWidth:50,originHeight:75,rotation:12}
  assert.deepEqual(nudgeWardrobeComponent(selected,3,-4),{x:13,y:16})
  assert.deepEqual(resizeWardrobeComponent(selected,1.1),{
    originX:8,originY:17,originWidth:50,originHeight:75,x:8,y:17,width:44,height:66
  })
  assert.deepEqual(scaleWardrobeComponentAxis(selected,'width',100,true),{
    originX:8,originY:17,originWidth:50,originHeight:75,x:-20,y:-25,width:100,height:150
  })
  assert.deepEqual(scaleWardrobeComponentAxis(selected,'height',30,false),{
    originX:8,originY:17,originWidth:50,originHeight:75,x:10,y:35,width:40,height:30
  })
  assert.equal(scaleWardrobeComponentAxis(selected,'width',Number.NaN,true),null)
  assert.deepEqual(restoreWardrobeComponentOrigin(selected),{x:8,y:17,width:50,height:75,rotation:0})
  assert.deepEqual(selected,{...piece(),x:10,y:20,width:40,height:60,originX:8,originY:17,originWidth:50,originHeight:75,rotation:12})
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
  const [workspace,bindingCommands,controls,renderer,customizerAdjustment]=await Promise.all([
    readFile('src/renderer/src/features/fabricator/wardrobe/WardrobeWorkspace.tsx','utf8'),
    readFile('src/renderer/src/features/fabricator/wardrobe/wardrobeBindingCommands.ts','utf8'),
    readFile('src/renderer/src/features/fabricator/wardrobe/WardrobeGlueControls.tsx','utf8'),
    readFile('src/renderer/src/characters/characterWardrobeRenderer.ts','utf8'),
    readFile('src/renderer/src/features/customizer/useCustomizerWardrobeAdjustment.ts','utf8')
  ])
  assert.match(workspace,/selectOriginalModelSource\(model\)/)
  assert.match(workspace,/createWardrobeBindingCommands\(/)
  assert.match(bindingCommands,/fixWardrobeGlue\(piece, bone\)/)
  assert.match(bindingCommands,/releaseWardrobeGlue\(piece\)/)
  assert.match(workspace,/component\.glue\?\.mode !== 'loose'/)
  assert.doesNotMatch(workspace,/wardrobe-binding-marker|showBindingMarkers/)
  assert.match(controls,/Fixar nesta parte/)
  assert.match(controls,/Soltar/)
  assert.match(renderer,/component\.glue\?\.mode === 'loose'/)
  assert.match(customizerAdjustment,/updateWardrobeComponentGroups\(/)
})

test('WardrobeWorkspace mantém a sessão e encaminha as regras de edição ao módulo puro',async()=>{
  const page=await readFile('src/renderer/src/features/fabricator/wardrobe/WardrobeWorkspace.tsx','utf8')
  assert.match(page,/import \{ applyWardrobeComponentEdit, nudgeWardrobeComponent, resizeWardrobeComponent, restoreWardrobeComponentOrigin, scaleWardrobeComponentAxis \} from '\.\/wardrobeComponentEditing'/)
  assert.match(page,/return applyWardrobeComponentEdit\(component, values, referenceModel, current\.width\)/)
  assert.match(page,/scaleWardrobeComponentAxis\(selected, axis, value, lockAspectRatio\)/)
  assert.doesNotMatch(page,/const ratio = value \/ \(axis === 'width' \? originWidth : originHeight\)/)
})

test('paletas de roupas são alteradas apenas no componente e lado escolhidos',()=>{
  const left={...group,componentId:'sleeve-left',colors:{base:'#111111'}}
  const right={...group,componentId:'sleeve-right',colors:{base:'#222222'}}
  const input=[left,right]
  const recolored=recolorWardrobeComponents(input,1,'uniform','manga-inferior',['sleeve-right'],
    {kind:'role',role:'base',value:'#abcdef'})
  assert.equal(recolored[0],left)
  assert.equal(recolored[1].colors.base,'#abcdef')
  assert.equal(left.colors.base,'#111111')
  const replaced=recolorWardrobeComponents(recolored,1,'uniform','manga-inferior',['sleeve-left'],
    {kind:'replace',colors:{base:'#fedcba'}})
  assert.equal(replaced[0].colors.base,'#fedcba')
  assert.equal(replaced[1].colors.base,'#abcdef')
  const cleared=recolorWardrobeComponents(replaced,1,'uniform','manga-inferior',['sleeve-right'],{kind:'clear'})
  assert.equal(cleared[1].colors,undefined)
  assert.equal(cleared[0].colors.base,'#fedcba')
  assert.deepEqual(input,[left,right])
})

test('trocar manga direita preserva manga esquerda e ajustes da peça oposta',()=>{
  const left={...group,componentId:'left-piece',offsetX:11,colors:{base:'#111111'}}
  const right={...group,componentId:'old-right',offsetX:35,colors:{base:'#222222'}}
  const other={...group,category:'camisa',componentId:'shirt'}
  const swapped=selectWardrobePanelComponents([left,right,other],1,'manga-inferior',
    ['1:uniform:old-right'],{modelSlot:1,setId:'uniform',componentIds:['new-right'],colors:{base:'#abcdef'}})
  assert.equal(swapped.length,3)
  assert.equal(swapped[0],left)
  assert.equal(swapped[0].offsetX,11)
  assert.equal(swapped[1],other)
  assert.equal(swapped[2].componentId,'new-right')
  assert.equal(swapped[2].offsetX,0)
  assert.equal(swapped[2].colors.base,'#abcdef')
  const removed=selectWardrobePanelComponents(swapped,1,'manga-inferior',['1:uniform:new-right'],null)
  assert.deepEqual(removed,[left,other])
})

test('metades de manga longa equipadas no Customizador compartilham a categoria superior',()=>{
  const upper={modelSlot:1,setId:'uniform',category:'manga-superior',componentId:'upper-left',offsetX:4,offsetY:0,scaleX:1,scaleY:1,rotation:0}
  const oldLower={modelSlot:1,setId:'uniform',category:'manga-inferior',componentId:'lower-left',offsetX:12,offsetY:3,scaleX:1.1,scaleY:1,rotation:4,colors:{base:'#123456'}}
  const right={modelSlot:1,setId:'uniform',category:'manga-superior',componentId:'upper-right',offsetX:0,offsetY:0,scaleX:1,scaleY:1,rotation:0}
  const equipped=selectWardrobePanelComponents([upper,oldLower,right],1,'manga-superior',
    ['1:uniform:upper-left','1:uniform:lower-left'],
    {modelSlot:1,setId:'uniform',componentIds:['upper-left','lower-left']})
  assert.deepEqual(equipped.map(group=>[group.componentId,group.category]),[
    ['upper-right','manga-superior'],['upper-left','manga-superior'],['lower-left','manga-superior']
  ])
  assert.deepEqual(
    (({offsetX,offsetY,scaleX,scaleY,rotation,colors})=>({offsetX,offsetY,scaleX,scaleY,rotation,colors}))(equipped.find(group=>group.componentId==='lower-left')),
    {offsetX:12,offsetY:3,scaleX:1.1,scaleY:1,rotation:4,colors:{base:'#123456'}}
  )
  assert.equal(wardrobeGroupCategoryForSource('manga-inferior','manga-superior'),'manga-superior')
  assert.equal(wardrobeGroupCategoryForSource('manga-inferior','manga-inferior'),'manga-inferior')
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { bindWardrobeComponent, mapWardrobeComponentToPose, wardrobePosePadding } from '../src/shared/wardrobePose.ts'
import { wardrobeAdjustmentMatrix } from '../src/shared/wardrobeAdjustment.ts'
import { toggleWardrobeVisibility } from '../src/shared/wardrobePlacementModel.ts'

const sourceBone=(id,name,x,y,rotation=0)=>({
  id,name,x:100,y:70,width:45,height:100,rotation:18,
  sourceTransform:{x,y,width:45,height:100,rotation},
  dataUrl:'data:image/png;base64,AA=='
})
const sources=[
  sourceBone('thigh-l','Coxa esquerda',17,25),
  sourceBone('thigh-r','Coxa direita',77,25),
  sourceBone('calf-l','Canela esquerda',17,140),
  sourceBone('calf-r','Canela direita',77,140)
]
const poses=sources.map((part,index)=>({...part,
  x:95+index*25,y:220+index*15,width:65+(index%2)*10,height:88+index*9,rotation:index%2?47:-31
}))
const categoryFor=id=>id.startsWith('thigh')?'calca-coxa':'calca-canela'
const pieces=sources.map((part,index)=>{
  const original=part.sourceTransform
  // These thigh covers intentionally END above the knees, exposing skin.
  const isThigh=part.id.startsWith('thigh')
  const garment={
    id:'pants-'+part.id,name:'Calça '+part.name,category:categoryFor(part.id),
    attachedPartId:part.id,x:original.x-2,y:original.y+(isThigh?-8:3),
    width:50,height:isThigh?74:99,rotation:part.id.endsWith('l')?5:-7,
    dataUrl:'data:image/png;base64,AA=='
  }
  return {...garment,binding:bindWardrobeComponent(garment,part)}
})
const groups=pieces.map((component,index)=>({
  modelSlot:1,setId:'pants',category:'calca',componentId:component.id,
  offsetX:index*2-3,offsetY:index-1,scaleX:1.16,scaleY:.86,rotation:12,
  hidden:false
}))
const pointAfterTransforms=(component,group,reference,pose)=>{
  const {kneeOverlap,edgePadding}=wardrobePosePadding(component,reference)
  const projected=mapWardrobeComponentToPose(component,sources.find(p=>p.id===component.attachedPartId),
    pose,kneeOverlap,edgePadding)
  const boneMatrix=projected.matrix.slice(7,-1).split(',').map(Number)
  const pivot=projected.origin
  const user=wardrobeAdjustmentMatrix(group,pose,pivot)
  const radians=projected.localRotation*Math.PI/180
  const local={x:projected.localLeft+projected.renderWidth/2,
    y:projected.localTop+projected.renderHeight/2}
  const boxCorner={x:projected.renderWidth/2,y:projected.renderHeight/2}
  const box={x:local.x+boxCorner.x*Math.cos(radians)-boxCorner.y*Math.sin(radians),
    y:local.y+boxCorner.x*Math.sin(radians)+boxCorner.y*Math.cos(radians)}
  const body={x:pivot.x+boneMatrix[0]*box.x+boneMatrix[2]*box.y,
    y:pivot.y+boneMatrix[1]*box.x+boneMatrix[3]*box.y}
  return {x:Number((user[0]*body.x+user[2]*body.y+user[4]).toFixed(6)),
    y:Number((user[1]*body.x+user[3]*body.y+user[5]).toFixed(6)),
    width:Number((projected.renderWidth*projected.scaleX).toFixed(6)),
    height:Number((projected.renderHeight*projected.scaleY).toFixed(6)),
    angle:projected.localRotation}
}
function visiblePositions(wardrobeGroups){
  const active=wardrobeGroups.filter(group=>!group.hidden)
  const reference=pieces.filter(component=>active.some(group=>group.componentId===component.id))
  return new Map(active.map(group=>{
    const component=pieces.find(piece=>piece.id===group.componentId)
    const target=poses.find(p=>p.id===component.attachedPartId)
    return [component.id,pointAfterTransforms(component,group,reference,target)]
  }))
}

test('calça superior/inferior direita/esquerda: 16 combinações de ocultar e restaurar não movem outra peça',()=>{
  const snapshot=structuredClone({pieces,groups,poses,sources})
  const baseline=visiblePositions(groups)
  assert.equal(baseline.size,4)
  for(let mask=0;mask<16;mask++){
    const changed=groups.map((group,index)=>({ ...group,hidden:!!(mask&(1<<index)) }))
    const calculated=visiblePositions(changed)
    for(const [id,location] of calculated){
      assert.deepEqual(location,baseline.get(id),`Membro ${id} mudou de lugar ao ocultar outras peças: máscara ${mask}`)
    }
  }
  const noCalves=groups.map(group=>({...group,hidden:group.componentId.includes('calf')}))
  const restored=noCalves.map(group=>group.hidden?toggleWardrobeVisibility(group):group)
  assert.deepEqual(visiblePositions(restored),baseline,'Restaurar não mexe nos encaixes.')
  assert.deepEqual({pieces,groups,poses,sources},snapshot,'Composição não grava ou sobrescreve roupa/pose original')
})

test('não deve expandir joelho, manga ou acessório em função das peças vizinhas equipadas',()=>{
  for(const component of [
    ...pieces,
    {...pieces[0],id:'sleeve',category:'manga-superior'},
    {...pieces[1],id:'lower-sleeve',category:'manga-inferior'},
    {...pieces[2],id:'glasses',category:'oculos'},
    {...pieces[3],id:'jacket',category:'jaqueta'}
  ]){
    for(const wardrobe of [[],[component],pieces,[component,...pieces],pieces.slice(0,2)]){
      assert.deepEqual(wardrobePosePadding(component,wardrobe),{kneeOverlap:0,edgePadding:0},
        `${component.category}: não cresce para cobrir costura automaticamente`)
    }
  }
})

test('joelhos descobertos no original continuam descobertos após projetar só ou com a calça completa',()=>{
  for(const thigh of pieces.filter(piece=>piece.category==='calca-coxa')){
    const target=poses.find(p=>p.id===thigh.attachedPartId)
    const source=sources.find(p=>p.id===thigh.attachedPartId)
    const lone=mapWardrobeComponentToPose(thigh,source,target)
    const entire=wardrobePosePadding(thigh,pieces)
    const full=mapWardrobeComponentToPose(thigh,source,target,entire.kneeOverlap,entire.edgePadding)
    assert.deepEqual(full,lone)
    assert.ok(thigh.height<source.sourceTransform.height,'coxa foi editada para expor parte do joelho')
  }
})

test('renderizador deve usar um pivô por peça, nunca o centro médio do grupo visível',async()=>{
  const renderer=await readFile('src/renderer/src/characters/characterWardrobeRenderer.ts','utf8')
  const editor=await readFile('src/renderer/src/features/fabricator/wardrobe/WardrobeWorkspace.tsx','utf8')
  const preview=await readFile('src/renderer/src/features/fabricator/wardrobe/WardrobeComparisonPreview.tsx','utf8')
  assert.match(renderer,/center: transform\.origin/)
  assert.match(renderer,/layer\.push\(\{ group, \.\.\.item \}\)/)
  assert.doesNotMatch(renderer,/mapped\.reduce\(\(sum, item\)/)
  assert.match(renderer,/wardrobePosePadding\(component,/)
  assert.match(editor,/wardrobePosePadding\(component,\s*draft\?\.components\s*\?\?\s*\[\]\)/)
  assert.match(preview,/wardrobePosePadding\(piece,outfit\.components\)/)
})

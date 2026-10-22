import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { snapWardrobePlacement } from '../src/shared/wardrobeMagnet.ts'
import { fixWardrobeGlue, releaseWardrobeGlue } from '../src/shared/wardrobeGlue.ts'
import { inspectWardrobePose } from '../src/shared/wardrobePoseAudit.ts'

const sourceBone={id:'right-low-arm',name:'Braço inferior direito',
  x:125,y:50,width:43,height:85,rotation:45,
  sourceTransform:{x:250,y:70,width:43,height:85,rotation:0},dataUrl:'data:image/png;base64,AA=='}
const leftBone={...sourceBone,id:'left-low-arm',name:'Braço inferior esquerdo',sourceTransform:{...sourceBone.sourceTransform,x:15}}
const shirt={id:'sleeve-r',name:'Manga inferior direita',category:'manga-inferior',attachedPartId:sourceBone.id,
  x:252,y:72,width:39,height:78,rotation:0,dataUrl:'data:image/png;base64,AA==',
  glue:{version:1,mode:'loose'}}
const model={slot:1,name:'Modelo teste',updatedAt:'2026-10-22T10:00:00Z',parts:[sourceBone,leftBone],layerOrder:[],joints:[]}
const pose={slot:1,name:'Pose 01',sourceModelSlot:1,sourceModelUpdatedAt:model.updatedAt,
  parts:[{...sourceBone,x:120,y:84,width:50,height:110,rotation:-40},{...leftBone,x:90,y:90,rotation:70}],layerOrder:[],joints:[]}

test('ímã aproxima bordas X e Y sem criar binding ou movimentar o corpo',()=>{
  const garment={...shirt,x:254,y:73}
  const original=structuredClone(garment),body=structuredClone(sourceBone)
  const snap=snapWardrobePlacement(garment,sourceBone,12)
  assert.ok(snap)
  assert.equal(snap.targetId,'right-low-arm')
  assert.equal(snap.snappedX,true)
  assert.equal(snap.snappedY,true)
  assert.equal(snap.x,250)
  assert.equal(snap.y,70)
  assert.deepEqual(garment,original)
  assert.deepEqual(sourceBone,body)
  assert.equal(garment.glue.mode,'loose')
})

test('ímã fica inativo fora do raio e suporta limites sem NaN',()=>{
  assert.equal(snapWardrobePlacement({...shirt,x:900,y:850},sourceBone),null)
  assert.equal(snapWardrobePlacement({...shirt,x:NaN},sourceBone),null)
  assert.equal(snapWardrobePlacement(shirt,undefined),null)
  assert.equal(snapWardrobePlacement(shirt,sourceBone,-8),null)
})

test('auditoria de todas as poses usa transformação, não publica aprovação visual',()=>{
  const fixed=fixWardrobeGlue(shirt,sourceBone)
  const set={id:'outfit',modelSlot:1,components:[fixed]}
  const result=inspectWardrobePose(model,set,pose)
  assert.equal(result.status,'ok')
  assert.equal(result.checkedComponents,1)
  assert.deepEqual(result.warnings,[])
  const different={...pose,slot:2,name:'Pose 02',parts:[...pose.parts.filter(p=>p.id!==sourceBone.id)]}
  const incomplete=inspectWardrobePose(model,set,different)
  assert.equal(incomplete.status,'incompatible')
  assert.match(incomplete.warnings.join(' '),/não encontrada/)
  const revised=inspectWardrobePose(model,set,{...pose,sourceModelUpdatedAt:'older'})
  assert.equal(revised.status,'attention')
  assert.match(revised.warnings.join(' '),/outra revisão/)
  const notFixed=inspectWardrobePose(model,{...set,components:[releaseWardrobeGlue(fixed)]},pose)
  assert.equal(notFixed.status,'incompatible')
})

test('auditoria avisa escalas muito grandes e detecta refixação pendente',()=>{
  const fixed=fixWardrobeGlue(shirt,sourceBone)
  const largePose={...pose,slot:3,parts:pose.parts.map(p=>p.id===sourceBone.id?{...p,width:250,height:430}:p)}
  const alert=inspectWardrobePose(model,{components:[fixed]},largePose)
  assert.equal(alert.status,'attention')
  assert.match(alert.warnings.join(' '),/redimensiona/)
  const updatedModel={...model,parts:[{...sourceBone,sourceTransform:{...sourceBone.sourceTransform,x:275}},leftBone]}
  const stale=inspectWardrobePose(updatedModel,{components:[fixed]},pose)
  assert.equal(stale.status,'attention')
  assert.match(stale.warnings.join(' '),/revisão da origem/)
})

test('Roupas DEV mantém fixação explícita, ímã opt-in e auditoria não destrutiva',async()=>{
  const editor=await readFile('src/renderer/src/features/fabricator/wardrobe/WardrobeWorkspace.tsx','utf8')
  const hook=await readFile('src/renderer/src/features/fabricator/wardrobe/useWardrobePoseAudit.ts','utf8')
  assert.match(editor,/const \[magneticSnap, setMagneticSnap\] = useState\(true\)/)
  assert.match(editor,/snapWardrobePlacement\(/)
  assert.match(editor,/component\.glue\?\.mode === 'loose'/)
  assert.match(editor,/WardrobePoseAuditPanel/)
  assert.match(hook,/window\.desktop\.listFabricatorPoseSlots/)
  assert.match(hook,/window\.desktop\.loadFabricatorPose/)
  assert.doesNotMatch(hook,/saveFabricator|saveWardrobe|deleteWardrobe/)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { bindWardrobeComponent, mapWardrobeComponentToPose, poseDeltaToSource } from '../src/shared/wardrobePose.ts'

const sourceBone = {
  id:'arm-left', name:'Braço esquerdo', x:100,y:70,width:50,height:80,rotation:0,
  sourceTransform:{x:12,y:25,width:40,height:70,rotation:0},
  dataUrl:'data:image/png;base64,AA=='
}
const piece = {
  id:'sleeve-left', name:'Manga esquerda',category:'manga-superior',attachedPartId:'arm-left',
  x:6,y:42,width:36,height:60,rotation:0, dataUrl:'data:image/png;base64,AA=='
}
const point = (mapped, x = 0, y = 0) => {
  const [a,b,c,d] = mapped.matrix.slice(7,-1).split(',').map(Number)
  const angle = mapped.localRotation * Math.PI / 180
  const localX = mapped.localLeft + mapped.renderWidth/2 + x*Math.cos(angle) - y*Math.sin(angle)
  const localY = mapped.localTop + mapped.renderHeight/2 + x*Math.sin(angle) + y*Math.cos(angle)
  return {x:mapped.origin.x + a*localX + c*localY,y:mapped.origin.y + b*localX + d*localY}
}
const center = mapped => point(mapped)
const near = (actual, expected, message) => assert.ok(Math.abs(actual-expected)<1e-5, message ?? `expected ${actual} ≈ ${expected}`)

test('Fabricador → Customizador: X e Y individuais sobrevivem com binding coerente',()=>{
  const fitted={...piece,binding:bindWardrobeComponent(piece,sourceBone)}
  const pose={...sourceBone,x:12,y:25,width:40,height:70}
  const result=mapWardrobeComponentToPose(fitted,sourceBone,pose)
  assert.deepEqual(center(result),{x:24,y:72})
  assert.equal(result.renderWidth,36)
  assert.equal(result.renderHeight,60)
})
test('REGRESSÃO: ajustar manga X e Y com binding antigo não restaura posição anterior',()=>{
  const stale={...piece,x:piece.x+23,y:piece.y-15,binding:bindWardrobeComponent(piece,sourceBone)}
  const target={...sourceBone,x:12,y:25,width:40,height:70}
  const output=mapWardrobeComponentToPose(stale,sourceBone,target)
  assert.deepEqual(center(output),{x:47,y:57})
  assert.equal(stale.binding.localCenterX, bindWardrobeComponent(piece,sourceBone).localCenterX,'não modifica fonte')
})
test('offsets do Fabricador passam para pose montada com escala não uniforme',()=>{
 const stale={...piece,x:piece.x+12,y:piece.y+14,binding:bindWardrobeComponent(piece,sourceBone)}
 const posed={...sourceBone,x:140,y:80,width:80,height:140,rotation:0}
 const output=mapWardrobeComponentToPose(stale,sourceBone,posed)
 assert.deepEqual(center(output),{x:140 + 80/2 + (6+12+36/2-(12+40/2))*2,
   y:80+140/2+(42+14+60/2-(25+70/2))*2})
 assert.equal(output.renderWidth*output.scaleX,72)
 assert.equal(output.renderHeight*output.scaleY,120)
})
test('face, roupa e pose usam serviços compartilhados sem importar páginas de outras áreas',async()=>{
 const {readFile}=await import('node:fs/promises')
 const [mapping,renderer,customizer,studio]=await Promise.all([
  readFile('src/shared/wardrobePose.ts','utf8'),
  readFile('src/renderer/src/characters/characterRenderer.ts','utf8'),
  readFile('src/renderer/src/features/customizer/CustomizerPage.tsx','utf8'),
  readFile('src/renderer/src/features/studio/StudioPage.tsx','utf8')
 ])
 assert.match(mapping,/const current = bindWardrobeComponent\(component, sourceBone\)/)
 assert.match(renderer,/mapWardrobeComponentToPose\(component, sourceBone, targetBone/)
 assert.match(customizer,/renderWardrobeOverlay\(/)
 assert.match(studio,/import\('\.\.\/\.\.\/characters\/characterRenderer'\)/)
 assert.doesNotMatch(renderer,/CustomizerPage|FabricatorPage/)
})

test('escala horizontal e vertical divergentes no Fabricador não reverte ao tamanho do PNG original',()=>{
 const authored={...piece,x:piece.x+8,y:piece.y+17,width:46,height:89,
  originWidth:36,originHeight:60,binding:bindWardrobeComponent(piece,sourceBone)}
 const original={...sourceBone,x:12,y:25,width:40,height:70,rotation:0}
 const result=mapWardrobeComponentToPose(authored,sourceBone,original)
 assert.equal(result.renderWidth,46)
 assert.equal(result.renderHeight,89)
 assert.deepEqual(center(result),{x:6+8+46/2,y:42+17+89/2})
 assert.equal(authored.binding.widthRatio,36/40,'binding antigo não deve ser alterado')
})
test('escala XY atualizada e binding válido preserva a largura e altura no pose rig',()=>{
 const authored={...piece,width:44,height:73,originWidth:36,originHeight:60}
 authored.binding=bindWardrobeComponent(authored,sourceBone)
 const pose={...sourceBone,x:100,y:40,width:80,height:140,rotation:0}
 const output=mapWardrobeComponentToPose(authored,sourceBone,pose)
 assert.equal(output.renderWidth*output.scaleX,88)
 assert.equal(output.renderHeight*output.scaleY,146)
})

test('Roupas DEV no original desmontado e Customizador na montagem/pose compartilham transformação afim',()=>{
  const original = {...sourceBone, sourceTransform:{x:12,y:25,width:40,height:70,rotation:17}}
  const shirt = {...piece,x:19,y:48,width:31,height:43,rotation:41}
  const sourceCopy = structuredClone(original)
  const pieceCopy = structuredClone(shirt)
  const bound = {...shirt,binding:bindWardrobeComponent(shirt,original)}
  const poses = [
    {...sourceBone,x:100,y:90,width:75,height:112,rotation:-47},
    {...sourceBone,x:170,y:120,width:44,height:140,rotation:86}
  ]
  for(const pose of poses){
    const result = mapWardrobeComponentToPose(bound,original,pose)
    const raw = mapWardrobeComponentToPose(shirt,original,pose)
    // Missing binding, coherent binding and the Customizador path must agree.
    for(const [x,y] of [[0,0],[-shirt.width/2,-shirt.height/2],[shirt.width/2,shirt.height/2]]){
      const actual=point(result,x,y), unbound=point(raw,x,y)
      near(actual.x,unbound.x);near(actual.y,unbound.y)
      // Independent reference calculation: inverse rotation from the edited
      // original sheet, pose-axis stretch, then target rotation.
      const deg=Math.PI/180
      const frame=original.sourceTransform
      const dx=shirt.x+shirt.width/2-(frame.x+frame.width/2)
      const dy=shirt.y+shirt.height/2-(frame.y+frame.height/2)
      const sourceLocalX=dx*Math.cos(-frame.rotation*deg)-dy*Math.sin(-frame.rotation*deg)
      const sourceLocalY=dx*Math.sin(-frame.rotation*deg)+dy*Math.cos(-frame.rotation*deg)
      const garmentAngle=(shirt.rotation-frame.rotation)*deg
      const localX=sourceLocalX+x*Math.cos(garmentAngle)-y*Math.sin(garmentAngle)
      const localY=sourceLocalY+x*Math.sin(garmentAngle)+y*Math.cos(garmentAngle)
      const sx=pose.width/frame.width,sy=pose.height/frame.height
      const expectedX=pose.x+pose.width/2+Math.cos(pose.rotation*deg)*sx*localX-Math.sin(pose.rotation*deg)*sy*localY
      const expectedY=pose.y+pose.height/2+Math.sin(pose.rotation*deg)*sx*localX+Math.cos(pose.rotation*deg)*sy*localY
      near(actual.x,expectedX);near(actual.y,expectedY)
    }
  }
  assert.deepEqual(original,sourceCopy,'montagem e PNG original não são mutados')
  assert.deepEqual(shirt,pieceCopy,'encaixes editados não são sobrescritos')
})

test('binding obsoleto e ausência de binding preservam offsets ao girar e escalar ossos',()=>{
  const moved={...piece,x:piece.x+19,y:piece.y-6,width:51,height:75,rotation:27}
  const stale={...moved,binding:bindWardrobeComponent(piece,sourceBone)}
  const posed={...sourceBone,x:90,y:40,width:90,height:90,rotation:38}
  const expected=mapWardrobeComponentToPose(moved,sourceBone,posed)
  const observed=mapWardrobeComponentToPose(stale,sourceBone,posed)
  for(const [x,y] of [[0,0],[-25,-15],[25,15]]){
    near(point(expected,x,y).x,point(observed,x,y).x)
    near(point(expected,x,y).y,point(observed,x,y).y)
  }
  assert.equal(stale.binding.widthRatio,piece.width/sourceBone.sourceTransform.width)
})

test('largura/altura extra para costuras permanece medida em pixels da pose',()=>{
  const bound={...piece,binding:bindWardrobeComponent(piece,sourceBone)}
  const posed={...sourceBone,x:40,y:60,width:80,height:210,rotation:90}
  const projected=mapWardrobeComponentToPose(bound,sourceBone,posed,18,9)
  near(projected.renderWidth*projected.scaleX,piece.width*2+18)
  near(projected.renderHeight*projected.scaleY,piece.height*3+18+18)
})

test('arraste na prévia da pose volta ao espaço da folha original sem trocar os eixos',()=>{
  const source={...sourceBone,sourceTransform:{...sourceBone.sourceTransform,rotation:22}}
  const pose={...sourceBone,x:300,y:150,width:100,height:105,rotation:-58}
  const drag={x:14,y:-8}
  const local=poseDeltaToSource(drag,source,pose)
  const transformed=mapWardrobeComponentToPose({...piece,x:piece.x+local.x,y:piece.y+local.y},source,pose)
  const base=mapWardrobeComponentToPose(piece,source,pose)
  near(center(transformed).x-center(base).x,drag.x)
  near(center(transformed).y-center(base).y,drag.y)
})

test('teste de pose não mascara membros ausentes com PNG na folha original',async()=>{
  const {readFile}=await import('node:fs/promises')
  const editor=await readFile('src/renderer/src/features/fabricator/wardrobe/WardrobeWorkspace.tsx','utf8')
  assert.match(editor,/const poseMissingAttachments = testPose && draft/)
  assert.match(editor,/if \(!poseTransform\) return null/)
  assert.match(editor,/Esta pose não contém a parte corporal/)
  assert.match(editor,/poseUsesOlderModel/)
})

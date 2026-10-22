import test from 'node:test'
import assert from 'node:assert/strict'
import { bindWardrobeComponent, mapWardrobeComponentToPose } from '../src/shared/wardrobePose.ts'

const sourceBone = {
  id:'arm-left', name:'Braço esquerdo', x:100,y:70,width:50,height:80,rotation:0,
  sourceTransform:{x:12,y:25,width:40,height:70,rotation:0},
  dataUrl:'data:image/png;base64,AA=='
}
const piece = {
  id:'sleeve-left', name:'Manga esquerda',category:'manga-superior',attachedPartId:'arm-left',
  x:6,y:42,width:36,height:60,rotation:0, dataUrl:'data:image/png;base64,AA=='
}
const center = mapped => ({
  x:mapped.origin.x + mapped.localLeft + mapped.renderWidth/2,
  y:mapped.origin.y + mapped.localTop + mapped.renderHeight/2
})
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
 assert.equal(output.renderWidth,72)
 assert.equal(output.renderHeight,120)
})
test('face, roupa e pose são resolvidos sem importar páginas Customizador ou Fabricador',async()=>{
 const {readFile}=await import('node:fs/promises')
 const [mapping,renderer,customizer,video]=await Promise.all([
  readFile('src/shared/wardrobePose.ts','utf8'),
  readFile('src/renderer/src/characters/characterRenderer.ts','utf8'),
  readFile('src/renderer/src/features/customizer/CustomizerPage.tsx','utf8'),
  readFile('src/renderer/src/features/videoStudio/transitionRenderer.ts','utf8')
 ])
 assert.match(mapping,/const current = bindWardrobeComponent\(component, sourceBone\)/)
 assert.match(renderer,/mapWardrobeComponentToPose\(component, sourceBone, targetBone/)
 assert.match(customizer,/renderWardrobeOverlay\(/)
 assert.match(video,/prepareSavedCharacterRenderer/)
})

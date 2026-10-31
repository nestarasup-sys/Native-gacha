import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { faceRenderGeometry, fitElementToTrim } from '../src/renderer/src/characters/characterGeometry.ts'

test('recorte de personagem preserva proporções dos Studios, incluindo rotação e flip',()=>{
 const crop={dataUrl:'data:image/png;base64,',left:20,top:12,width:80,height:95,sourceWidth:120,sourceHeight:140}
 for(const rotation of [0,45,90,180]){
  for(const flipX of [false,true]){
   const original={kind:'character',x:20,y:30,width:35,height:55,rotation,flipX}
   const updated=fitElementToTrim(original,crop)
   assert.equal(updated.width,original.width*crop.width/crop.sourceWidth)
   assert.equal(updated.height,original.height*crop.height/crop.sourceHeight)
   assert.equal(original.x,20,'não altera elemento original')
   assert.ok(Number.isFinite(updated.x) && Number.isFinite(updated.y))
   assert.ok(updated.x !== original.x || updated.y !== original.y, 'recorte desloca ao menos um eixo')
  }
 }
})
test('geometria de rosto idêntica para elementos em 16:9',()=>{
 const element={width:25,characterCanvasWidth:40}
 const result=faceRenderGeometry(element,{width:400,height:600},{width:280,height:480},1920,1080)
 assert.equal(result.characterCanvasWidth,40)
 assert.equal(result.width,28)
 assert.equal(result.height,40*1920/1080*480/400)
})
test('troca de recorte facial mantém a mesma posição física do corpo',()=>{
 const element={x:12,y:-4,width:20,height:30,rotation:90,flipX:true,characterCanvasWidth:40,characterScale:125,characterWidthScale:80,characterHeightScale:120}
 const rendered={width:400,height:600}
 const previous={dataUrl:'',left:100,top:120,width:200,height:300,sourceWidth:400,sourceHeight:600}
 const next={dataUrl:'',left:140,top:160,width:180,height:280,sourceWidth:400,sourceHeight:600}
 const updated=faceRenderGeometry(element,rendered,next,1920,1080,previous)
 const landmark={x:190,y:300}
 const position=(center,crop)=>{
  const scaleX=element.characterCanvasWidth*(element.characterScale/100)*(element.characterWidthScale/100)/rendered.width
  const scaleY=element.characterCanvasWidth*(1920/1080)*(element.characterScale/100)*(element.characterHeightScale/100)/rendered.width
  let dx=(landmark.x-(crop.left+crop.width/2))*scaleX*(element.flipX?-1:1)*19.2
  let dy=(landmark.y-(crop.top+crop.height/2))*scaleY*10.8
  const radians=element.rotation*Math.PI/180
  const px=(50+center.x)*19.2+dx*Math.cos(radians)-dy*Math.sin(radians)
  const py=(50+center.y)*10.8+dx*Math.sin(radians)+dy*Math.cos(radians)
  return {x:px,y:py}
 }
 const before=position(element,previous),after=position({x:updated.x??element.x,y:updated.y??element.y},next)
 assert.ok(Math.abs(before.x-after.x)<1e-9 && Math.abs(before.y-after.y)<1e-9,`o recorte deslocou o corpo em ${before.x-after.x}px × ${before.y-after.y}px`)
})
test('geometria compartilhada permanece finita quando o palco ainda não tem altura',()=>{
 const result=faceRenderGeometry({width:25,characterCanvasWidth:40},{width:400,height:600},{width:280,height:480},1920,0)
 assert.deepEqual(result,{characterCanvasWidth:40,width:28,height:40*1920*480/400})
})
test('Studio e Editor V6 usam a geometria compartilhada, sem cópias locais independentes',async()=>{
 const [studio,editorV6]=await Promise.all([
  readFile('src/renderer/src/features/studio/StudioPage.tsx','utf8'),
  readFile('src/renderer/src/features/editorV6/EditorV6Page.tsx','utf8')
 ])
 assert.match(studio,/from '\.\.\/\.\.\/characters\/characterGeometry'/)
 assert.match(editorV6,/from '\.\.\/\.\.\/characters\/characterGeometry'/)
 assert.doesNotMatch(studio,/function trimTransparentImage\(/)
 assert.doesNotMatch(editorV6,/function fitElementToTrim\(/)
})
test('troca de pose e atualização de fonte usam a mesma geometria em Studio e Editor V6',async()=>{
 const [studio,editorV6,studioRefresh,editorRefresh]=await Promise.all([
  readFile('src/renderer/src/features/studio/StudioPage.tsx','utf8'),
  readFile('src/renderer/src/features/editorV6/EditorV6Page.tsx','utf8'),
  readFile('src/renderer/src/features/studio/useStudioCharacterSourceRefresh.ts','utf8'),
  readFile('src/renderer/src/features/editorV6/characterSnapshotRefresh.ts','utf8')
 ])
 assert.match(studio,/faceRenderGeometry\(\{ \.\.\.selectedElement, characterCanvasWidth \}, rendered, trimmed/)
 assert.match(editorV6,/faceRenderGeometry\(\{ \.\.\.selectedElement, characterCanvasWidth \}, rendered, baked\.crop/)
 assert.match(studioRefresh,/faceRenderGeometry\(element, rendered, crop, stageWidth, stageHeight\)/)
 assert.match(editorRefresh,/faceRenderGeometry\(target\.state, rendered, crop, stageWidth, stageHeight, poseReferenceCrops\.get\(poseKey\)\)/)
 assert.doesNotMatch(studio,/fullCanvasHeight/)
 assert.doesNotMatch(editorV6,/fullCanvasHeight/)
 assert.doesNotMatch(studioRefresh,/characterCanvasWidth \* stageWidth \/ stageHeight/)
})

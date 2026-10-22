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
   assert.notEqual(updated.x,original.x)
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
test('os dois Studios compartilham crop e geometry, sem cópias locais independentes',async()=>{
 const [studio,video]=await Promise.all([
  readFile('src/renderer/src/features/studio/StudioPage.tsx','utf8'),
  readFile('src/renderer/src/features/videoStudio/VideoStudioEditor.tsx','utf8')
 ])
 assert.match(studio,/from '\.\.\/\.\.\/characters\/characterGeometry'/)
 assert.match(video,/fitElementToTrim/)
 assert.doesNotMatch(studio,/function trimTransparentImage\(/)
 assert.doesNotMatch(video,/function fitElementToTrim\(/)
})

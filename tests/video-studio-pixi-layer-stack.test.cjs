'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const compiled = ts.transpile(fs.readFileSync(path.join(__dirname,
  '../src/renderer/src/features/videoStudio/pixiGachaLayerStack.ts'), 'utf8'),
  { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 })
const moduleObj = { exports: {} }
new Function('module','exports',compiled)(moduleObj,moduleObj.exports)
const { PixiGachaLayerStack } = moduleObj.exports

function harness() {
  const uploads = new Map()
  let destroyed = false
  const pixi = {
    Texture: { from(canvas) {
      if (!uploads.has(canvas)) uploads.set(canvas, { count: 0, texture: { source: { update() { uploads.get(canvas).count++ } } } })
      return uploads.get(canvas).texture
    }},
    Sprite: class { constructor(texture) { this.texture = texture } },
    Container: class {
      children = []
      scale = { set: (x,y) => { this.scaleX=x;this.scaleY=y } }
      addChild(sprite) { this.children.push(sprite) }
      destroy() { destroyed = true }
    },
  }
  return { stack: new PixiGachaLayerStack(pixi), uploads, isDestroyed: () => destroyed }
}
const canvas = name => ({ name, width: 100, height: 200 })
const frame = (behind, face, upper, scales = [1,1]) =>
  ({ behindFace:behind, face, inFrontOfFace:upper, width:100,height:200,
    outputWidth: Math.max(100,100*scales[0]), outputHeight:Math.max(200,200*scales[1]),
    shapeScaleX:scales[0],shapeScaleY:scales[1] })

test('three real Gacha layers keep order and upload ONLY mutable face after every frame', () => {
  const { stack, uploads } = harness()
  const lower=canvas('body + hair behind + wardrobe')
  const face=canvas('animated eyes + pupils + mouth + blush')
  const upper=canvas('front hair + accessories')
  for(let n=0;n<15;n++)stack.setLayers(frame(lower,face,upper))
  assert.deepEqual(stack.stage.children.map(s => [...uploads].find(([,v]) => v.texture===s.texture)[0].name),
    [lower.name,face.name,upper.name])
  assert.equal(uploads.size,3)
  assert.equal(uploads.get(lower).count,0,'no body/wardrobe GPU texture reuploads')
  assert.equal(uploads.get(upper).count,0,'no front hair GPU texture reuploads')
  assert.equal(uploads.get(face).count,14,'only the mutable face source is refreshed')
  assert.equal(stack.metrics().createdSprites,3)
  assert.equal(stack.metrics().reusedSpriteFrames,14)
  assert.equal(stack.metrics().uploadedFaceFrames,14)
  assert.equal(stack.metrics().replacedStaticSources,0)
  stack.dispose()
})

test('same GPU sprites survive a fresh facial canvas and changed authored wardrobe sources', () => {
  const { stack, uploads } = harness()
  const a=canvas('body'), f=canvas('face1'), b=canvas('body2'), next=canvas('face2'), upper=canvas('front')
  stack.setLayers(frame(a,f,upper))
  const sprites=stack.stage.children.slice()
  stack.setLayers(frame(b,next,upper))
  assert.equal(stack.metrics().createdSprites,3)
  assert.equal(stack.metrics().replacedStaticSources,1)
  assert.deepEqual(stack.stage.children,sprites)
  assert.equal(uploads.size,5)
  stack.dispose()
})

test('upper hair can hide/reappear without moving underneath the face', () => {
  const { stack }=harness()
  const lower=canvas('body'),face=canvas('face'),upper=canvas('front')
  stack.setLayers(frame(lower,face,upper))
  stack.setLayers(frame(lower,face,null))
  assert.equal(stack.stage.children.length,3)
  assert.equal(stack.stage.children[2].visible,false)
  stack.setLayers(frame(lower,face,upper))
  assert.equal(stack.stage.children[2].visible,true)
  assert.equal(stack.metrics().createdSprites,3)
  assert.equal(stack.metrics().removedUpperFrames,1)
  stack.dispose()
})

test('shape-scaling honors Canvas geometry, including oversized horizontal proportions', () => {
  const { stack }=harness()
  const lower=canvas('body'), face=canvas('face')
  stack.setLayers(frame(lower,face,null,[1.35,1.2]))
  assert.equal(stack.stage.scaleX,1.35)
  assert.equal(stack.stage.scaleY,1.2)
  assert.equal(stack.stage.x,0)
  assert.equal(stack.stage.y,0)
  stack.dispose()
})

test('bad layer geometry, resizing or render-after-dispose fail instead of corrupting GPU pixels', () => {
  const { stack, isDestroyed }=harness()
  const lower=canvas('body'),face=canvas('face')
  assert.throws(()=>stack.setLayers({...frame(lower,face,null),height:120}),/idênticas/)
  stack.setLayers(frame(lower,face,null))
  const bad={...frame(lower,face,null),width:120,behindFace:{...lower,width:120},face:{...face,width:120},outputWidth:120}
  assert.throws(()=>stack.setLayers(bad),/nova superfície/)
  stack.dispose()
  assert.equal(isDestroyed(),true)
  assert.throws(()=>stack.setLayers(frame(lower,face,null)),/descartadas/)
})

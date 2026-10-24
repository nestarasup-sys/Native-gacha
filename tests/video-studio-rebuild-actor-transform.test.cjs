'use strict'
const test=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const path=require('node:path')
const ts=require('typescript')
const source=fs.readFileSync(path.join(__dirname,'../src/shared/videoStudioRebuild/actorTransformEditor.ts'),'utf8')
const js=ts.transpile(source,{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022})
const mod={exports:{}}
new Function('module','exports','require',js)(mod,mod.exports,key=>{
  if(key==='../videoCharacterTimeline')return {videoCharacterStateAt:timeline=>timeline.characterBases?.actor}
  throw Error('Unexpected '+key)
})
const {setActorStageTransform}=mod.exports
const actor={id:'actor',kind:'character',text:'',x:5,y:3,width:25,height:55,rotation:0,zIndex:2,flipX:false}
const face={element:{...actor,activeFaceMode:'blink',faceAppearance:{eyeLeftCatalogId:'pt-eye'},
    faceTransforms:{'expression-component:pupil-left':{x:-9,y:1,width:10,height:9,rotation:0}}},
  imageDataUrl:'data:image/png;base64,KEEP_ORIGINAL'}
const original=()=>({schemaVersion:1,id:'v1',updatedAt:'old',elements:[actor],
  assets:[{id:'data',dataUrl:'data:image/png;base64,KEEP_ASSET'}],
  videoTimeline:{schemaVersion:1,frameRate:60,durationFrames:600,characterBases:{actor:face},
    characterKeys:[],textClips:[],saveMarkers:[]}})
test('actor stage editor updates absolute transform only, preserving PT data and undo references',()=>{
  const doc=original()
  const next=setActorStageTransform(doc,'actor',{x:20,rotation:45,characterScale:150,flipX:true},'new')
  assert.notEqual(next,doc)
  assert.equal(next.updatedAt,'new')
  assert.equal(next.videoTimeline.characterTransforms.actor.x,20)
  assert.equal(next.videoTimeline.characterTransforms.actor.characterScale,150)
  assert.equal(next.elements[0].x,20)
  assert.equal(next.elements[0].flipX,true)
  assert.strictEqual(next.videoTimeline.characterBases.actor,face)
  assert.strictEqual(next.videoTimeline.characterKeys,doc.videoTimeline.characterKeys)
  assert.strictEqual(next.assets,doc.assets)
  assert.equal(doc.elements[0].x,5)
  assert.strictEqual(setActorStageTransform(next,'actor',{x:20},'new2'),next)
})
test('actor stage rejects locked, missing, invalid and out-of-range edits',()=>{
  const doc=original()
  assert.strictEqual(setActorStageTransform(doc,'unknown',{x:5},'new'),doc)
  assert.strictEqual(setActorStageTransform(doc,'actor',{x:101},'new'),doc)
  assert.strictEqual(setActorStageTransform(doc,'actor',{rotation:Infinity},'new'),doc)
  assert.strictEqual(setActorStageTransform(doc,'actor',{characterScale:0},'new'),doc)
  assert.strictEqual(setActorStageTransform(doc,'actor',{flipX:'no'},'new'),doc)
  assert.strictEqual(setActorStageTransform(doc,'actor',{zIndex:999},'new'),doc)
  const locked={...doc,videoTimeline:{...doc.videoTimeline,trackSettings:{actor:{locked:true}}}}
  assert.strictEqual(setActorStageTransform(locked,'actor',{x:20},'new'),locked)
})

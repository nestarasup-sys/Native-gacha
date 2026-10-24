'use strict'
const test=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const path=require('node:path')
const ts=require('typescript')
const load=(name,deps={})=>{
  const js=ts.transpile(fs.readFileSync(path.resolve(__dirname,name),'utf8'),{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022})
  const mod={exports:{}}
  new Function('module','exports','require',js)(mod,mod.exports,key=>{
    if(Object.hasOwn(deps,key))return deps[key]
    throw Error('Unexpected import '+key)
  })
  return mod.exports
}
const audio=load('../src/shared/videoAudio.ts')
const video=load('../src/shared/videoMedia.ts',{'./videoAudio':audio})
const editing=load('../src/shared/videoStudioRebuild/rebuildEditor.ts',{'../videoMedia':video,'../videoCharacterTimeline':{}})
const fixture=()=>({
  schemaVersion:1,id:'one',title:'Project',updatedAt:'old',
  assets:[{id:'x',dataUrl:'data:image/png;base64,UNCHANGED'}],elements:[],
  videoTimeline:{schemaVersion:1,frameRate:60,durationFrames:600,playheadFrame:135,playing:false,
    characterKeys:[],saveMarkers:[],
    textClips:[{id:'speech',elementId:'balloon',kind:'speech',startFrame:100,endFrame:300,
      state:{id:'balloon',kind:'speech',text:'Oi'}}],
    videoAssets:[{id:'media',durationFrames:720}],
    videoClips:[{id:'clip',assetId:'media',startFrame:100,endFrame:300,
      sourceStartFrame:20,sourceEndFrame:220,audio:{volume:.4,muted:false},
      transform:{x:1,y:2,width:40,height:30,rotation:3}}]}})
const stamp='2026-10-23T23:00:00Z'

test('text split preserves authored balloon snapshot, contiguous boundaries and input',()=>{
  const d=fixture(),result=editing.splitTextClipAt(d,'speech',160,'right',stamp)
  const [a,b]=result.videoTimeline.textClips
  assert.deepEqual([a.startFrame,a.endFrame,b.startFrame,b.endFrame],[100,160,160,300])
  assert.equal(b.state,a.state)
  assert.equal(result.assets,d.assets)
  assert.equal(d.videoTimeline.textClips.length,1)
  assert.equal(result.updatedAt,stamp)
  assert.equal(editing.splitTextClipAt(d,'speech',100,'right',stamp),d)
  assert.equal(editing.splitTextClipAt(d,'speech',160,'clip',stamp),d)
  const locked={...d,videoTimeline:{...d.videoTimeline,trackSettings:{speech:{locked:true}}}}
  assert.equal(editing.splitTextClipAt(locked,'speech',160,'right',stamp),locked)
})

test('video split retains source PTS and independent clip audio/transform without alteration',()=>{
  const d=fixture(),result=editing.splitVideoClipAt(d,'clip',160,'right',stamp)
  const [a,b]=result.videoTimeline.videoClips
  assert.deepEqual([a.startFrame,a.endFrame,b.startFrame,b.endFrame],[100,160,160,300])
  assert.deepEqual([a.sourceStartFrame,a.sourceEndFrame,b.sourceStartFrame,b.sourceEndFrame],[20,80,80,220])
  assert.equal(a.audio,b.audio)
  assert.equal(a.transform,b.transform)
  assert.equal(d.videoTimeline.videoClips[0].endFrame,300)
  assert.equal(editing.splitVideoClipAt(d,'clip',300,'right',stamp),d)
  assert.equal(editing.splitVideoClipAt(d,'clip',160,'speech',stamp),d)
  const locked={...d,videoTimeline:{...d.videoTimeline,trackSettings:{video:{locked:true}}}}
  assert.equal(editing.splitVideoClipAt(locked,'clip',160,'right',stamp),locked)
  const bad={...d,videoTimeline:{...d.videoTimeline,videoAssets:[]}}
  assert.equal(editing.splitVideoClipAt(bad,'clip',160,'right',stamp),bad)
})

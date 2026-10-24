'use strict'
const test=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const path=require('node:path')
const ts=require('typescript')
const load=(rel,deps={})=>{
  const js=ts.transpile(fs.readFileSync(path.resolve(__dirname,'..',rel),'utf8'),
    {module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022})
  const mod={exports:{}}
  new Function('require','module','exports',js)(key=>{
    if(Object.hasOwn(deps,key))return deps[key]
    throw Error('Unexpected '+key)
  },mod,mod.exports)
  return mod.exports
}
const audio=load('src/shared/videoAudio.ts')
const video=load('src/shared/videoMedia.ts',{'./videoAudio':audio})
const commands=load('src/shared/videoStudioRebuild/timelineClipCommands.ts',{
  '../videoMedia':video,'../videoAudio':audio
})
const balloon={id:'balloon',kind:'speech',text:'Oi',x:0,y:0,width:10,height:10,rotation:0,zIndex:0}
const doc=()=>({id:'studio',updatedAt:'old',elements:[balloon],assets:[{id:'save',dataUrl:'IMMUTABLE'}],
  videoTimeline:{schemaVersion:1,frameRate:60,durationFrames:600,characterKeys:[],saveMarkers:[],
    textClips:[{id:'text',kind:'speech',elementId:'balloon',startFrame:30,endFrame:100}],
    videoAssets:[{id:'asset',durationFrames:600}],
    videoClips:[{id:'clip',assetId:'asset',startFrame:100,endFrame:220,
      sourceStartFrame:15,sourceEndFrame:135,audio:{volume:.4,muted:false}}]}})
test('edit speech text per clip, preserving shared element and unrelated assets',()=>{
  const source=doc(),next=commands.setTextClipContent(source,'text','Olá nova fala','new')
  assert.equal(next.videoTimeline.textClips[0].state.text,'Olá nova fala')
  assert.equal(source.elements[0].text,'Oi')
  assert.strictEqual(next.elements,source.elements)
  assert.strictEqual(next.assets,source.assets)
  assert.strictEqual(commands.setTextClipContent(next,'text','Olá nova fala','new'),next)
  assert.strictEqual(commands.setTextClipContent(source,'text','x'.repeat(2001),'new'),source)
})
test('text and video reposition retain duration and original source PTS',()=>{
  const source=doc(),a=commands.moveTextClip(source,'text',150,'new')
  assert.deepEqual([a.videoTimeline.textClips[0].startFrame,a.videoTimeline.textClips[0].endFrame],[150,220])
  assert.strictEqual(commands.moveTextClip(source,'text',599,'new'),source)
  const b=commands.moveVideoClip(source,'clip',240,'new')
  assert.deepEqual([b.videoTimeline.videoClips[0].startFrame,b.videoTimeline.videoClips[0].endFrame],[240,360])
  assert.deepEqual([b.videoTimeline.videoClips[0].sourceStartFrame,b.videoTimeline.videoClips[0].sourceEndFrame],[15,135])
  assert.strictEqual(commands.moveVideoClip(source,'clip',550,'new'),source)
  assert.strictEqual(commands.moveVideoClip(source,'clip',10.5,'new'),source)
})
test('global and per-video mix stay independent, finite and reversible by document reference',()=>{
  const source=doc(),clip=commands.setVideoClipAudio(source,'clip',{muted:true,volume:.15},'new')
  assert.deepEqual(clip.videoTimeline.videoClips[0].audio,{volume:.15,muted:true})
  assert.equal(source.videoTimeline.videoClips[0].audio.volume,.4)
  assert.strictEqual(commands.setVideoClipAudio(source,'clip',{volume:2},'new'),source)
  const master=commands.setProjectVideoAudio(source,{volume:.8,muted:true},'new')
  assert.deepEqual(master.videoTimeline.videoAudio,{volume:.8,muted:true})
  assert.strictEqual(master.videoTimeline.videoClips,source.videoTimeline.videoClips)
  assert.strictEqual(commands.setProjectVideoAudio(source,{volume:NaN},'new'),source)
})
test('deletion changes only timeline and preserves locks and ID isolation',()=>{
  const source=doc()
  assert.equal(commands.deleteTimelineClip(source,'text','text','new').videoTimeline.textClips.length,0)
  assert.equal(commands.deleteTimelineClip(source,'video','clip','new').videoTimeline.videoClips.length,0)
  assert.strictEqual(commands.deleteTimelineClip(source,'video','missing','new'),source)
  const locked={...source,videoTimeline:{...source.videoTimeline,
    trackSettings:{speech:{locked:true},video:{locked:true}}}}
  assert.strictEqual(commands.deleteTimelineClip(locked,'text','text','new'),locked)
  assert.strictEqual(commands.moveTextClip(locked,'text',200,'new'),locked)
  assert.strictEqual(commands.moveVideoClip(locked,'clip',240,'new'),locked)
  assert.strictEqual(commands.setVideoClipAudio(locked,'clip',{volume:.1},'new'),locked)
  assert.strictEqual(commands.deleteTimelineClip(locked,'video','clip','new'),locked)
})

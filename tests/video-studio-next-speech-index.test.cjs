'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const file = path.resolve(__dirname, '../src/shared/videoStudioNext/speechIndex.ts')
const source = fs.readFileSync(file, 'utf8')
const compiled = ts.transpile(source, {module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022})
const mod = { exports: {} }
new Function('module','exports',compiled)(mod,mod.exports)
const { compileVideoSpeechIndex: compile, evaluateVideoSpeechIndex: at } = mod.exports

const elements = [
 {id:'bubble-1',kind:'speech',speakerCharacterId:'actor-a'},
 {id:'bubble-2',kind:'speech',speakerCharacterId:'actor-b'},
 {id:'bubble-3',kind:'thought',speakerCharacterId:'actor-a'},
]
function oldScan(clips, frame) {
 const modes = new Map()
 const speechStartFrames = new Map()
 for (const clip of clips) {
  if (clip.startFrame > frame || frame >= clip.endFrame) continue
  const speakerId = (clip.state ?? elements.find(e => e.id === clip.elementId))?.speakerCharacterId
  if (!speakerId) continue
  if (clip.kind === 'speech') {
   modes.set(speakerId, 'talk')
   const before = speechStartFrames.get(speakerId)
   speechStartFrames.set(speakerId, before === undefined ? clip.startFrame : Math.min(before,clip.startFrame))
  } else if (modes.get(speakerId) !== 'talk') modes.set(speakerId, 'idle')
 }
 return {modes:[...modes],starts:[...speechStartFrames]}
}
function normalized(result) {
 return {modes:[...result.modes],starts:[...result.speechStartFrames]}
}
test('indexed speech matches original linear algorithm for every frame, with unsorted and overlapping clips',()=>{
 const clips=[
  {id:'later',elementId:'bubble-1',kind:'speech',startFrame:30,endFrame:70},
  {id:'thought',elementId:'bubble-3',kind:'thought',startFrame:0,endFrame:65},
  {id:'other',elementId:'bubble-2',kind:'speech',startFrame:10,endFrame:55},
  {id:'early',elementId:'bubble-1',kind:'speech',startFrame:15,endFrame:50},
  {id:'unbound',elementId:'none',kind:'speech',startFrame:0,endFrame:100},
  {id:'override',elementId:'bubble-2',kind:'thought',startFrame:35,endFrame:45,state:{speakerCharacterId:'actor-a'}},
 ]
 const index=compile(clips,elements)
 for(let frame=0;frame<90;frame++)assert.deepEqual(normalized(at(index,frame)),oldScan(clips,frame),'frame '+frame)
 assert.deepEqual(normalized(at(index,35)).starts,[['actor-a',15],['actor-b',10]])
 assert.deepEqual(normalized(at(index,70)),{modes:[],starts:[]})
})
test('half-open boundary, missing speaker, malformed intervals and reverse seeks',()=>{
 const clips=[
  {id:'only',elementId:'bubble-1',kind:'speech',startFrame:5,endFrame:6},
  {id:'invalid',elementId:'bubble-2',kind:'speech',startFrame:NaN,endFrame:10},
 ]
 const index=compile(clips,elements)
 const frame5=normalized(at(index,5))
 assert.deepEqual(frame5,{modes:[['actor-a','talk']],starts:[['actor-a',5]]})
 assert.deepEqual(normalized(at(index,6)),{modes:[],starts:[]})
 assert.deepEqual(normalized(at(index,5)),frame5)
 assert.deepEqual(normalized(at(index,-1)),{modes:[],starts:[]})
})
test('large sparse timelines index only the active intervals',()=>{
 const clips=Array.from({length:10000},(_,i)=>({
  id:String(i),elementId:'bubble-1',kind:'speech',startFrame:i*20,endFrame:i*20+5,
 }))
 const index=compile(clips,elements)
 const atFrame=at(index,180005)
 assert.equal(atFrame.modes.size,0)
 assert.equal(at(index,180002).modes.get('actor-a'),'talk')
 assert.equal(index.items.length,10000)
 assert.equal(index.prefixMaxEnd.length,10000)
})

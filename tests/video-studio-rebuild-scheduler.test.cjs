'use strict'
const test=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const path=require('node:path')
const ts=require('typescript')
function load(file,deps={}) {
  const content=fs.readFileSync(path.join(__dirname,'..',file),'utf8')
  const js=ts.transpile(content,{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022})
  const mod={exports:{}}
  new Function('require','module','exports',js)(name=>{if(!Object.hasOwn(deps,name))throw Error(name);return deps[name]},mod,mod.exports)
  return mod.exports
}
const {VideoFrameScheduler}=load('src/shared/videoStudioRebuild/frameScheduler.ts')
const {splitCharacterAt,deleteCharacterKey,moveCharacterKey}=load('src/shared/videoStudioRebuild/rebuildEditor.ts',{
  '../videoCharacterTimeline':{videoCharacterStateAt:(timeline,id,frame)=>timeline.characterBases[id]},
})
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve}}

test('frame scheduler never enumerates transitions and evaluates only requested frame',async()=>{
  const scheduler=new VideoFrameScheduler(2)
  let rendered=0
  assert.equal(await scheduler.request('frame:8400','visible',async(signal)=>{
    assert.equal(signal.aborted,false);rendered++;return 8400
  }),8400)
  assert.equal(rendered,1)
  assert.equal(scheduler.status().waiting,0)
  scheduler.dispose()
})

test('seek cancels obsolete active work and never publishes its result',async()=>{
  const scheduler=new VideoFrameScheduler(2),gate=deferred()
  let stopped=false
  const old=scheduler.request('old','visible',async(signal)=>{
    await gate.promise
    stopped=signal.aborted
    return 'outdated'
  })
  await Promise.resolve()
  const fresh=scheduler.request('new','seek',async()=> 'fresh')
  gate.resolve()
  await assert.rejects(old,e=>e.name==='AbortError')
  assert.equal(stopped,true)
  assert.equal(await fresh,'fresh')
  scheduler.dispose()
})

test('finite queue rejects overflowing prefetch and dispose cancels queued jobs',async()=>{
  const scheduler=new VideoFrameScheduler(1),gate=deferred()
  const active=scheduler.request('active','visible',async()=>gate.promise)
  const next=scheduler.request('prefetch','prefetch',async()=>42)
  await assert.rejects(scheduler.request('extra','prefetch',async()=>99),e=>e.name==='AbortError')
  scheduler.dispose()
  await assert.rejects(next,e=>e.name==='AbortError')
  gate.resolve(11)
  await assert.rejects(active,e=>e.name==='AbortError')
  assert.equal(scheduler.status().waiting,0)
})

test('new immutable editor split respects locks, duplicate positions and authored PT face',()=>{
  const state={element:{id:'actor',kind:'character',poseSlot:2,activeFaceMode:'blink',activeExpressionPresetId:'pt',
    faceTransforms:{'expression-component:pupil-left':{x:-11,y:0,width:5,height:5,rotation:0}}},
    imageDataUrl:'data:image/png;base64,saved'}
  const base={schemaVersion:1,id:'project',updatedAt:'old',elements:[{id:'actor',kind:'character'}],
    videoTimeline:{schemaVersion:1,frameRate:60,durationFrames:180,playheadFrame:0,
      characterKeys:[],textClips:[],characterBases:{actor:state}}}
  const first=splitCharacterAt(base,'actor',42,'key-id','new')
  assert.equal(base.videoTimeline.characterKeys.length,0)
  assert.equal(first.videoTimeline.characterKeys[0].state,state)
  assert.equal(first.videoTimeline.characterKeys[0].expressionPresetId,'pt')
  assert.equal(splitCharacterAt(first,'actor',42,'duplicate','new'),first)
  assert.equal(splitCharacterAt(first,'actor',180,'out-of-range','new'),first)
  const locked={...first,videoTimeline:{...first.videoTimeline,trackSettings:{actor:{locked:true}}}}
  assert.equal(splitCharacterAt(locked,'actor',75,'locked','new'),locked)
})

test('new frame evaluator reuses authored data URLs without cloning project assets on every seek',()=>{
  let compiled=0
  const {VideoStudioFrameEngine}=load('src/shared/videoStudioRebuild/frameEngine.ts',{
    '../videoSceneIR':{
      compileVideoScene:(snapshot,variant)=>{
        compiled++;assert.equal(variant,'animated')
        assert.strictEqual(snapshot.studio,source)
        assert.strictEqual(snapshot.timeline,source.videoTimeline)
        return { snapshot }
      },
      evaluateVideoSceneFrame:(program,frame)=>({frame,art:program.snapshot.studio.assets[0].dataUrl}),
    },
  })
  const src='data:image/png;base64,'+'a'.repeat(800000)
  const source={schemaVersion:1,assets:[{id:'real',dataUrl:src}],
    videoTimeline:{schemaVersion:1,frameRate:60,durationFrames:10800,characterKeys:[],textClips:[]}}
  const engine=new VideoStudioFrameEngine(source)
  assert.equal(engine.evaluate(0).art,src)
  assert.equal(engine.evaluate(10500).art,src)
  assert.equal(compiled,1)
  assert.throws(()=>engine.evaluate(10800),RangeError)
})

test('rebuilt editor repositions and removes only one authored key without changing pose/PT images',()=>{
  const eye={element:{id:'actor',kind:'character',poseSlot:3,activeExpressionGaze:'left',
    faceTransforms:{'expression-component:pupil-right':{x:11,y:1,width:80,height:80,rotation:0}}},
    imageDataUrl:'data:image/png;base64,IMMUTABLE'}
  const original={schemaVersion:1,elements:[{id:'actor',kind:'character'}],
    videoTimeline:{durationFrames:400,characterBases:{actor:eye},
      characterKeys:[{id:'first',elementId:'actor',frame:100,state:eye},
        {id:'other',elementId:'actor',frame:200,state:eye}]}}
  const moved=moveCharacterKey(original,'actor','first',150,'now')
  assert.deepEqual(moved.videoTimeline.characterKeys.map(k=>k.frame),[150,200])
  assert.strictEqual(moved.videoTimeline.characterKeys[0].state,eye)
  assert.strictEqual(original.videoTimeline.characterKeys[0].frame,100)
  assert.strictEqual(moveCharacterKey(original,'actor','first',200,'now'),original)
  assert.strictEqual(moveCharacterKey(original,'actor','first',400,'now'),original)
  const removed=deleteCharacterKey(moved,'actor','first','new')
  assert.equal(removed.videoTimeline.characterKeys.length,1)
  assert.strictEqual(removed.videoTimeline.characterBases.actor,eye)
  assert.strictEqual(deleteCharacterKey(removed,'actor','first','again'),removed)
  const locked={...original,videoTimeline:{...original.videoTimeline,trackSettings:{actor:{locked:true}}}}
  assert.strictEqual(moveCharacterKey(locked,'actor','first',120,'now'),locked)
  assert.strictEqual(deleteCharacterKey(locked,'actor','first','now'),locked)
})

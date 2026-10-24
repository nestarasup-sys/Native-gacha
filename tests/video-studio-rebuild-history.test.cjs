'use strict'
const test=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const path=require('node:path')
const ts=require('typescript')
const code=ts.transpile(fs.readFileSync(path.resolve(__dirname,'../src/shared/videoStudioRebuild/documentHistory.ts'),'utf8'),{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022})
const mod={exports:{}}
new Function('module','exports',code)(mod,mod.exports)
const {RebuildDocumentHistory}=mod.exports
const doc=(id='a')=>({schemaVersion:1,id,title:'Video Studio',updatedAt:'old',
  assets:[{id:'asset',dataUrl:'data:image/png;base64,HEAVY'}],elements:[],
  videoTimeline:{schemaVersion:1,frameRate:60,durationFrames:300,playheadFrame:0,
    playing:false,characterKeys:[],textClips:[],saveMarkers:[]}})

test('undo and redo preserve v1 identity and media without copying buffers',()=>{
  const h=new RebuildDocumentHistory(4),a=doc(),b={...a,title:'Edit 1',videoTimeline:{...a.videoTimeline,animateCharacterTransitions:false}}
  h.reset(a)
  assert.equal(h.record(a,a),false)
  assert.equal(h.record(a,b),true)
  assert.equal(h.undo(b),a)
  assert.equal(h.redo(a),b)
  assert.equal(b.assets,a.assets)
  assert.equal(a.videoTimeline.animateCharacterTransitions,undefined)
})

test('undo branch discards redo and never crosses project IDs or save-as',()=>{
  const h=new RebuildDocumentHistory(),a=doc(),b={...a,title:'b'},c={...b,title:'c'}
  h.reset(a);h.record(a,b);h.record(b,c)
  assert.equal(h.undo(c),b)
  const d={...b,title:'branch'}
  h.record(b,d)
  assert.equal(h.canRedo,false)
  assert.equal(h.redo(d),null)
  assert.throws(()=>h.record(d,doc('other')),/atravessar projetos/)
  const savedAs=doc('saved-as')
  h.reset(savedAs)
  assert.equal(h.undo(savedAs),null)
})

test('history is bounded and refuses an unrelated document reference',()=>{
  const h=new RebuildDocumentHistory(2)
  let current=doc()
  h.reset(current)
  for(let i=0;i<4;i++){
    const next={...current,title:String(i)}
    h.record(current,next);current=next
  }
  assert.equal(h.undo(current).title,'2')
  const previous=h.undo(h.undo(doc())??doc())
  assert.equal(previous,null)
  assert.equal(h.canUndo,false)
  assert.throws(()=>new RebuildDocumentHistory(0),/Limite/)
})

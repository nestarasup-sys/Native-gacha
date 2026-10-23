'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

function compiled(file) {
 return ts.transpile(fs.readFileSync(path.resolve(__dirname,file),'utf8'),{
  module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022
 })
}
const bm={exports:{}}
new Function('module','exports',compiled('../src/shared/videoStudioNext/resourceBudget.ts'))(bm,bm.exports)
const {VideoStudioResourceBudget} = bm.exports
const doc={createElement(type){
 assert.equal(type,'canvas')
 return {width:0,height:0,getContext(kind){assert.equal(kind,'2d');return {drawn:true}}}
}}
const lm={exports:{}}
new Function('module','exports','document',compiled('../src/renderer/src/features/videoStudio/videoCanvasLayerCache.ts'))(lm,lm.exports,doc)
const {VideoCanvasLayerCache}=lm.exports

test('canvas LRU leases account for actual cached bytes and release on eviction/clear',async()=>{
 const budget=new VideoStudioResourceBudget(128)
 const cache=new VideoCanvasLayerCache(16*1024*1024,budget)
 const draw=()=>{}
 const a=await cache.create('a',4,4,draw)
 await cache.create('b',4,4,draw)
 assert.equal(cache.get('a'),a)
 assert.equal(budget.snapshot().usedBytes,128)
 await cache.create('c',4,4,draw)
 assert.equal(cache.stats().entries,2)
 assert.equal(budget.snapshot().usedBytes,128)
 assert.equal(cache.get('b'),undefined,'least recently used entry was evicted')
 assert.equal(cache.stats().evictions,1)
 cache.clear()
 assert.equal(cache.stats().bytes,0)
 assert.equal(budget.snapshot().usedBytes,0)
})

test('external ledger pressure causes valid transient raster, never unbudgeted cache admission',async()=>{
 const budget=new VideoStudioResourceBudget(128)
 const cache=new VideoCanvasLayerCache(16*1024*1024,budget)
 const reserved=budget.tryReserve('video-decoder',96)
 const transient=await cache.create('background',4,4,()=>{})
 assert.ok(transient)
 assert.equal(cache.stats().entries,0)
 assert.equal(budget.snapshot().usedBytes,96)
 reserved.release()
 const cached=await cache.create('background',4,4,()=>{})
 assert.ok(cached)
 assert.equal(cache.stats().entries,1)
 assert.equal(budget.snapshot().usedBytes,64)
 cache.clear()
 assert.equal(budget.snapshot().usedBytes,0)
})

test('async raster completion after clear cannot repopulate cache or leak reservations',async()=>{
 const budget=new VideoStudioResourceBudget(128)
 const cache=new VideoCanvasLayerCache(16*1024*1024,budget)
 let releaseDraw
 const drawing=new Promise(resolve=>{releaseDraw=resolve})
 const pending=cache.create('delayed',4,4,async()=>drawing)
 // draw executes in a microtask, but clear invalidates the generation now.
 cache.clear()
 releaseDraw()
 await pending
 assert.equal(cache.stats().entries,0)
 assert.equal(budget.snapshot().usedBytes,0)
})

test('failed raster leaves zero reservations and can be retried',async()=>{
 const budget=new VideoStudioResourceBudget(128)
 const cache=new VideoCanvasLayerCache(16*1024*1024,budget)
 await assert.rejects(cache.create('bad',4,4,()=>Promise.reject(new Error('decode failed'))),/decode failed/)
 assert.equal(budget.snapshot().usedBytes,0)
 await cache.create('bad',4,4,()=>{})
 assert.equal(cache.stats().entries,1)
 cache.clear()
})

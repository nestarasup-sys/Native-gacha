'use strict'
/** Microbenchmark reproduzível: mede custo de cache, não FPS do Electron. */
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const { performance } = require('node:perf_hooks')
const ts = require('typescript')
const path = join(__dirname,'../../electron/domains/fabricator/versionedAssetResolver.ts')
const code=ts.transpile(readFileSync(path,'utf8'),{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022})
const mod={exports:{}}
new Function('module','exports',code)(mod,mod.exports)
const {VersionedAssetResolver}=mod.exports
async function main(){
 const resolver=new VersionedAssetResolver(32*1024*1024)
 const sample=Uint8Array.from({length:256*1024},(_,i)=>i%251)
 let diskReads=0
 const get=async()=>{diskReads++;return Uint8Array.from(sample)}
 const rounds=150
 const before=performance.now()
 for(let i=0;i<rounds;i++) await get()
 const uncachedMs=performance.now()-before
 const begin=performance.now()
 for(let i=0;i<rounds;i++)await resolver.resolve('wardrobe','model-1:uniform','rev1',get)
 const cachedMs=performance.now()-begin
 const result={
  rounds,bytesPerAsset:sample.length,
  uncachedMs:Number(uncachedMs.toFixed(3)),cachedMs:Number(cachedMs.toFixed(3)),
  cacheEntries:resolver.entries,cacheBytes:resolver.byteSize,
  // Esperado: 150 leituras sem cache e 1 cache miss
  readCalls:diskReads
 }
 console.log(JSON.stringify(result,null,2))
 if(diskReads!==rounds+1)throw Error('Cache não deduplicou leituras corretamente.')
}
main().catch(e=>{console.error(e);process.exitCode=1})

import test from 'node:test'
import assert from 'node:assert/strict'
import { performance } from 'node:perf_hooks'
import sharp from 'sharp'
import { VersionedAssetResolver } from '../electron/domains/fabricator/versionedAssetResolver.ts'

test('benchmark reprodutível: quatro PNGs independentes e cache de 32 MiB',async t=>{
 const started=performance.now()
 const pixels=[
  [190,40,40,255],[40,140,220,255],[222,178,43,255],[98,68,170,255]
 ]
 const generated=await Promise.all(pixels.map(async rgba=>
  sharp({create:{width:256,height:256,channels:4,background:{r:rgba[0],g:rgba[1],b:rgba[2],alpha:1}}}).png().toBuffer()))
 const resolver=new VersionedAssetResolver(32*1024*1024)
 let io=0
 const reads=await Promise.all(generated.map((image,i)=>
   resolver.resolve('wardrobe','1:synth','v1',async()=>{io++;return image},'/parts/piece-'+i+'.png')))
 const firstLoadMs=performance.now()-started
 const replay=performance.now()
 await Promise.all(generated.map((_,i)=>resolver.resolve('wardrobe','1:synth','v1',async()=>{throw Error('cache miss')},'/parts/piece-'+i+'.png')))
 const cacheHitMs=performance.now()-replay
 assert.equal(io,4)
 assert.equal(new Set(reads.map(buf=>Buffer.from(buf).toString('base64'))).size,4)
 assert.ok(resolver.byteSize<=32*1024*1024)
 assert.equal(resolver.entries,4)
 assert.ok(firstLoadMs>=0 && Number.isFinite(cacheHitMs))
 t.diagnostic(JSON.stringify({kind:'node-png-cache',firstLoadMs:+firstLoadMs.toFixed(2),cacheHitMs:+cacheHitMs.toFixed(2),
   cacheBytes:resolver.byteSize,heapBytes:process.memoryUsage().heapUsed,files:4}))
})
test('benchmark: invalidar carga antiga e reidratar não repete peças em snapshot',async t=>{
 const cache=new VersionedAssetResolver(1000)
 const started=performance.now()
 const ids=['sleeve-left','sleeve-right','shirt','collar']
 const result=await Promise.all(ids.map((id,i)=>cache.resolve('wardrobe','1:outfit','v1',async()=>Uint8Array.of(i,44),'/parts/'+id+'.png')))
 cache.invalidate('wardrobe','1:outfit')
 const after=await Promise.all(ids.map((id,i)=>cache.resolve('wardrobe','1:outfit','v2',async()=>Uint8Array.of(i,66),'/parts/'+id+'.png')))
 assert.ok(after.every((x,i)=>x[0]===i && x[1]===66))
 assert.ok(result.every((x,i)=>x[1]===44 && x[0]===i))
 t.diagnostic(JSON.stringify({kind:'cache-refresh',durationMs:+(performance.now()-started).toFixed(2),pieces:ids.length}))
})

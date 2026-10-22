import test from 'node:test'
import assert from 'node:assert/strict'
import { VersionedAssetResolver, assetCacheKey } from '../electron/domains/fabricator/versionedAssetResolver.ts'

test('resolver deduplica leituras simultâneas e isola mutações do consumidor', async () => {
  const resolver = new VersionedAssetResolver(100)
  let reads = 0
  const read = async () => { reads++; await new Promise(r => setTimeout(r,8)); return Uint8Array.from([1,2,3]) }
  const [first, second] = await Promise.all([
    resolver.resolve('model','slot-1/head','source-a',read),
    resolver.resolve('model','slot-1/head','source-a',read)
  ])
  assert.equal(reads,1)
  first[0]=255
  assert.deepEqual(Array.from(second),[1,2,3])
  const third=await resolver.resolve('model','slot-1/head','source-a',read)
  assert.deepEqual(Array.from(third),[1,2,3])
  assert.equal(reads,1)
})
test('nova versão de fonte nunca reutiliza PNG anterior',async()=>{
 const resolver=new VersionedAssetResolver(20)
 let reads=0
 const read=async()=>Uint8Array.of(++reads)
 assert.deepEqual(Array.from(await resolver.resolve('model','head','source-v1',read)),[1])
 assert.deepEqual(Array.from(await resolver.resolve('model','head','source-v2',read)),[2])
 assert.deepEqual(Array.from(await resolver.resolve('model','head','source-v1',read)),[1])
 resolver.invalidate('model','head')
 assert.equal(resolver.entries,0)
 assert.deepEqual(Array.from(await resolver.resolve('model','head','source-v2',read)),[3])
})
test('mesma ID em roupa, cabelo e rosto nunca mistura payload entre domínios',async()=>{
 const cache=new VersionedAssetResolver()
 const kinds=['model','wardrobe','hair','face','expression','pose','animator']
 for(let i=0;i<kinds.length;i++)assert.deepEqual(Array.from(await cache.resolve(kinds[i],'head','v1',async()=>Uint8Array.of(i))),[i])
 assert.equal(cache.entries,kinds.length)
 assert.notEqual(assetCacheKey('face','head','v1'),assetCacheKey('hair','head','v1'))
})
test('LRU expulsa primeiro os assets antigos e não armazena PNG gigante',async()=>{
 const cache=new VersionedAssetResolver(5)
 await cache.resolve('model','a','1',async()=>Uint8Array.from([1,1]))
 await cache.resolve('model','b','1',async()=>Uint8Array.from([2,2]))
 await cache.resolve('model','a','1',async()=>Uint8Array.from([8,8]))
 await cache.resolve('model','c','1',async()=>Uint8Array.from([3,3]))
 let bCalls=0
 assert.deepEqual(Array.from(await cache.resolve('model','b','1',async()=>{bCalls++;return Uint8Array.of(9)})),[9])
 assert.equal(bCalls,1)
 assert.ok(cache.byteSize<=5)
 await cache.resolve('model','huge','1',async()=>new Uint8Array(100))
 assert.ok(cache.byteSize<=5)
})
test('leitura com erro não deixa entrada incompleta em cache e permite retry',async()=>{
 const cache=new VersionedAssetResolver()
 await assert.rejects(cache.resolve('face','eyes','v1',async()=>{throw Error('Falha no disco')}),/Falha/)
 assert.equal(cache.entries,0)
 assert.deepEqual(Array.from(await cache.resolve('face','eyes','v1',async()=>Uint8Array.of(5))),[5])
})

test('invalidação enquanto PNG antigo está sendo lido não ressuscita cache obsoleto', async () => {
  const resolver = new VersionedAssetResolver()
  let releaseOld
  const oldBlock = new Promise(resolve => { releaseOld = resolve })
  const first = resolver.resolve('wardrobe','1:set-1','rev-1',async () => {
    await oldBlock
    return Uint8Array.of(71)
  },'/pieces/manga-esquerda.png')
  // A leitura ainda está em andamento quando um conjunto é salvo novamente.
  resolver.invalidate('wardrobe','1:set-1')
  const newRead = await resolver.resolve('wardrobe','1:set-1','rev-1',async () => Uint8Array.of(99),'/pieces/manga-esquerda.png')
  assert.deepEqual(Array.from(newRead),[99])
  releaseOld()
  assert.deepEqual(Array.from(await first),[71], 'uma chamada já iniciada pode completar com sua versão antiga')
  assert.deepEqual(Array.from(await resolver.resolve('wardrobe','1:set-1','rev-1',async()=>Uint8Array.of(55),'/pieces/manga-esquerda.png')),[99], 'o cache final deve manter a versão nova')
})

test('mesmo set e versão, paths diferentes geram chaves independentes', () => {
  assert.notEqual(
    assetCacheKey('wardrobe','model-1:set','v1','/parts/sleeve-left.png'),
    assetCacheKey('wardrobe','model-1:set','v1','/parts/sleeve-right.png')
  )
  assert.notEqual(
    assetCacheKey('face','model-1:face','v1','/eyes-left.png'),
    assetCacheKey('face','model-1:face','v1','/eyes-right.png')
  )
})

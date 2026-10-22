import test from 'node:test'
import assert from 'node:assert/strict'
import { FabricatorCatalogAssetService } from '../electron/domains/fabricator/catalogAssetService.ts'

test('serviço só lê uma vez por versão e contabiliza cache', async () => {
  let reads=0
  const service=new FabricatorCatalogAssetService(async()=>{
    reads++; return Uint8Array.from([10,20,30,40])
  },128)
  const a=await service.read('wardrobe','model-1:coat','v1','/imaginary/coat.png')
  a[0]=255
  const b=await service.read('wardrobe','model-1:coat','v1','/imaginary/coat.png')
  assert.deepEqual(Array.from(b),[10,20,30,40])
  assert.equal(reads,1)
  assert.deepEqual(service.stats(),{reads:2,hits:1,misses:1,invalidations:0,bytes:4,entries:1})
  const next=await service.read('wardrobe','model-1:coat','v2','/imaginary/coat.png')
  assert.equal(next.length,4)
  assert.equal(reads,2)
  service.invalidate('wardrobe','model-1:coat')
  assert.equal(service.stats().entries,0)
  assert.equal(service.stats().invalidations,1)
})
test('serviço compartilha capacidade entre cabelo, roupas e rosto sem misturar identidade',async()=>{
 let current=0
 const service=new FabricatorCatalogAssetService(async()=>Uint8Array.from([++current]),3)
 await service.read('hair','1:style','v1','/hair')
 await service.read('wardrobe','1:outfit','v1','/wardrobe')
 await service.read('face','1:eye','v1','/face')
 assert.equal(service.stats().entries,3)
 await service.read('hair','1:style','v1','/hair')
 assert.equal(current,3)
 await service.read('expression','1:mouth','v1','/expression')
 assert.equal(service.stats().entries,3)
 assert.equal(service.stats().bytes,3)
 await service.read('wardrobe','1:outfit','v1','/wardrobe')
 assert.equal(current,5)
})
test('falhas não ficam em cache e snapshot de métricas é somente leitura',async()=>{
 let attempts=0
 const service=new FabricatorCatalogAssetService(async()=>{
  if(++attempts===1)throw Error('Falha disco')
  return Uint8Array.from([4])
 })
 await assert.rejects(service.read('face','x','v1','/face'),/Falha/)
 const value=await service.read('face','x','v1','/face')
 assert.equal(value[0],4)
 assert.equal(service.stats().entries,1)
 assert.equal(Object.isFrozen(service.stats()),true)
})

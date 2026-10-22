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

test('REGRESSÃO: manga esquerda/direita não substituem torso e demais PNGs do mesmo conjunto', async () => {
  const contents = new Map([
    ['/wardrobe/set-1/parts/manga-esquerda.png', Uint8Array.from([11, 21, 31])],
    ['/wardrobe/set-1/parts/manga-direita.png', Uint8Array.from([12, 22, 32])],
    ['/wardrobe/set-1/parts/camisa.png', Uint8Array.from([13, 23, 33])],
    ['/wardrobe/set-1/parts/gola.png', Uint8Array.from([14, 24, 34])]
  ])
  let reads = 0
  const service = new FabricatorCatalogAssetService(async path => {
    reads++
    await new Promise(resolve => setTimeout(resolve, path.includes('manga-direita') ? 1 : 6))
    return contents.get(path) ?? (() => { throw Error('Asset inexistente: ' + path) })()
  })
  const files = [...contents.keys()]
  const result = await Promise.all(files.map(file => service.read('wardrobe', '1:set-1', 'revision-1', file)))
  for (let i = 0; i < files.length; i++) {
    assert.deepEqual(Array.from(result[i]), Array.from(contents.get(files[i])), files[i])
  }
  assert.equal(service.stats().entries, 4)
  assert.equal(reads, 4, 'cada peça precisa de leitura própria, mesmo com o mesmo set e revisão')
  const reloaded = await Promise.all(files.map(file => service.read('wardrobe', '1:set-1', 'revision-1', file)))
  assert.equal(reads, 4, 'segunda leitura usa o cache de cada arquivo sem misturar bytes')
  result[0][0] = 255
  assert.deepEqual(Array.from(reloaded[0]), [11, 21, 31], 'cache nunca compartilha buffer mutável')
  service.invalidate('wardrobe', '1:set-1')
  contents.set(files[0], Uint8Array.from([41, 42]))
  const updated = await Promise.all(files.map(file => service.read('wardrobe', '1:set-1', 'revision-1', file)))
  assert.deepEqual(Array.from(updated[0]), [41, 42], 'salvamento deve invalidar toda a família de PNGs')
  assert.equal(reads, 8)
})

test('REGRESSÃO: cabelo, face, pose e modelo não compartilham imagem entre arquivos da mesma revisão', async () => {
  const files = new Map([
    ['/hair/front.png', Uint8Array.of(1)],
    ['/hair/back.png', Uint8Array.of(2)],
    ['/face/eye-left.png', Uint8Array.of(3)],
    ['/face/eye-right.png', Uint8Array.of(4)],
    ['/pose/arm-left.png', Uint8Array.of(5)],
    ['/pose/arm-right.png', Uint8Array.of(6)],
    ['/model/body.png', Uint8Array.of(7)],
    ['/model/head.png', Uint8Array.of(8)]
  ])
  const service = new FabricatorCatalogAssetService(async file => {
    if (!files.has(file)) throw Error('Asset desconhecido')
    return files.get(file)
  })
  const pairs = [
    ['hair','1:short','v1',['/hair/front.png','/hair/back.png']],
    ['face','1:eyes','v1',['/face/eye-left.png','/face/eye-right.png']],
    ['pose','1:pose','v1',['/pose/arm-left.png','/pose/arm-right.png']],
    ['model','1:model','v1',['/model/body.png','/model/head.png']]
  ]
  for (const [namespace,identity,version,paths] of pairs) {
    const observed = await Promise.all(paths.map(path => service.read(namespace, identity, version, path)))
    paths.forEach((path,i) => assert.deepEqual(Array.from(observed[i]), Array.from(files.get(path)), path))
  }
  assert.equal(service.stats().entries, 8)
})

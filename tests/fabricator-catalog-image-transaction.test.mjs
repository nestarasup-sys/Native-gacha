import test from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { createFabricatorCatalogPersistence } from '../electron/domains/fabricator/catalogPersistence.ts'
import { catalogManifestNames, recoverCatalogImageTransaction, runCatalogImageTransaction } from '../electron/domains/fabricator/imageManifestTransaction.ts'

const digest = value => createHash('sha256').update(value).digest('hex')
async function fixture(t, manifestName = 'wardrobe.json') {
  const folder = await fs.mkdtemp(join(tmpdir(),'native-catalog-journal-'))
  t.after(()=>fs.rm(folder,{recursive:true,force:true}))
  const imageFolder=join(folder,manifestName === 'wardrobe.json' ? 'parts':'images')
  const images=[{id:'left',bytes:Buffer.from('OLD_LEFT')},{id:'right',bytes:Buffer.from('OLD_RIGHT')}]
  const save=createFabricatorCatalogPersistence(fs, (p,b)=>fs.writeFile(p,b))
  const expected=new Set(['left','right'])
  const manifest={schemaVersion:1, id:'set1', updatedAt:'old'}
  await save.saveCatalog({folder,imageFolder,manifestName,manifest,images,expected})
  return {folder,imageFolder,manifestName,manifest,images,save,expected}
}
test('P0: falha após sobrescrever a primeira manga restaura ambos PNGs e manifesto', async t => {
  const fx=await fixture(t)
  const output=join(fx.imageFolder,'left.png')
  const failing=createFabricatorCatalogPersistence(fs,async (file,bytes)=>{
    await fs.writeFile(file,bytes)
    if (file === output) throw Error('Simulated crash after partial write')
  })
  await assert.rejects(failing.saveCatalog({...fx, manifest:{...fx.manifest,updatedAt:'new'},
    images:[{id:'left',bytes:Buffer.from('BAD_LEFT')},{id:'right',bytes:Buffer.from('BAD_RIGHT')}] }),/Simulated crash/)
  assert.equal(await fs.readFile(output,'utf8'),'OLD_LEFT')
  assert.equal(await fs.readFile(join(fx.imageFolder,'right.png'),'utf8'),'OLD_RIGHT')
  assert.deepEqual(JSON.parse(await fs.readFile(join(fx.folder,fx.manifestName),'utf8')),fx.manifest)
  await assert.rejects(fs.access(join(fx.folder,'.catalog-transaction')),{code:'ENOENT'})
})
test('P0: falha na promoção do manifesto desfaz PNGs mesmo depois de ambas gravações',async t=>{
 const fx=await fixture(t,'face.json')
 const badFiles={...fs,rename:async(source,target)=>{
   if(String(source).endsWith('face.json.tmp'))throw Error('Manifest swap failed')
   return fs.rename(source,target)
 }}
 const persistence=createFabricatorCatalogPersistence(badFiles,(p,b)=>fs.writeFile(p,b))
 await assert.rejects(persistence.saveCatalog({folder:fx.folder,imageFolder:fx.imageFolder,
   manifestName:fx.manifestName,manifest:{...fx.manifest,updatedAt:'new'},
   images:[{id:'left',bytes:Buffer.from('NEWL')},{id:'right',bytes:Buffer.from('NEWR')}],expected:fx.expected
 }),/Manifest swap failed/)
 assert.equal(await fs.readFile(join(fx.imageFolder,'left.png'),'utf8'),'OLD_LEFT')
 assert.equal(await fs.readFile(join(fx.imageFolder,'right.png'),'utf8'),'OLD_RIGHT')
})
test('P0: outro processo restaura journal interrompido sem tocar sidecars e catálogo vizinho',async t=>{
 const fx=await fixture(t,'hair-style.json')
 const journalFolder=join(fx.folder,'.catalog-transaction')
 const manifestName=fx.manifestName
 await fs.mkdir(journalFolder)
 const oldManifest=JSON.stringify(fx.manifest)
 await fs.writeFile(join(journalFolder,'left.bak'),'OLD_LEFT')
 await fs.writeFile(join(journalFolder,'right.bak'),'OLD_RIGHT')
 await fs.writeFile(join(journalFolder,'journal.json'),JSON.stringify({
   schemaVersion:1,manifestName,nextHash:digest(JSON.stringify({...fx.manifest,updatedAt:'new'})),
   oldHash:digest(oldManifest),entries:[{id:'left',existed:true},{id:'right',existed:true}]
 }))
 await fs.writeFile(join(fx.imageFolder,'left.png'),'TRUNCATED')
 await fs.writeFile(join(fx.imageFolder,'right.png'),'DUPLICATE_LEFT')
 await fs.writeFile(join(fx.imageFolder,'left.png.paint.png'),'MANUAL_PAINT')
 const sibling=join(fx.folder,'..','sibling-sentinel-'+fx.folder.split('-').at(-1))
 await fs.mkdir(sibling)
 t.after(()=>fs.rm(sibling,{recursive:true,force:true}))
 await fs.writeFile(join(sibling,'keep.txt'),'OTHER_PROFILE')
 await recoverCatalogImageTransaction(fs,fx.folder,fx.imageFolder)
 assert.equal(await fs.readFile(join(fx.imageFolder,'left.png'),'utf8'),'OLD_LEFT')
 assert.equal(await fs.readFile(join(fx.imageFolder,'right.png'),'utf8'),'OLD_RIGHT')
 assert.equal(await fs.readFile(join(fx.imageFolder,'left.png.paint.png'),'utf8'),'MANUAL_PAINT')
 assert.equal(await fs.readFile(join(sibling,'keep.txt'),'utf8'),'OTHER_PROFILE')
 await assert.rejects(fs.access(journalFolder),{code:'ENOENT'})
})
test('P0: arquivo de journal malicioso falha fechado sem editar PNGs',async t=>{
 const fx=await fixture(t)
 const journalFolder=join(fx.folder,'.catalog-transaction')
 await fs.mkdir(journalFolder)
 await fs.writeFile(join(journalFolder,'journal.json'),JSON.stringify({
  schemaVersion:1,manifestName:'wardrobe.json',nextHash:'0'.repeat(64),
  oldHash:null,entries:[{id:'../escape',existed:false}]
 }))
 await assert.rejects(recoverCatalogImageTransaction(fs,fx.folder,fx.imageFolder),/inválido/)
 assert.equal(await fs.readFile(join(fx.imageFolder,'left.png'),'utf8'),'OLD_LEFT')
})

test('save concorrente + recuperação da mesma roupa não reinstala PNGs antigos',async t=>{
 const fx=await fixture(t)
 let signal,release
 const entered=new Promise(resolve=>{signal=resolve})
 const gate=new Promise(resolve=>{release=resolve})
 let first=true
 const persistence=createFabricatorCatalogPersistence(fs,async (path,bytes)=>{
   if(first && path.endsWith('left.png')) {
     first=false
     signal()
     await gate
   }
   await fs.writeFile(path,bytes)
 })
 const v1=persistence.saveCatalog({folder:fx.folder,imageFolder:fx.imageFolder,manifestName:fx.manifestName,
  manifest:{...fx.manifest,updatedAt:'v1'},images:[
   {id:'left',bytes:Buffer.from('A1')},{id:'right',bytes:Buffer.from('B1')}
  ],expected:fx.expected})
 await entered
 const v2=persistence.saveCatalog({folder:fx.folder,imageFolder:fx.imageFolder,manifestName:fx.manifestName,
  manifest:{...fx.manifest,updatedAt:'v2'},images:[
   {id:'left',bytes:Buffer.from('A2')},{id:'right',bytes:Buffer.from('B2')}
  ],expected:fx.expected})
 const reopen=persistence.recoverWardrobeManifest(fx.folder)
 release()
 await Promise.all([v1,v2,reopen])
 assert.equal(await fs.readFile(join(fx.imageFolder,'left.png'),'utf8'),'A2')
 assert.equal(await fs.readFile(join(fx.imageFolder,'right.png'),'utf8'),'B2')
 assert.equal(JSON.parse(await fs.readFile(join(fx.folder,fx.manifestName),'utf8')).updatedAt,'v2')
 await assert.rejects(fs.access(join(fx.folder,'.catalog-transaction')),{code:'ENOENT'})
})

for (const manifestName of catalogManifestNames) {
 test(`catálogo autoriza o manifesto usado por importações: ${manifestName}`, async t => {
  const folder = await fs.mkdtemp(join(tmpdir(), 'native-catalog-manifest-'))
  t.after(() => fs.rm(folder, { recursive: true, force: true }))
  const imageFolder = manifestName === 'asset.json' ? folder : join(folder, manifestName === 'wardrobe.json' ? 'parts' : 'images')
  const save = createFabricatorCatalogPersistence(fs, (path, bytes) => fs.writeFile(path, bytes))
  const manifest = { schemaVersion: 1, id: 'imported-item', updatedAt: '2026-10-22T00:00:00.000Z' }
  const image = Buffer.from(`PNG:${manifestName}`)

  await save.saveCatalog({
   folder, imageFolder, manifestName, manifest,
   images: [{ id: 'asset', bytes: image }], expected: new Set(['asset'])
  })

  assert.deepEqual(JSON.parse(await fs.readFile(join(folder, manifestName), 'utf8')), manifest)
  assert.deepEqual(await fs.readFile(join(imageFolder, 'asset.png')), image)
 })
}

test('manifestos fora do catálogo autorizado não podem escolher um caminho de gravação', async () => {
  await assert.rejects(runCatalogImageTransaction({
    files: {}, folder: 'catalog', imageFolder: 'catalog/images', manifestName: '../outside.json',
    manifest: {}, images: [], writeImage: async () => {}, promoteManifest: async () => {}
  }), /Manifesto de catálogo não autorizado/)
})

test('todos os manifestos usados pelo processo principal estão registrados para a transação', async () => {
  const sources = await Promise.all([
    fs.readFile(new URL('../electron/main.ts', import.meta.url), 'utf8'),
    fs.readFile(new URL('../electron/domains/fabricator/faceStorage.ts', import.meta.url), 'utf8'),
    fs.readFile(new URL('../electron/domains/fabricator/hairStorage.ts', import.meta.url), 'utf8'),
    fs.readFile(new URL('../electron/domains/fabricator/wardrobePersistence.ts', import.meta.url), 'utf8')
  ])
  const used = sources.flatMap(source => [...source.matchAll(/manifestName:\s*['"]([^'"]+)['"]/g)].map(match => match[1]))
  assert.deepEqual([...new Set(used)].sort(), [...catalogManifestNames].sort())
})

import test from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import sharp from 'sharp'
import { createFabricatorCatalogPersistence } from '../electron/domains/fabricator/catalogPersistence.ts'
import { FabricatorCatalogAssetService } from '../electron/domains/fabricator/catalogAssetService.ts'

const ids=['manga-esquerda','manga-direita','camisa','gola']
const pngColors=['#b62d2d','#2d8ab6','#e1bd42','#8755d9']
const hash=value=>createHash('sha256').update(value).digest('hex')

test('upload e ajuste posteriores nunca trocam os PNGs individuais por cópias de uma manga', async t=>{
  const root=await fs.mkdtemp(join(tmpdir(),'wardrobe-png-identity-'))
  t.after(()=>fs.rm(root,{recursive:true,force:true}))
  const imageFolder=join(root,'parts')
  const bytes=await Promise.all(pngColors.map(color=>sharp({create:{width:8,height:8,channels:4,background:color}}).png().toBuffer()))
  const files=fs
  const catalog=createFabricatorCatalogPersistence(files,(path,data)=>fs.writeFile(path,data))
  const expected=new Set(ids)
  const components=ids.map(id=>({id,category:'manga-superior',attachedPartId:'arm',name:id}))
  const manifest={schemaVersion:1,edition:1,id:'outfit-1',modelSlot:1,modelName:'Sintético',name:'Roupa',width:128,height:128,components,updatedAt:'2026-10-22T16:00:00Z'}
  await catalog.saveCatalog({folder:root,imageFolder,manifestName:'wardrobe.json',manifest,
    images:ids.map((id,i)=>({id,bytes:bytes[i]})),expected,prune:'all'})
  const disk=await Promise.all(ids.map(id=>fs.readFile(join(imageFolder,id+'.png'))))
  assert.equal(new Set(disk.map(hash)).size,4,'arquivos gerados por ID precisam ser distintos')
  const service=new FabricatorCatalogAssetService(path=>fs.readFile(path))
  const loaded=await Promise.all(ids.map(id=>service.read('wardrobe','1:outfit-1',manifest.updatedAt,join(imageFolder,id+'.png'))))
  loaded.forEach((png,i)=>assert.equal(hash(png),hash(bytes[i]),'manga não pode ser imagem de outra peça '+ids[i]))
  // Reposicionamento e rename são apenas dados do manifesto; nenhum PNG é reenviado.
  const metadata={...manifest,name:'Roupa ajustada',updatedAt:'2026-10-22T16:01:00Z'}
  await catalog.saveCatalog({folder:root,imageFolder,manifestName:'wardrobe.json',manifest:metadata,
    images:[],expected,prune:'all'})
  for(let i=0;i<ids.length;i++) assert.equal(hash(await fs.readFile(join(imageFolder,ids[i]+'.png'))),hash(bytes[i]))
  assert.equal(JSON.parse(await fs.readFile(join(root,'wardrobe.json'),'utf8')).name,'Roupa ajustada')
})

test('o editor Roupas Dev só reenvia PNGs ao importar um conjunto novo, não ao mudar seus encaixes',async()=>{
  const editor=await fs.readFile('src/renderer/src/features/fabricator/wardrobe/WardrobeWorkspace.tsx','utf8')
  assert.match(editor,/activeSetId === set\.id && !hasDirtyWarpImage\(component\.id\)/)
  assert.match(editor,/saveWardrobeSet\(modelSlot, serialized, images\)/)
  const persistence=await fs.readFile('electron/domains/fabricator/wardrobePersistence.ts','utf8')
  assert.match(persistence,/deps\.readCatalogPng\(identity, version, join\(folder, 'parts', `\$\{component\.id\}\.png`\)\)/)
})

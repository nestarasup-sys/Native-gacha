import test from 'node:test'
import assert from 'node:assert/strict'
import * as native from 'node:fs/promises'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import sharp from 'sharp'
import { createFabricatorCatalogPersistence } from '../electron/domains/fabricator/catalogPersistence.ts'
import { createStudioDocumentPersistence } from '../electron/domains/studio/documentPersistence.ts'

const require=createRequire(import.meta.url)
const {DataPlatform}=require('../electron/dataPlatform.cjs')
const {DomainFileSystem}=require('../electron/domainFileSystem.cjs')

const UUID='12345678-aaaa-4abc-8abc-123456789abc'
async function sandbox(t){
 // O Windows runner pode fornecer os.tmpdir() com nome 8.3 (RUNNER~1),
 // rejeitado corretamente pelo DataPlatform por não ser um caminho canônico.
 // Gerar o sandbox em workspace real; nunca usar/perder perfil pessoal.
 const canonicalWorkspace=await native.realpath(process.cwd())
 const base=join(canonicalWorkspace,'out','dev-ai','sqlite-regression')
 await native.mkdir(base,{recursive:true})
 const root=await native.realpath(await native.mkdtemp(join(base,'gacha-sqlite-continuity-')))
 const profile=join(root,'profile')
 await native.mkdir(profile,{recursive:true})
 const platform=new DataPlatform(join(root,'app-data')).initialize()
 for(const domain of ['fabricator.wardrobe','studio.projects'])
   platform.setDomainState(domain,'active',{syntheticOnly:true})
 t.after(async()=>{platform.close();await native.rm(root,{recursive:true,force:true})})
 const io=new DomainFileSystem(platform,profile)
 const files=Object.fromEntries(['mkdir','access','readFile','writeFile','rename','unlink','rm','readdir']
   .map(method=>[method,(...args)=>io[method](...args)]))
 return {root,profile,platform,files,io}
}
const png=async color=>sharp({create:{width:8,height:8,channels:4,background:color}}).png().toBuffer()

test('SQLite ativo: salvar manga esquerda/direita em paralelo e recuperar sem confundir bytes',async t=>{
 const {profile,files}=await sandbox(t)
 const folder=join(profile,'fabricator','wardrobe','model-1','set-synthetic')
 const imageFolder=join(folder,'parts')
 const colors=[await png('#d63232'),await png('#32afd6')]
 const persistence=createFabricatorCatalogPersistence(files,(file,bytes)=>files.writeFile(file,bytes))
 const options={folder,imageFolder,manifestName:'wardrobe.json',expected:new Set(['sleeve-left','sleeve-right'])}
 const old={schemaVersion:1,id:'synthetic',updatedAt:'v1'}
 await persistence.saveCatalog({...options,manifest:old,images:[
   {id:'sleeve-left',bytes:colors[0]},{id:'sleeve-right',bytes:colors[1]}
 ]})
 const next={...old,updatedAt:'v2'}
 const saved=persistence.saveCatalog({...options,manifest:next,images:[]})
 const reopened=persistence.recoverWardrobeManifest(folder)
 await Promise.all([saved,reopened])
 assert.equal(JSON.parse(await files.readFile(join(folder,'wardrobe.json'),'utf8')).updatedAt,'v2')
 assert.deepEqual(await files.readFile(join(imageFolder,'sleeve-left.png')),colors[0])
 assert.deepEqual(await files.readFile(join(imageFolder,'sleeve-right.png')),colors[1])
 assert.notDeepEqual(colors[0],colors[1])
})
test('DomainFS ativo: Studio Principal publica e reidrata assets pelo domínio',async t=>{
 const {root,profile,platform,files,io}=await sandbox(t)
 const image=await png('#bb66cc')
 const makeDoc=(title)=>({
   schemaVersion:1,id:UUID,title,color:'#aabbcc',createdAt:'2026-10-22T08:00:00Z',updatedAt:'2026-10-22T08:00:00Z',
   backgroundColor:'#ffffff',backgroundAssetId:null,backgroundX:0,backgroundY:0,backgroundWidth:100,
   backgroundHeight:100,backgroundRotation:0,assets:[{
     id:'12345678-aaaa-4abc-8abc-123456789abd',category:'background',name:'Image',mimeType:'image/png',
     dataUrl:'data:image/png;base64,'+image.toString('base64')
   }],elements:[]
 })
 const libraryPath=join(profile,'studios','Studio Principal')
 const studioPath=id=>join(libraryPath,'studio-'+id)
 const doc=createStudioDocumentPersistence({
   files,studioPath,studioLibraryPath:()=>libraryPath,validate:value=>value?.schemaVersion===1,
   decodeImage:uri=>Buffer.from(uri.split(',')[1],'base64'),
   normalizeImage:async bytes=>({bytes}),
 })
 await doc.writeStudio(makeDoc('Studio Principal'))
 const restored=await doc.readStudio(UUID)
 assert.equal(platform.getDomainState('studio.projects').state,'active')
 assert.equal(restored?.title,'Studio Principal')
 assert.equal(restored?.assets[0]?.dataUrl,'data:image/png;base64,'+image.toString('base64'))
 const physicalManifest=await io.resolvePhysicalPath(join(studioPath(UUID),'studio.json'))
 assert.ok(physicalManifest?.startsWith(join(root,'app-data')))
})

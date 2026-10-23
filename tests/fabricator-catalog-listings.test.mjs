import test from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createFabricatorCatalogListings,legacyHairStyle } from '../electron/domains/fabricator/catalogListings.ts'

const stamp='2026-10-23T03:00:00.000Z'
const tf={x:1,y:2,scaleX:1,scaleY:1,rotation:0}
async function fixture(t){
  const root=await fs.mkdtemp(join(tmpdir(),'native-catalog-read-only-'))
  t.after(()=>fs.rm(root,{recursive:true,force:true}))
  const faceModelPath=slot=>join(root,'fabricator','face',`model-${slot}`)
  const hairModelPath=slot=>join(root,'fabricator','hair',`model-${slot}`)
  const recoveries=[]
  const legacy={schemaVersion:1,modelSlot:1,updatedAt:stamp,
    front:{width:30,height:28,dataUrl:'data:image/png;base64,QUJD'},back:null,fringe:null,
    transforms:{front:{...tf},back:{...tf},fringe:{...tf}}}
  const service=createFabricatorCatalogListings({
    files:{readdir:fs.readdir,readFile:fs.readFile},
    validSlot:slot=>slot===1,faceModelPath,hairModelPath,
    validFace:(slot,face)=>face.schemaVersion===1 && face.modelSlot===slot && Array.isArray(face.pieces),
    validHair:(slot,hair)=>hair.schemaVersion===1 && hair.modelSlot===slot && !!hair.transforms,
    recover:async(folder,images)=>{recoveries.push([folder,images])},
    readLegacyHair:async()=>legacy
  })
  const faceFolder=join(faceModelPath(1),'set-faceA')
  await fs.mkdir(faceFolder,{recursive:true})
  await fs.writeFile(join(faceFolder,'face.json'),JSON.stringify({
    schemaVersion:1,id:'faceA',modelSlot:1,name:'Rosto autorado',updatedAt:stamp,pieces:[{id:'a'}]
  }))
  return {root,service,faceModelPath,hairModelPath,legacy,recoveries}
}
test('listar rosto e cabelo legado nunca cria arquivos ou marcador de migração',async t=>{
  const f=await fixture(t)
  const original=JSON.stringify(f.legacy)
  const faces=await f.service.listFaces(1)
  assert.equal(faces.length,1)
  assert.equal(faces[0].id,'faceA')
  const hair=await f.service.listHair(1)
  assert.equal(hair.length,1)
  assert.equal(hair[0].id,'legacy-workspace')
  assert.equal(hair[0].front.width,30)
  assert.deepEqual(f.legacy,JSON.parse(original))
  assert.deepEqual(legacyHairStyle(1,f.legacy).front.dataUrl,f.legacy.front.dataUrl)
  await assert.rejects(fs.access(join(f.hairModelPath(1),'styles')),{code:'ENOENT'})
  await assert.rejects(fs.access(join(f.hairModelPath(1),'hair-style-migration-v1')),{code:'ENOENT'})
  assert.equal(f.recoveries.length,1)
})
test('estilo explicitamente gravado substitui virtual; marcador histórico impede ressurgir depois da exclusão',async t=>{
  const f=await fixture(t)
  const folder=join(f.hairModelPath(1),'styles','style-legacy-workspace')
  await fs.mkdir(folder,{recursive:true})
  await fs.writeFile(join(folder,'hair-style.json'),JSON.stringify({
    schemaVersion:1,id:'legacy-workspace',modelSlot:1,name:'Original convertido',
    front:{width:30,height:28},back:null,fringe:null,
    transforms:f.legacy.transforms,createdAt:stamp,updatedAt:stamp
  }))
  const first=await f.service.listHair(1)
  assert.equal(first.length,1)
  assert.equal(first[0].name,'Original convertido')
  await fs.rm(folder,{recursive:true})
  await fs.writeFile(join(f.hairModelPath(1),'hair-style-migration-v1'),'existing legacy marker')
  assert.deepEqual(await f.service.listHair(1),[])
  assert.equal(await fs.readFile(join(f.hairModelPath(1),'hair-style-migration-v1'),'utf8'),'existing legacy marker')
})
test('journal inválido bloqueia a listagem: nenhum arquivo é limpo silenciosamente',async t=>{
  const f=await fixture(t)
  const set=join(f.faceModelPath(1),'set-faceA')
  const content=await fs.readFile(join(set,'face.json'),'utf8')
  const corrupt=createFabricatorCatalogListings({
    files:{readdir:fs.readdir,readFile:fs.readFile},
    validSlot:slot=>slot===1,faceModelPath:f.faceModelPath,hairModelPath:f.hairModelPath,
    validFace:()=>true,validHair:()=>true,readLegacyHair:async()=>null,
    recover:async()=>{throw Error('Journal de rosto inválido')}
  })
  await assert.rejects(corrupt.listFaces(1),/Journal de rosto inválido/)
  assert.equal(await fs.readFile(join(set,'face.json'),'utf8'),content)
  await assert.rejects(corrupt.listHair(0),/Modelo inválido/)
})
test('módulo não muda canais públicos nem usa migração automática no main',async()=>{
  const [main,service]=await Promise.all([
    fs.readFile('electron/main.ts','utf8'),fs.readFile('electron/domains/fabricator/catalogListings.ts','utf8')
  ])
  assert.match(main,/registerFabricatorPoseHandlers/)
  assert.match(main,/registerFabricatorWardrobeCatalogHandlers/)
  assert.match(main,/catalogListings\.listFaces/)
  assert.match(main,/catalogListings\.listHair/)
  assert.doesNotMatch(main,/writeFile\(migrationMarker/)
  assert.match(service,/hair-style-migration-v1/)
})

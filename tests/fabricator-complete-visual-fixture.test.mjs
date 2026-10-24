import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { FabricatorModelCatalog } from '../electron/domains/fabricator/modelCatalog.ts'
const require=createRequire(import.meta.url)
const {createCompleteCharacterFixture}=require('../scripts/fabricator/complete-character-fixture.cjs')
test('fixture visual inclui folhas e recortes reais de corpo, cabeça, roupa, cabelo e olhos',async t=>{
 const temp=await mkdtemp(join(tmpdir(),'native-visual-fixture-'))
 t.after(()=>rm(temp,{recursive:true,force:true}))
 const entries=await createCompleteCharacterFixture(temp)
 const files=await import('node:fs/promises')
 const catalog=new FabricatorModelCatalog(10,slot=>join(temp,'fabricator','models','slot-'+slot),{
  readFile:files.readFile,readAssetImage:files.readFile
 })
 const model=await catalog.loadSlot(1)
 assert.equal(model.name,'Boneco sintético de regressão')
 assert.deepEqual(model.parts.map(x=>x.id),['body','head'])
 assert.match(model.parts[0].dataUrl,/^data:image\/png;base64,/)
 const wardrobe=JSON.parse(await readFile(join(entries.outfit,'wardrobe.json'),'utf8'))
 const hair=JSON.parse(await readFile(join(entries.hair,'hair-style.json'),'utf8'))
 const eye=JSON.parse(await readFile(join(entries.eye,'asset.json'),'utf8'))
 const pose=JSON.parse(await readFile(join(entries.pose,'pose.json'),'utf8'))
 assert.equal(wardrobe.components[0].attachedPartId,'body')
 assert.equal(hair.front.width,82)
 assert.equal(eye.kind,'eye')
 assert.equal(pose.sourceModelSlot,1)
 assert.equal(pose.parts[1].id,'head')
})

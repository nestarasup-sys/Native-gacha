import test from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
const require=createRequire(import.meta.url)
const {inspectWardrobeSet}=require('../scripts/diagnostics/audit-wardrobe-images.cjs')
const pngHeader=Buffer.from([137,80,78,71,13,10,26,10])
test('diagnóstico somente leitura identifica mangas idênticas sem apagar arquivos',async t=>{
  const root=await fs.mkdtemp(join(tmpdir(),'native-wardrobe-readonly-'))
  t.after(()=>fs.rm(root,{recursive:true,force:true}))
  await fs.mkdir(join(root,'parts'),{recursive:true})
  const manifest={schemaVersion:1,id:'set',modelSlot:1,components:[
    {id:'left',name:'Manga esquerda',category:'manga-superior',attachedPartId:'left-arm'},
    {id:'right',name:'Manga direita',category:'manga-superior',attachedPartId:'right-arm'},
    {id:'body',name:'Camisa',category:'camisa',attachedPartId:'chest'}
  ]}
  const original=JSON.stringify(manifest)
  await fs.writeFile(join(root,'wardrobe.json'),original)
  const img=Buffer.concat([pngHeader,Buffer.from([20,30,40])])
  await fs.writeFile(join(root,'parts','left.png'),img)
  await fs.writeFile(join(root,'parts','right.png'),img)
  await fs.writeFile(join(root,'parts','body.png'),Buffer.concat([pngHeader,Buffer.from([90])]))
  const report=await inspectWardrobeSet(root)
  assert.equal(report.readOnly,true)
  assert.deepEqual(report.duplicateGroups.map(g=>g.componentIds),[['left','right']])
  assert.equal(report.components.length,3)
  assert.equal(await fs.readFile(join(root,'wardrobe.json'),'utf8'),original)
  assert.deepEqual(await fs.readFile(join(root,'parts','left.png')),img)
  await fs.unlink(join(root,'parts','body.png'))
  const missing=await inspectWardrobeSet(root)
  assert.equal(missing.components.find(x=>x.id==='body')?.warning,'PNG ausente')
})
test('auditoria rejeita IDs repetidos antes de inspecionar assets',async t=>{
  const root=await fs.mkdtemp(join(tmpdir(),'native-wardrobe-ids-'))
  t.after(()=>fs.rm(root,{recursive:true,force:true}))
  await fs.writeFile(join(root,'wardrobe.json'),JSON.stringify({schemaVersion:1,components:[{id:'x'},{id:'x'}]}))
  await assert.rejects(inspectWardrobeSet(root),/ID de peça repetido/)
})

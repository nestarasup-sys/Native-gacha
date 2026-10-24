import test from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { recoverCatalogImageTransaction } from '../electron/domains/fabricator/catalogImageTransaction.ts'

test('processo interrompido durante gravação de roupa fixada preserva PNGs, vínculos e outro conjunto',async t=>{
  const folder=await fs.mkdtemp(join(tmpdir(),'native-glue-crash-'))
  t.after(()=>fs.rm(folder,{recursive:true,force:true}))
  const other=join(folder,'other-set'),images=join(folder,'parts')
  await fs.mkdir(images,{recursive:true})
  await fs.mkdir(other)
  await fs.writeFile(join(other,'wardrobe.json'),'{"sentinel":true}')
  await fs.writeFile(join(images,'left.png'),'OLD_LEFT')
  await fs.writeFile(join(images,'right.png'),'OLD_RIGHT')
  const binding={version:1,boneId:'arm-right',boneWidth:40,boneHeight:90,boneRotation:0,
    localCenterX:.15,localCenterY:.1,widthRatio:.5,heightRatio:.9,relativeRotation:17}
  const oldManifest={schemaVersion:1,id:'glue',modelSlot:1,components:[
    {id:'right',attachedPartId:'arm-right',binding,glue:{version:1,mode:'fixed',sourceFrame:{x:12,y:40,width:40,height:90,rotation:0}}},
    {id:'left',attachedPartId:'arm-left',binding:{...binding,boneId:'arm-left'}}]}
  await fs.writeFile(join(folder,'wardrobe.json'),JSON.stringify(oldManifest))
  const killed=spawnSync(process.execPath,['--experimental-strip-types',
    resolve('scripts/fabricator/crash-wardrobe-glue.mjs'),folder],{encoding:'utf8',timeout:25000})
  assert.equal(killed.status,94,killed.stderr || killed.error?.message || 'Child did not exit at checkpoint')
  assert.equal((await fs.readFile(join(images,'right.png'))).toString(),'NEW_RIGHT')
  // Simulate next app process opening the wardrobe using the same adapter.
  await recoverCatalogImageTransaction(fs,folder,images)
  assert.deepEqual(JSON.parse(await fs.readFile(join(folder,'wardrobe.json'),'utf8')),oldManifest)
  assert.equal((await fs.readFile(join(images,'left.png'))).toString(),'OLD_LEFT')
  assert.equal((await fs.readFile(join(images,'right.png'))).toString(),'OLD_RIGHT')
  assert.equal((await fs.readFile(join(other,'wardrobe.json'),'utf8')),'{"sentinel":true}')
  await recoverCatalogImageTransaction(fs,folder,images)
  await assert.rejects(fs.access(join(folder,'.catalog-transaction')),{code:'ENOENT'})
})

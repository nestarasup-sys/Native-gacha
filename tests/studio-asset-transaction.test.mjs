import test from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { publishStudioAssetsAndManifest, recoverStudioAssetTransaction } from '../electron/domains/storage/studioAssetTransaction.ts'

const asset='assets/backgrounds/12345678-aaaa-4abc-8abc-123456789abc.png'
async function setup(t){
 const root=await fs.mkdtemp(join(tmpdir(),'gacha-studio-journal-'))
 t.after(()=>fs.rm(root,{recursive:true,force:true}))
 await fs.mkdir(join(root,'assets/backgrounds'),{recursive:true})
 await fs.writeFile(join(root,asset),'PREVIOUS_BYTES')
 await fs.writeFile(join(root,'studio.json'),JSON.stringify({title:'OLD'},null,2))
 return root
}
test('commit promove asset e manifesto em conjunto e limpa journal',async t=>{
 const folder=await setup(t)
 await publishStudioAssetsAndManifest({files:fs,folder,assets:[{relativePath:asset,bytes:Buffer.from('NEW_BYTES')}],manifestValue:{title:'NEW'}})
 assert.equal(await fs.readFile(join(folder,asset),'utf8'),'NEW_BYTES')
 assert.equal(JSON.parse(await fs.readFile(join(folder,'studio.json'),'utf8')).title,'NEW')
 await assert.rejects(fs.access(join(folder,'.studio-assets-transaction')),{code:'ENOENT'})
})
test('falha durante PNG reverte bytes antigos e preserva documento',async t=>{
 const folder=await setup(t)
 let injected=false
 const files={...fs,writeFile:async (...args)=>{
   if(!injected && String(args[0]).endsWith('.png')){injected=true;await fs.writeFile(args[0],'CORRUPTED_PARTIAL');throw Error('Interrupção simulada')}
   return fs.writeFile(...args)
 }}
 await assert.rejects(publishStudioAssetsAndManifest({files,folder,assets:[{relativePath:asset,bytes:Buffer.from('NEW_BYTES')}],manifestValue:{title:'NEW'}}),/Interrupção simulada/)
 assert.equal(await fs.readFile(join(folder,asset),'utf8'),'PREVIOUS_BYTES')
 assert.equal(JSON.parse(await fs.readFile(join(folder,'studio.json'),'utf8')).title,'OLD')
})
test('reabertura recupera journal interrompido e protege outro projeto',async t=>{
 const folder=await setup(t)
 const other=join(folder,'other-project')
 await fs.mkdir(other,{recursive:true})
 await fs.writeFile(join(other,'keep.txt'),'DO NOT TOUCH')
 const journalFolder=join(folder,'.studio-assets-transaction')
 await fs.mkdir(journalFolder)
 await fs.writeFile(join(journalFolder,'0.bak'),'PREVIOUS_BYTES')
 await fs.writeFile(join(journalFolder,'journal.json'),JSON.stringify({
   schemaVersion:1,previousHash:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
   nextHash:'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
   entries:[{relativePath:asset,backedUp:true}]
 }))
 await fs.writeFile(join(folder,asset),'CRASH_PARTIAL')
 await recoverStudioAssetTransaction(fs,folder)
 assert.equal(await fs.readFile(join(folder,asset),'utf8'),'PREVIOUS_BYTES')
 assert.equal(await fs.readFile(join(other,'keep.txt'),'utf8'),'DO NOT TOUCH')
 await assert.rejects(fs.access(journalFolder),{code:'ENOENT'})
})
test('journal com tentativa de escape não lê nem altera arquivos externos',async t=>{
 const folder=await setup(t)
 const journalFolder=join(folder,'.studio-assets-transaction')
 await fs.mkdir(journalFolder)
 await fs.writeFile(join(journalFolder,'journal.json'),JSON.stringify({schemaVersion:1,previousHash:null,nextHash:'0'.repeat(64),entries:[{relativePath:'assets/../../escaped',backedUp:false}]}))
 await assert.rejects(recoverStudioAssetTransaction(fs,folder),/Caminho de asset fora/)
})
test('mesmo manifesto com PNG novo conserva dados após commit confirmado',async t=>{
 const folder=await setup(t)
 await publishStudioAssetsAndManifest({files:fs,folder,assets:[{relativePath:asset,bytes:Buffer.from('LATEST')}],manifestValue:{title:'OLD'}})
 assert.equal(await fs.readFile(join(folder,asset),'utf8'),'LATEST')
 assert.equal(JSON.parse(await fs.readFile(join(folder,'studio.json'),'utf8')).title,'OLD')
})

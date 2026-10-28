import test from 'node:test'
import assert from 'node:assert/strict'
import { SerializedDocumentSaveQueue } from '../src/shared/serializedDocumentSave.ts'

test('Studio e Video Studio não invertem ordem quando salvamento antigo leva mais tempo',async()=>{
 const saves = []
 const queue = new SerializedDocumentSaveQueue()
 const slow = queue.run(async()=>{
   await new Promise(r=>setTimeout(r,20))
   saves.push('versao-1')
 })
 const fast = queue.run(async()=>{saves.push('versao-2')})
 assert.equal(queue.pending,2)
 await Promise.all([slow,fast])
 assert.deepEqual(saves,['versao-1','versao-2'])
 await queue.idle()
 assert.equal(queue.pending,0)
})
test('falha de um save não bloqueia o próximo, nem mascara a exceção',async()=>{
 const queue=new SerializedDocumentSaveQueue()
 const fail=queue.run(async()=>{throw Error('IO failure')})
 const pass=queue.run(async()=>42)
 await assert.rejects(fail,/IO failure/)
 assert.equal(await pass,42)
 await queue.idle()
 assert.equal(queue.pending,0)
})
test('Studio e Editor V6 enfileiram salvamentos antes de chamar seus canais IPC',async()=>{
 const {readFile}=await import('node:fs/promises')
  const [studio,editorV6]=await Promise.all([
   readFile('src/renderer/src/features/studio/StudioPage.tsx','utf8'),
   readFile('src/renderer/src/features/editorV6/EditorV6Page.tsx','utf8')
 ])
 assert.ok(studio.includes("from '../../../../shared/serializedDocumentSave'"))
 assert.ok(editorV6.includes("from '../../../../shared/serializedDocumentSave'"))
 assert.ok(studio.includes('studioSaveQueue.current.run(async () =>'))
 assert.ok(studio.includes('await window.desktop.saveStudio(next)'))
 assert.ok(editorV6.includes('studioSaveQueue.current.run(async () =>'))
 assert.ok(editorV6.includes('await window.desktop.saveEditorV6Project(next)'))
})

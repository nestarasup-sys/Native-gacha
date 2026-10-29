import test from 'node:test'
import assert from 'node:assert/strict'
import { SerializedDocumentSaveQueue } from '../src/shared/serializedDocumentSave.ts'

test('fila de documentos não inverte ordem quando salvamento antigo leva mais tempo',async()=>{
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
test('Studio e Editor V6 usam a fila compartilhada antes de chamar seus canais IPC',async()=>{
 const {readFile}=await import('node:fs/promises')
  const [studio,editorV6,editorPersistence,saveHook]=await Promise.all([
   readFile('src/renderer/src/features/studio/StudioPage.tsx','utf8'),
   readFile('src/renderer/src/features/editorV6/EditorV6Page.tsx','utf8'),
   readFile('src/renderer/src/features/editorV6/useEditorV6DocumentPersistence.ts','utf8'),
   readFile('src/renderer/src/ui/hooks/useSerializedSceneDocumentSave.ts','utf8')
 ])
 assert.match(studio,/useSerializedSceneDocumentSave\(activeStudio, \{/)
  assert.match(editorV6,/useEditorV6DocumentPersistence\(/)
  assert.match(editorPersistence,/useSerializedSceneDocumentSave\(activeProject, \{/)
 assert.match(studio,/window\.desktop\.studio\.saveStudio\(studio\)/)
  assert.match(editorPersistence,/window\.desktop\.editorV6\.saveEditorV6Project\(document\)/)
 assert.match(saveHook,/new SerializedDocumentSaveQueue\(\)/)
 assert.match(saveHook,/queue\.current\.run\(/)
})

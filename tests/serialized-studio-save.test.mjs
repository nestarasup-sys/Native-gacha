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
test('Studio mantém fila serial; Video Studio novo salva cópia por IPC sem sobrescrever o projeto original',async()=>{
 const {readFile}=await import('node:fs/promises')
 const [studio,video,preload]=await Promise.all([
   readFile('src/renderer/src/features/studio/StudioPage.tsx','utf8'),
   readFile('src/renderer/src/features/videoStudioRebuild/VideoStudioRebuildPage.tsx','utf8'),
   readFile('electron/preload.ts','utf8')
 ])
 assert.ok(studio.includes('studioSaveQueue.current.run(async () =>'))
 assert.ok(studio.includes('await window.desktop.saveStudio(next)'))
 assert.match(video,/id:crypto\.randomUUID\(\)/)
 assert.match(video,/await window\.desktop\.saveVideoStudio\(out\)/)
 assert.doesNotMatch(video,/saveVideoStudio\(studio\)/)
 assert.match(preload,/saveVideoStudio: \(studio\) => ipcRenderer\.invoke\('video-studio:save', studio\)/)
})

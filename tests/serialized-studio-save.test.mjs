import test from 'node:test'
import assert from 'node:assert/strict'
import { SerializedDocumentSaveQueue } from '../src/shared/serializedDocumentSave.ts'
import { makeCanvasPrint } from '../src/renderer/src/features/studio/studioCanvasPrint.ts'

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
  const [studio,studioPersistence,editorV6,editorPersistence,saveHook]=await Promise.all([
   readFile('src/renderer/src/features/studio/StudioPage.tsx','utf8'),
   readFile('src/renderer/src/features/studio/useStudioDocumentPersistence.ts','utf8'),
   readFile('src/renderer/src/features/editorV6/EditorV6Page.tsx','utf8'),
   readFile('src/renderer/src/features/editorV6/useEditorV6DocumentPersistence.ts','utf8'),
   readFile('src/renderer/src/ui/hooks/useSerializedSceneDocumentSave.ts','utf8')
 ])
 assert.match(studio,/useStudioDocumentPersistence\(/)
 assert.match(studioPersistence,/useSerializedSceneDocumentSave\(activeStudio, \{/)
  assert.match(editorV6,/useEditorV6DocumentPersistence\(/)
  assert.match(editorPersistence,/useSerializedSceneDocumentSave\(activeProject, \{/)
 assert.match(studioPersistence,/window\.desktop\.studio\.saveStudio\(studio\)/)
  assert.match(editorPersistence,/window\.desktop\.editorV6\.saveEditorV6Project\(document\)/)
 assert.match(saveHook,/new SerializedDocumentSaveQueue\(\)/)
 assert.match(saveHook,/queue\.current\.run\(/)
})

test('renderização do print decodifica fontes únicas em lotes limitados e preserva camadas', async () => {
  const events = []
  const started = []
  let activeDecodes = 0
  let maximumConcurrentDecodes = 0
  const context = {
    scale() {}, fillRect() {}, save() {}, translate() {}, rotate() {}, restore() {},
    beginPath() {}, roundRect() {}, fill() {}, stroke() {}, measureText: (text) => ({ width: text.length * 5 }),
    fillText: (text) => events.push(`text:${text}`),
    drawImage: (image) => events.push(`image:${image.src}`)
  }
  const previousDocument = globalThis.document
  const previousImage = globalThis.Image
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => context, toDataURL: () => 'data:image/png;base64,AA==' }) }
  globalThis.Image = class {
    set src(value) {
      this.source = value
      started.push(value)
      activeDecodes += 1
      maximumConcurrentDecodes = Math.max(maximumConcurrentDecodes, activeDecodes)
      setTimeout(() => { activeDecodes -= 1; this.onload?.() }, 2)
    }
    get src() { return this.source }
  }

  try {
    const asset = (id) => ({ id, category: id === 'background' ? 'background' : 'object', name: id, mimeType: 'image/png', dataUrl: `data:${id}` })
    const element = (id, kind, assetId, zIndex) => ({ id, kind, assetId, text: kind === 'narrator' ? 'fala' : '', x: 0, y: 0, width: 20, height: 10, rotation: 0, zIndex })
    const studio = {
      schemaVersion: 1, id: 'scene', title: 'Cena', color: '#ffffff', createdAt: '', updatedAt: '', backgroundColor: '#000000',
      backgroundAssetId: 'background', backgroundX: 0, backgroundY: 0, backgroundWidth: 100, backgroundHeight: 100, backgroundRotation: 0,
      assets: ['background', 'a', 'b', 'c', 'd'].map(asset),
      elements: [element('a1', 'image', 'a', 1), element('speech', 'narrator', undefined, 2), element('a2', 'image', 'a', 3),
        element('b1', 'image', 'b', 4), element('c1', 'image', 'c', 5), element('d1', 'image', 'd', 6)]
    }

    assert.equal(await makeCanvasPrint(studio), 'data:image/png;base64,AA==')
    assert.deepEqual(started.sort(), ['data:a', 'data:b', 'data:background', 'data:c', 'data:d'])
    assert.equal(maximumConcurrentDecodes, 4)
    assert.deepEqual(events, [
      'image:data:background', 'image:data:a', 'text:fala', 'image:data:a',
      'image:data:b', 'image:data:c', 'image:data:d'
    ])
  } finally {
    if (previousDocument === undefined) delete globalThis.document
    else globalThis.document = previousDocument
    if (previousImage === undefined) delete globalThis.Image
    else globalThis.Image = previousImage
  }
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { registerStudioPrimaryHandlers } from '../electron/domains/studio/primaryIpc.ts'
import { isStudioAsset, isStudioDocument } from '../src/shared/studioValidation.ts'

const ID = '12345678-aaaa-4abc-8abc-123456789abc'
const CHARACTER_ASSET_ID = '22345678-aaaa-4abc-8abc-123456789abc'
function validStudioDocument() {
  return {
    schemaVersion: 1,
    id: ID,
    title: 'Cena de teste',
    color: '#7768c8',
    createdAt: '2026-10-29T10:00:00.000Z',
    updatedAt: '2026-10-29T10:00:00.000Z',
    backgroundColor: '#d7b5cd',
    backgroundAssetId: null,
    backgroundX: 0,
    backgroundY: 0,
    backgroundWidth: 100,
    backgroundHeight: 100,
    backgroundRotation: 0,
    assets: [{ id: CHARACTER_ASSET_ID, category: 'character', name: 'Personagem', mimeType: 'image/png', dataUrl: 'data:image/png;base64,AA==' }],
    elements: [{ id: ID, kind: 'character', characterId: 'character-id', assetId: CHARACTER_ASSET_ID, text: 'Personagem', x: 0, y: 0, width: 100, height: 100, rotation: 0, zIndex: 0 }]
  }
}

test('validação do Studio preserva documento válido e rejeita vínculos ou valores inválidos', () => {
  const valid = validStudioDocument()
  assert.equal(isStudioDocument(valid), true)
  assert.equal(isStudioAsset(valid.assets[0]), true)

  const invalidBackgroundReference = structuredClone(valid)
  invalidBackgroundReference.backgroundAssetId = CHARACTER_ASSET_ID
  assert.equal(isStudioDocument(invalidBackgroundReference), false)

  const invalidCharacterReference = structuredClone(valid)
  invalidCharacterReference.elements[0].assetId = 'missing'
  assert.equal(isStudioDocument(invalidCharacterReference), false)

  const invalidGeometry = structuredClone(valid)
  invalidGeometry.elements[0].width = Infinity
  assert.equal(isStudioDocument(invalidGeometry), false)

  const invalidFaceTransform = structuredClone(valid)
  invalidFaceTransform.elements[0].faceTransforms = { mouth: { x: 0, y: 0, width: 100, height: 100, rotation: NaN } }
  assert.equal(isStudioDocument(invalidFaceTransform), false)
})

function harness() {
  const handlers = new Map()
  const records = []
  let pending = Promise.resolve()
  const deps = {
    ipcMain: { handle(name, callback) {
      assert.equal(handlers.has(name), false, 'canal registrado duas vezes')
      handlers.set(name, callback)
    } },
    assertTrustedSender(event) {
      if (!event || event.trusted !== true) throw new Error('Sender não confiável')
    },
    list: async () => [{ id: ID }],
    write: async document => { records.push('write:' + document.id) },
    remove: async id => { records.push('delete:' + id) },
    getPendingWrites: () => pending,
    setPendingWrites: next => { pending = next },
    measure: async (_name, work) => work()
  }
  registerStudioPrimaryHandlers(deps)
  const invoke = (method, event, ...args) => {
    const handler = handlers.get(method)
    assert.ok(handler, method)
    return handler(event, ...args)
  }
  return { deps, invoke, records, handlers, pending: () => pending }
}
test('Studio registra apenas três canais e valida sender e UUID', async () => {
  const { handlers, invoke, records } = harness()
  assert.deepEqual([...handlers.keys()], ['studio:list','studio:save','studio:delete'])
  assert.equal((await invoke('studio:list', {trusted:true}))[0].id, ID)
  await assert.rejects(invoke('studio:save', {trusted:false}, {id:ID}), /Sender não confiável/)
  await assert.rejects(invoke('studio:delete', {trusted:true}, '../wrong'), /Identificador de Studio inválido/)
  await invoke('studio:save', {trusted:true}, {id:ID})
  await invoke('studio:delete', {trusted:true}, ID)
  assert.deepEqual(records, ['write:'+ID,'delete:'+ID])
})
test('Studio preserva ordem de operações e libera fila depois de falha', async () => {
  const { deps, invoke, pending } = harness()
  const events = []
  let shouldFail = true
  deps.write = async document => {
    events.push('save:'+document.id)
    if (shouldFail) { shouldFail=false; throw Error('falha simulada') }
  }
  deps.remove = async id => { events.push('delete:'+id) }
  const bad = invoke('studio:save', {trusted:true}, {id:ID})
  const good = invoke('studio:save', {trusted:true}, {id:ID})
  const deletion = invoke('studio:delete', {trusted:true}, ID)
  const results = await Promise.allSettled([bad,good,deletion])
  assert.deepEqual(results.map(result=>result.status), ['rejected','fulfilled','fulfilled'])
  await pending()
  assert.deepEqual(events, ['save:'+ID,'save:'+ID,'delete:'+ID])
})

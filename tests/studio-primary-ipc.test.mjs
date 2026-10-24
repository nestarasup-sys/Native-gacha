import test from 'node:test'
import assert from 'node:assert/strict'
import { registerStudioPrimaryHandlers } from '../electron/domains/studio/primaryIpc.ts'

const ID = '12345678-aaaa-4abc-8abc-123456789abc'
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

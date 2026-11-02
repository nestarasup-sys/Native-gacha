import test from 'node:test'
import assert from 'node:assert/strict'
import { createIpcPerformanceCollector } from '../../electron/application/ipcPerformanceCollector.ts'
import { createMeasuredIpcMain } from '../../electron/application/measuredIpcMain.ts'

test('mede handlers registrados sem registrar payloads e repassa remoção dos canais', async () => {
  const handlers = new Map()
  const removed = []
  const collector = createIpcPerformanceCollector({ now: (() => { let time = 0; return () => time += 10 })(), nowIso: () => '2026-11-02T00:00:00.000Z' })
  collector.setEnabled(true)
  const ipcMain = createMeasuredIpcMain({
    handle: (channel, handler) => handlers.set(channel, handler),
    removeHandler: (channel) => removed.push(channel)
  }, (channel, action) => collector.measure(channel, action))

  const privatePayload = { name: 'nome sintético privado', path: 'C:/fixture/segredo.png' }
  ipcMain.handle('customizer:characters:save', (_event, payload) => payload.name)
  assert.equal(await handlers.get('customizer:characters:save')({}, privatePayload), privatePayload.name)

  ipcMain.handle('fabricator:models:publish', () => { throw new Error('falha sintética') })
  await assert.rejects(handlers.get('fabricator:models:publish')({}), /falha sintética/)
  ipcMain.removeHandler('fabricator:models:publish')

  const snapshot = collector.snapshot()
  assert.equal(snapshot.enabled, true)
  assert.deepEqual(snapshot.rows.map(({ channel, calls, failures }) => ({ channel, calls, failures })).sort((a, b) => a.channel.localeCompare(b.channel)), [
    { channel: 'customizer:characters:save', calls: 1, failures: 0 },
    { channel: 'fabricator:models:publish', calls: 1, failures: 1 }
  ])
  assert.deepEqual(removed, ['fabricator:models:publish'])
  assert.equal(JSON.stringify(snapshot).includes(privatePayload.name), false)
  assert.equal(JSON.stringify(snapshot).includes(privatePayload.path), false)
  assert.equal(JSON.stringify(snapshot).includes('falha sintética'), false)
})

test('drena handlers IPC em voo mesmo quando não entram nas métricas', async () => {
  const handlers = new Map()
  let resolveHandler
  const handlerFinished = new Promise((resolve) => { resolveHandler = resolve })
  const ipcMain = createMeasuredIpcMain({
    handle: (channel, handler) => handlers.set(channel, handler),
    removeHandler: () => undefined
  }, (channel, action) => action(), (channel) => !channel.startsWith('app:diagnostics:'))
  ipcMain.handle('app:diagnostics:list', () => handlerFinished)

  const invocation = handlers.get('app:diagnostics:list')({})
  let drained = false
  const drain = ipcMain.drain().then(() => { drained = true })
  await Promise.resolve()
  assert.equal(drained, false)
  resolveHandler()
  await Promise.all([invocation, drain])
  assert.equal(drained, true)
})

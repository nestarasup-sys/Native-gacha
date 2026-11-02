import test from 'node:test'
import assert from 'node:assert/strict'
import { registerDiagnosticsHandlers } from '../electron/domains/storage/diagnosticsIpc.ts'

const eventA = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', at: '2026-11-02T12:00:00.000Z', source: 'renderer', severity: 'error',
  code: 'editor-v6.export-failed', domain: 'editor-v6', operation: 'export.mp4', message: '[credencial redigida]'
}
const eventB = {
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', at: '2026-11-02T12:01:00.000Z', source: 'main', severity: 'warning',
  code: 'storage.read-warning', domain: 'storage', message: '[caminho local]'
}

function harness({ canceled = false } = {}) {
  const handlers = new Map()
  const calls = { list: 0, saveDialog: [], writes: [] }
  registerDiagnosticsHandlers({
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
    assertTrustedSender: (event) => { if (!event.trusted) throw new Error('Remetente IPC não confiável.') },
    log: {
      list: async () => { calls.list += 1; return [eventA, eventB] },
      recordRenderer: async () => undefined
    },
    getRuntimeDiagnostics: async () => { throw new Error('unexpected runtime read') },
    getStorageSummary: async () => { throw new Error('unexpected storage read') },
    listBackups: async () => { throw new Error('unexpected backup read') },
    getAppVersion: () => '1.0.0',
    showSaveDialog: async (_event, options) => { calls.saveDialog.push(options); return canceled ? { canceled: true } : { canceled: false, filePath: 'C:\\reports\\filtered.json' } },
    writeFile: async (path, data) => calls.writes.push({ path, report: JSON.parse(data) })
  })
  return { handler: handlers.get('app:diagnostics:export-events'), calls }
}

test('exports only selected sanitized IDs in requested order through a trusted local save dialog', async () => {
  const { handler, calls } = harness()
  const result = await handler({ trusted: true }, [eventB.id, eventA.id, eventB.id, 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'])

  assert.deepEqual(result, { saved: true, fileName: 'filtered.json', eventCount: 2 })
  assert.equal(calls.list, 1)
  assert.equal(calls.saveDialog[0].title, 'Exportar eventos de diagnóstico')
  assert.deepEqual(calls.writes[0].report.events.map(({ id }) => id), [eventB.id, eventA.id])
  assert.equal(calls.writes[0].report.format, 'native-gacha-diagnostic-events-v1')
  assert.equal(calls.writes[0].report.privacy.reviewBeforeSharing, true)
})

test('rejects untrusted senders and invalid or oversized ID selections before showing the dialog', async () => {
  const { handler, calls } = harness()
  await assert.rejects(handler({ trusted: false }, [eventA.id]), /não confiável/)
  await assert.rejects(handler({ trusted: true }, ['../../private.json']), /Seleção.*inválida/)
  await assert.rejects(handler({ trusted: true }, Array(501).fill(eventA.id)), /Seleção.*inválida/)
  assert.equal(calls.list, 0)
  assert.equal(calls.saveDialog.length, 0)
  assert.equal(calls.writes.length, 0)
})

test('returns a clear cancelled result without writing a file', async () => {
  const { handler, calls } = harness({ canceled: true })
  const result = await handler({ trusted: true }, [eventA.id])
  assert.deepEqual(result, { saved: false, eventCount: 1 })
  assert.equal(calls.writes.length, 0)
})

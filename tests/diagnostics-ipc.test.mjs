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
    getIpcPerformanceSnapshot: () => ({ enabled: false, startedAt: null, durationMs: 0, maxDurationMs: 300000, rows: [] }),
    setIpcPerformanceCollection: (enabled) => ({ enabled, startedAt: enabled ? 'now' : null, durationMs: 0, maxDurationMs: 300000, rows: [] }),
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

test('IPC performance controls require a trusted sender and a boolean opt-in', async () => {
  const handlers = new Map()
  let enabled = false
  const snapshot = () => ({ enabled, startedAt: enabled ? 'now' : null, durationMs: 15, maxDurationMs: 300000, rows: [] })
  registerDiagnosticsHandlers({
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
    assertTrustedSender: (event) => { if (!event.trusted) throw new Error('Remetente IPC não confiável.') },
    log: { list: async () => [], recordRenderer: async () => undefined },
    getRuntimeDiagnostics: async () => ({}),
    getIpcPerformanceSnapshot: snapshot,
    setIpcPerformanceCollection: (next) => { enabled = next; return snapshot() },
    getStorageSummary: async () => ({}), listBackups: async () => [], getAppVersion: () => '1',
    showSaveDialog: async () => ({ canceled: true }), writeFile: async () => undefined
  })
  const read = handlers.get('app:diagnostics:ipc-performance:get')
  const set = handlers.get('app:diagnostics:ipc-performance:set')
  await assert.rejects(set({ trusted: false }, true), /não confiável/)
  await assert.rejects(set({ trusted: true }, 'true'), /inválido/)
  assert.equal((await set({ trusted: true }, true)).enabled, true)
  assert.equal((await read({ trusted: true })).enabled, true)
  assert.equal((await set({ trusted: true }, false)).enabled, false)
})

test('the local diagnostics report includes only explicitly collected aggregated IPC rows', async () => {
  const handlers = new Map()
  const writes = []
  const collected = {
    enabled: false, startedAt: '2026-11-02T12:00:00.000Z', durationMs: 3000, maxDurationMs: 300000,
    rows: [{ channel: 'studio:list', calls: 4, failures: 1, averageMs: 8.25, worstMs: 21.5 }]
  }
  registerDiagnosticsHandlers({
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
    assertTrustedSender: (event) => { if (!event.trusted) throw new Error('Remetente IPC não confiável.') },
    log: { list: async () => [eventA], recordRenderer: async () => undefined },
    getRuntimeDiagnostics: async () => ({ measuredAt: '2026-11-02T12:00:00.000Z', processMetrics: { processes: [] } }),
    getIpcPerformanceSnapshot: () => collected,
    setIpcPerformanceCollection: () => collected,
    getStorageSummary: async () => ({ disk: {}, catalog: {} }), listBackups: async () => [], getAppVersion: () => '1.0.0',
    showSaveDialog: async () => ({ canceled: false, filePath: 'C:\\reports\\diagnostics.json' }),
    writeFile: async (_path, text) => writes.push(JSON.parse(text))
  })
  const result = await handlers.get('app:diagnostics:export')({ trusted: true })
  assert.equal(result.saved, true)
  assert.deepEqual(writes[0].performance.ipc.rows, collected.rows)
  assert.equal('diagnostics' in writes[0], false)
})

test('the report includes only bounded quick-check results when supplied by a trusted renderer', async () => {
  const handlers = new Map()
  const writes = []
  registerDiagnosticsHandlers({
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
    assertTrustedSender: (event) => { if (!event.trusted) throw new Error('Remetente IPC não confiável.') },
    log: { list: async () => [], recordRenderer: async () => undefined },
    getRuntimeDiagnostics: async () => ({ measuredAt: '2026-11-02T12:00:00.000Z', processMetrics: { processes: [] } }),
    getIpcPerformanceSnapshot: () => ({ enabled: false, startedAt: null, durationMs: 0, maxDurationMs: 300000, rows: [] }),
    setIpcPerformanceCollection: () => ({}),
    getStorageSummary: async () => ({ disk: {}, catalog: {} }), listBackups: async () => [], getAppVersion: () => '1.0.0',
    showSaveDialog: async () => ({ canceled: false, filePath: 'C:\\reports\\diagnostics.json' }),
    writeFile: async (_path, text) => writes.push(JSON.parse(text))
  })
  const handler = handlers.get('app:diagnostics:export')
  const quickChecks = {
    startedAt: '2026-11-02T12:00:00.000Z', completedAt: '2026-11-02T12:00:01.000Z', cancelled: false,
    results: [
      { id: 'runtime', status: 'passed', durationMs: 20, itemsChecked: 3 },
      { id: 'events', status: 'failed', durationMs: 10, itemsChecked: 0 }
    ]
  }
  await assert.rejects(handler({ trusted: false }, quickChecks), /não confiável/)
  await assert.rejects(handler({ trusted: true }, { ...quickChecks, unexpected: 'private data' }), /verificações rápidas inválido/)
  await assert.rejects(handler({ trusted: true }, { ...quickChecks, results: [...quickChecks.results, ...quickChecks.results] }), /verificações rápidas inválido/)
  assert.equal(writes.length, 0)

  const result = await handler({ trusted: true }, quickChecks)
  assert.equal(result.saved, true)
  assert.deepEqual(writes[0].diagnostics.quickChecks, quickChecks)
})

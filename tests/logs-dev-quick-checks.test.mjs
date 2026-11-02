import test from 'node:test'
import assert from 'node:assert/strict'
import { runLogsDevQuickChecks } from '../src/renderer/src/features/options/logsDevQuickChecks.ts'

const runtime = {
  measuredAt: '2026-11-02T12:00:00.000Z', appVersion: '1.0.0',
  processMetrics: { processes: [{ pid: 10 }, { pid: 11 }] }
}

function dependencies(overrides = {}) {
  let clock = 0
  return {
    getRuntimeDiagnostics: async () => runtime,
    listLocalDiagnosticEvents: async () => [{ id: 'event-1' }],
    listDataBackups: async () => [],
    now: () => (clock += 8),
    nowIso: () => '2026-11-02T12:00:00.000Z',
    ...overrides
  }
}

test('runs the three bounded, read-only checks in order and stores only counts and durations', async () => {
  const calls = []
  const snapshot = await runLogsDevQuickChecks(dependencies({
    getRuntimeDiagnostics: async () => { calls.push('runtime'); return runtime },
    listLocalDiagnosticEvents: async () => { calls.push('events'); return [{ id: 'private-event' }] },
    listDataBackups: async () => { calls.push('backups'); return [{ id: 'private-backup' }] }
  }), new AbortController().signal)

  assert.deepEqual(calls, ['runtime', 'events', 'backups'])
  assert.deepEqual(snapshot.results.map(({ id, status, itemsChecked }) => ({ id, status, itemsChecked })), [
    { id: 'runtime', status: 'passed', itemsChecked: 2 },
    { id: 'events', status: 'passed', itemsChecked: 1 },
    { id: 'backups', status: 'passed', itemsChecked: 1 }
  ])
  assert.ok(snapshot.results.every(({ durationMs }) => durationMs >= 0 && durationMs <= 300_000))
  assert.equal(JSON.stringify(snapshot).includes('private-'), false)
  assert.equal(snapshot.cancelled, false)
})

test('records a failed contract without leaking its error and continues to the remaining checks', async () => {
  const snapshot = await runLogsDevQuickChecks(dependencies({
    getRuntimeDiagnostics: async () => { throw new Error('C:\\Users\\luiz\\private-data') },
    listLocalDiagnosticEvents: async () => [],
    listDataBackups: async () => []
  }), new AbortController().signal)

  assert.deepEqual(snapshot.results.map(({ id, status }) => ({ id, status })), [
    { id: 'runtime', status: 'failed' }, { id: 'events', status: 'passed' }, { id: 'backups', status: 'passed' }
  ])
  assert.equal(JSON.stringify(snapshot).includes('private-data'), false)
})

test('cancellation stops before starting the next IPC and reports the completed call', async () => {
  const controller = new AbortController()
  const calls = []
  const snapshot = await runLogsDevQuickChecks(dependencies({
    getRuntimeDiagnostics: async () => { calls.push('runtime'); controller.abort(); return runtime },
    listLocalDiagnosticEvents: async () => { calls.push('events'); return [] },
    listDataBackups: async () => { calls.push('backups'); return [] }
  }), controller.signal)

  assert.deepEqual(calls, ['runtime'])
  assert.equal(snapshot.cancelled, true)
  assert.deepEqual(snapshot.results.map(({ id }) => id), ['runtime'])
})

test('an already cancelled run starts no checks', async () => {
  const controller = new AbortController()
  controller.abort()
  const snapshot = await runLogsDevQuickChecks(dependencies(), controller.signal)
  assert.equal(snapshot.cancelled, true)
  assert.deepEqual(snapshot.results, [])
})

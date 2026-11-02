import test from 'node:test'
import assert from 'node:assert/strict'
import { isDiagnosticsQuickCheckSnapshotWithinBridgeLimits } from '../../electron/application/diagnosticQuickCheckInput.ts'

const valid = {
  startedAt: '2026-11-02T12:00:00.000Z',
  completedAt: '2026-11-02T12:00:01.000Z',
  cancelled: false,
  results: [
    { id: 'runtime', status: 'passed', durationMs: 25, itemsChecked: 4 },
    { id: 'events', status: 'failed', durationMs: 0, itemsChecked: 0 }
  ]
}

test('accepts only the bounded quick-check summary contract', () => {
  assert.equal(isDiagnosticsQuickCheckSnapshotWithinBridgeLimits(valid), true)
  assert.equal(isDiagnosticsQuickCheckSnapshotWithinBridgeLimits({ ...valid, results: [] }), true)
})

test('rejects extra fields, malformed dates, duplicate checks and excessive result counts', () => {
  assert.equal(isDiagnosticsQuickCheckSnapshotWithinBridgeLimits({ ...valid, path: 'C:\\private' }), false)
  assert.equal(isDiagnosticsQuickCheckSnapshotWithinBridgeLimits({ ...valid, startedAt: '2026-11-02' }), false)
  assert.equal(isDiagnosticsQuickCheckSnapshotWithinBridgeLimits({ ...valid, results: [valid.results[0], valid.results[0]] }), false)
  assert.equal(isDiagnosticsQuickCheckSnapshotWithinBridgeLimits({ ...valid, results: Array(4).fill(valid.results[0]) }), false)
  assert.equal(isDiagnosticsQuickCheckSnapshotWithinBridgeLimits({ ...valid, results: [{ ...valid.results[0], durationMs: 300_001 }] }), false)
  assert.equal(isDiagnosticsQuickCheckSnapshotWithinBridgeLimits({ ...valid, results: [{ ...valid.results[0], itemsChecked: 1_000_001 }] }), false)
  assert.equal(isDiagnosticsQuickCheckSnapshotWithinBridgeLimits({ ...valid, results: [{ ...valid.results[0], id: 'delete-everything' }] }), false)
  assert.equal(isDiagnosticsQuickCheckSnapshotWithinBridgeLimits({ ...valid, results: [{ ...valid.results[0], private: 'secret' }] }), false)
  assert.equal(isDiagnosticsQuickCheckSnapshotWithinBridgeLimits(null), false)
})

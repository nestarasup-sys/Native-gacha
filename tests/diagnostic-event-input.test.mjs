import test from 'node:test'
import assert from 'node:assert/strict'
import { isDiagnosticEventInputWithinBridgeLimits } from '../electron/application/diagnosticEventInput.ts'

const valid = { severity: 'error', code: 'renderer.failure', message: 'fixture' }

test('accepts current and optional structured event fields within the bridge size limit', () => {
  assert.equal(isDiagnosticEventInputWithinBridgeLimits(valid), true)
  assert.equal(isDiagnosticEventInputWithinBridgeLimits({
    ...valid, domain: 'editor-v6', operation: 'export.mp4', stage: 'encode', result: 'failure', durationMs: 12,
    correlationId: '123e4567-e89b-42d3-a456-426614174000', route: '/logs-dev'
  }), true)
})

test('rejects excessive text and unknown fields before crossing Electron IPC', () => {
  assert.equal(isDiagnosticEventInputWithinBridgeLimits({ ...valid, message: 'x'.repeat(16_385) }), false)
  assert.equal(isDiagnosticEventInputWithinBridgeLimits({ ...valid, route: `/${'x'.repeat(600)}` }), false)
  assert.equal(isDiagnosticEventInputWithinBridgeLimits({ ...valid, extra: 'unbounded payload' }), false)
  assert.equal(isDiagnosticEventInputWithinBridgeLimits([]), false)
  assert.equal(isDiagnosticEventInputWithinBridgeLimits(null), false)
})

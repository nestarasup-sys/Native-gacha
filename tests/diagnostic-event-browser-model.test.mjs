import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_DIAGNOSTIC_EVENT_FILTERS, filterDiagnosticEvents } from '../src/renderer/src/features/options/diagnosticEventBrowserModel.ts'

const event = (overrides = {}) => ({
  id: 'id', at: '2026-11-02T12:30:00.000Z', source: 'renderer', severity: 'error',
  code: 'customizer.save-failed', message: 'Falha ao salvar personagem', ...overrides
})
const localTime = (minute, second = 0) => new Date(2026, 10, 2, 12, minute, second).toISOString()

test('combines normalized text, severity, domain and process filters without mutating events', () => {
  const events = [
    event({ id: 'renderer', domain: 'customizer' }),
    event({ id: 'main', source: 'main', domain: 'storage', severity: 'warning', code: 'storage.read-warning', message: 'Leitura parcial' }),
    event({ id: 'legacy', severity: 'info', at: '2026-11-02T12:31:00.000Z' })
  ]
  const original = structuredClone(events)
  const result = filterDiagnosticEvents(events, {
    ...DEFAULT_DIAGNOSTIC_EVENT_FILTERS,
    search: 'FALHA AO SALVAR', severity: 'error', domain: 'customizer', source: 'renderer'
  })

  assert.deepEqual(result.map(({ id }) => id), ['renderer'])
  assert.deepEqual(events, original)
})

test('searches optional metadata and classifies historic events without a domain', () => {
  const events = [
    event({ id: 'structured', domain: 'editor-v6', operation: 'export.mp4', stage: 'encode', result: 'failure' }),
    event({ id: 'legacy', domain: undefined })
  ]
  assert.deepEqual(filterDiagnosticEvents(events, {
    ...DEFAULT_DIAGNOSTIC_EVENT_FILTERS, search: 'ENCODE'
  }).map(({ id }) => id), ['structured'])
  assert.deepEqual(filterDiagnosticEvents(events, {
    ...DEFAULT_DIAGNOSTIC_EVENT_FILTERS, domain: 'unclassified'
  }).map(({ id }) => id), ['legacy'])
})

test('sorts oldest/newest stably and applies a local datetime interval inclusively', () => {
  const events = [
    event({ id: 'later', at: localTime(31) }),
    event({ id: 'first', at: localTime(30, 1) }),
    event({ id: 'second', at: localTime(30, 59) }),
    event({ id: 'bad-date', at: 'invalid' })
  ]
  const selected = filterDiagnosticEvents(events, {
    ...DEFAULT_DIAGNOSTIC_EVENT_FILTERS,
    from: '2026-11-02T12:30', to: '2026-11-02T12:30', order: 'oldest'
  })

  assert.deepEqual(selected.map(({ id }) => id), ['first', 'second'])
  assert.deepEqual(filterDiagnosticEvents(events, {
    ...DEFAULT_DIAGNOSTIC_EVENT_FILTERS, order: 'newest'
  }).map(({ id }) => id), ['later', 'second', 'first', 'bad-date'])
})

test('ignores malformed date bounds and supports the info severity', () => {
  const events = [event({ id: 'info', severity: 'info' }), event({ id: 'warning', severity: 'warning' })]
  assert.deepEqual(filterDiagnosticEvents(events, {
    ...DEFAULT_DIAGNOSTIC_EVENT_FILTERS, severity: 'info', from: 'bad-date'
  }).map(({ id }) => id), ['info'])
})

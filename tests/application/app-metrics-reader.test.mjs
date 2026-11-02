import test from 'node:test'
import assert from 'node:assert/strict'
import { createAppMetricsReader } from '../../electron/application/appMetricsReader.ts'

test('a primeira leitura não inventa uma janela de CPU e a seguinte informa o intervalo exato', () => {
  let now = 100
  let calls = 0
  const reader = createAppMetricsReader(() => { calls += 1; return [{ pid: calls }] }, () => now)

  assert.deepEqual(reader(), { metrics: [{ pid: 1 }], sampleIntervalMs: null })
  now = 850
  assert.deepEqual(reader(), { metrics: [{ pid: 2 }], sampleIntervalMs: 750 })
  assert.equal(calls, 2)
})

test('um relógio regressivo não produz duração negativa', () => {
  let now = 500
  const reader = createAppMetricsReader(() => [], () => now)
  reader()
  now = 450
  assert.equal(reader().sampleIntervalMs, 0)
})

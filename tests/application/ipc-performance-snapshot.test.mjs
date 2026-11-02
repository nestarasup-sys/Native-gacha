import test from 'node:test'
import assert from 'node:assert/strict'
import { createIpcPerformanceSnapshot } from '../../electron/ipcPerformanceSnapshot.ts'

test('snapshot IPC retorna métricas numéricas ordenadas pela inserção sem incluir payloads', () => {
  const metrics = new Map([
    ['editor-v6:projects:list', { calls: 4, failures: 1, totalMs: 359.12, worstMs: 148.553 }],
    ['studio:projects:list', { calls: 0, failures: 0, totalMs: 0, worstMs: 0 }],
  ])

  assert.deepEqual(createIpcPerformanceSnapshot(metrics), [
    { channel: 'editor-v6:projects:list', calls: 4, failures: 1, averageMs: 89.78, worstMs: 148.55 },
    { channel: 'studio:projects:list', calls: 0, failures: 0, averageMs: 0, worstMs: 0 },
  ])
})

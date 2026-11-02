import test from 'node:test'
import assert from 'node:assert/strict'
import { createIpcPerformanceCollector, MAX_IPC_PERFORMANCE_COLLECTION_MS } from '../electron/application/ipcPerformanceCollector.ts'

test('IPC permanece desligado por padrão e a coleta registra somente rótulos de canal seguros', async () => {
  let now = 0
  let clockReads = 0
  const collector = createIpcPerformanceCollector({ now: () => { clockReads += 1; return now }, nowIso: () => '2026-11-02T12:00:00.000Z' })
  assert.equal(collector.snapshot().enabled, false)
  clockReads = 0
  await collector.measure('studio:list', () => { now += 10 })
  assert.equal(clockReads, 0)
  assert.deepEqual(collector.snapshot().rows, [])

  collector.setEnabled(true)
  await collector.measure('studio:list', () => { now += 15 })
  await assert.rejects(collector.measure('editor-v6:projects:save', () => { now += 25; throw new Error('fixture') }), /fixture/)
  await collector.measure('C:\\Users\\luiz\\private', () => { now += 90 })

  const snapshot = collector.snapshot()
  assert.equal(snapshot.enabled, true)
  assert.equal(snapshot.rows.length, 2)
  assert.deepEqual(snapshot.rows[0], { channel: 'editor-v6:projects:save', calls: 1, failures: 1, averageMs: 25, worstMs: 25 })
  assert.deepEqual(snapshot.rows[1], { channel: 'studio:list', calls: 1, failures: 0, averageMs: 15, worstMs: 15 })
})

test('parar preserva o resumo até a próxima sessão e iniciar novamente limpa os valores anteriores', async () => {
  let now = 50
  const collector = createIpcPerformanceCollector({ now: () => now, nowIso: () => new Date(now).toISOString() })
  collector.setEnabled(true)
  await collector.measure('customizer:characters:list', () => { now += 12 })
  const stopped = collector.setEnabled(false)
  assert.equal(stopped.enabled, false)
  assert.equal(stopped.rows[0].calls, 1)
  now += 100
  const restarted = collector.setEnabled(true)
  assert.equal(restarted.rows.length, 0)
  assert.equal(restarted.enabled, true)
})

test('a coleta encerra no limite máximo e não registra operações fora da janela', async () => {
  let now = 0
  const collector = createIpcPerformanceCollector({ now: () => now, maxDurationMs: 100, nowIso: () => '2026-11-02T12:00:00.000Z' })
  collector.setEnabled(true)
  await collector.measure('studio:list', () => { now = 99 })
  now = 100
  const expired = collector.snapshot()
  assert.equal(expired.enabled, false)
  assert.equal(expired.durationMs, 100)
  assert.equal(expired.maxDurationMs, 100)
  assert.equal(MAX_IPC_PERFORMANCE_COLLECTION_MS, 300_000)
})

test('parar durante uma chamada não mascara erro nem adiciona medição após o encerramento', async () => {
  let now = 0
  const collector = createIpcPerformanceCollector({ now: () => now, nowIso: () => '2026-11-02T12:00:00.000Z' })
  collector.setEnabled(true)
  let finish
  const pending = collector.measure('studio:save', () => new Promise((resolve) => { finish = resolve }))
  now = 10
  collector.setEnabled(false)
  now = 30
  finish('done')
  assert.equal(await pending, 'done')
  assert.deepEqual(collector.snapshot().rows, [])

  collector.setEnabled(true)
  await assert.rejects(collector.measure('studio:save', async () => { now += 5; throw new Error('preserved failure') }), /preserved failure/)
  assert.equal(collector.snapshot().rows[0].failures, 1)
})

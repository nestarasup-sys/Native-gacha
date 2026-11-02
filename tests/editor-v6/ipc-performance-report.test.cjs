const test = require('node:test')
const assert = require('node:assert/strict')
const { parseIpcPerformanceReport } = require('../../scripts/editor-v6/ipc-performance-report.cjs')

test('relatório offscreen lê o snapshot IPC JSON sem depender da formatação da tabela', () => {
  const metrics = [
    { channel: 'editor-v6:projects:save', calls: 2, failures: 0, averageMs: 101.25, worstMs: 125.5 },
  ]

  assert.deepEqual(
    parseIpcPerformanceReport(`log anterior\n[GV5_IPC_PERF_JSON] ${JSON.stringify(metrics)}\n`),
    { status: 'captured', metrics },
  )
})

test('relatório offscreen diferencia snapshot ausente e rejeita payload inválido', () => {
  assert.deepEqual(parseIpcPerformanceReport('saída sem snapshot'), { status: 'missing', metrics: [] })
  assert.throws(
    () => parseIpcPerformanceReport('[GV5_IPC_PERF_JSON] [{"channel":"bad","calls":1}]'),
    /contrato de métricas esperado/,
  )
})

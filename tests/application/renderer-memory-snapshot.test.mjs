import test from 'node:test'
import assert from 'node:assert/strict'
import { selectRendererMemorySnapshot } from '../../electron/application/rendererMemorySnapshot.ts'
import { registerDiagnosticsHandlers } from '../../electron/domains/storage/diagnosticsIpc.ts'

const unavailableMemory = {
  rendererWorkingSetBytes: null,
  rendererPeakWorkingSetBytes: null,
  rendererPrivateBytes: null,
  rendererSharedBytes: null
}

test('seleciona as métricas pelo PID do renderer desta janela e converte KB para bytes', () => {
  const metrics = [
    { pid: 11, memory: { workingSetSize: 100, peakWorkingSetSize: 150, privateBytes: 60 } },
    { pid: 42, memory: { workingSetSize: 12.5, peakWorkingSetSize: 20, privateBytes: 8 } }
  ]

  assert.deepEqual(selectRendererMemorySnapshot(metrics, { getOSProcessId: () => 42 }), {
    rendererWorkingSetBytes: 12800,
    rendererPeakWorkingSetBytes: 20480,
    rendererPrivateBytes: 8192,
    rendererSharedBytes: null
  })
})

test('métricas ausentes e campos opcionais permanecem nulos no contrato', () => {
  assert.deepEqual(selectRendererMemorySnapshot([], { getOSProcessId: () => 42 }), unavailableMemory)
  assert.deepEqual(selectRendererMemorySnapshot([
    { pid: 42, memory: { workingSetSize: 10, peakWorkingSetSize: 12 } }
  ], { getOSProcessId: () => 42 }), {
    rendererWorkingSetBytes: 10240,
    rendererPeakWorkingSetBytes: 12288,
    rendererPrivateBytes: null,
    rendererSharedBytes: null
  })
})

function diagnosticsHarness() {
  const handlers = new Map()
  const runtime = { measuredAt: '2026-11-01T00:00:00.000Z' }
  let runtimeCalls = 0
  registerDiagnosticsHandlers({
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
    assertTrustedSender: (event) => {
      if (event?.trusted !== true) throw new Error('Sender não confiável')
    },
    log: { list: async () => [], recordRenderer: async () => {} },
    getRuntimeDiagnostics: async () => { runtimeCalls += 1; return runtime },
    getStorageSummary: async () => ({ disk: {}, catalog: {} }),
    listBackups: async () => [],
    getAppVersion: () => '0.1.0',
    showSaveDialog: async () => ({ canceled: true }),
    writeFile: async () => {}
  })
  return { handlers, runtime, getRuntimeCalls: () => runtimeCalls }
}

test('handler IPC de diagnóstico recusa sender não confiável antes de coletar dados', async () => {
  const harness = diagnosticsHarness()
  const handler = harness.handlers.get('app:diagnostics:runtime')

  await assert.rejects(handler({ trusted: false }), /Sender não confiável/)
  assert.equal(harness.getRuntimeCalls(), 0)
})

test('handler IPC retorna diagnóstico somente depois da validação do sender', async () => {
  const harness = diagnosticsHarness()
  const handler = harness.handlers.get('app:diagnostics:runtime')

  assert.deepEqual(await handler({ trusted: true }), harness.runtime)
  assert.equal(harness.getRuntimeCalls(), 1)
})

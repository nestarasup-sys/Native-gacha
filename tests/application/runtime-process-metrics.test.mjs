import test from 'node:test'
import assert from 'node:assert/strict'
import { mapRuntimeProcessMetrics } from '../../electron/application/runtimeProcessMetrics.ts'

const metric = ({ pid, type, name, serviceName, cpu = 0, memory = {} }) => ({
  pid, type, name, serviceName,
  cpu: { percentCPUUsage: cpu, idleWakeupsPerSecond: 0 },
  memory: { workingSetSize: 100, peakWorkingSetSize: 180, privateBytes: 60, ...memory }
})

test('mapeia Main, renderer e auxiliares pelo PID e converte memória de KB para bytes', () => {
  const result = mapRuntimeProcessMetrics([
    metric({ pid: 10, type: 'Browser', name: 'electron', cpu: 8.5, memory: { workingSetSize: 512, peakWorkingSetSize: 768, privateBytes: 256 } }),
    metric({ pid: 20, type: 'Tab', name: 'Native-gacha', cpu: 12, memory: { workingSetSize: 1024, peakWorkingSetSize: 1536, privateBytes: 512 } }),
    metric({ pid: 30, type: 'Utility', serviceName: 'Network Service', cpu: 0.5, memory: { workingSetSize: 64 } })
  ], { mainPid: 10, rendererPid: 20, sampleIntervalMs: 800 })

  assert.deepEqual(result.map(({ kind, label, cpuPercent, workingSetBytes, peakWorkingSetBytes, privateBytes }) => ({
    kind, label, cpuPercent, workingSetBytes, peakWorkingSetBytes, privateBytes
  })), [
    { kind: 'main', label: 'Electron Main', cpuPercent: 8.5, workingSetBytes: 524288, peakWorkingSetBytes: 786432, privateBytes: 262144 },
    { kind: 'renderer', label: 'Janela do Native-gacha', cpuPercent: 12, workingSetBytes: 1048576, peakWorkingSetBytes: 1572864, privateBytes: 524288 },
    { kind: 'auxiliary', label: 'Network Service', cpuPercent: 0.5, workingSetBytes: 65536, peakWorkingSetBytes: 184320, privateBytes: 61440 }
  ])
})

test('CPU da primeira leitura e campos de memória ausentes são apresentados como indisponíveis', () => {
  const result = mapRuntimeProcessMetrics([
    metric({ pid: 10, type: 'Browser', cpu: 0, memory: { workingSetSize: 24, peakWorkingSetSize: undefined, privateBytes: undefined } })
  ], { mainPid: 10, rendererPid: 20, sampleIntervalMs: null })

  assert.equal(result[0].cpuPercent, null)
  assert.equal(result[0].workingSetBytes, 24576)
  assert.equal(result[0].peakWorkingSetBytes, null)
  assert.equal(result[0].privateBytes, null)
})

test('nomes que contêm caminhos ou URLs não entram na métrica local exportável', () => {
  const result = mapRuntimeProcessMetrics([
    metric({ pid: 30, type: 'Utility', serviceName: 'C:\\Users\\luiz\\AppData', name: 'https://local.test/profile' })
  ], { mainPid: 10, rendererPid: 20, sampleIntervalMs: 500 })

  assert.equal(result[0].label, 'Processo auxiliar')
  assert.doesNotMatch(JSON.stringify(result), /Users|local\.test|AppData/)
})

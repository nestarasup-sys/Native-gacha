import { describe, expect, it } from 'vitest'
import {
  createEditorV6ExportProcessMemoryReport,
  recordEditorV6ExportProcessMemorySample,
  recordEditorV6ExportProcessMemorySampleFailure
} from '../../electron/domains/editorV6/exportProcessMemory'

describe('memória dos processos Electron durante exportação do Editor V6', () => {
  it('converte KB para bytes e registra picos por tipo sem guardar PIDs', () => {
    const report = createEditorV6ExportProcessMemoryReport()
    recordEditorV6ExportProcessMemorySample(report, [
      { type: 'Browser', memory: { workingSetSize: 100, privateBytes: 60 } },
      { type: 'Tab', memory: { workingSetSize: 12.5, privateBytes: 8 } },
      { type: 'Tab', memory: { workingSetSize: 10, privateBytes: 7 } },
      { type: 'GPU', memory: { workingSetSize: 15, privateBytes: 9 } }
    ])

    expect(report).toMatchObject({
      sampleCount: 1,
      failedSamples: 0,
      workingSetCompleteSamples: 1,
      privateBytesCompleteSamples: 1,
      peakTotalWorkingSetBytes: 140800,
      peakTotalPrivateBytes: 86016,
      peakByType: {
        Browser: { processCount: 1, workingSetBytes: 102400, privateBytes: 61440 },
        Tab: { processCount: 2, workingSetBytes: 23040, privateBytes: 15360 },
        GPU: { processCount: 1, workingSetBytes: 15360, privateBytes: 9216 }
      }
    })
    expect(JSON.stringify(report)).not.toMatch(/pid|processName/i)
  })

  it('mantém picos completos quando uma amostra posterior não fornece todos os campos', () => {
    const report = createEditorV6ExportProcessMemoryReport()
    recordEditorV6ExportProcessMemorySample(report, [
      { type: 'Browser', memory: { workingSetSize: 100, privateBytes: 60 } },
      { type: 'Tab', memory: { workingSetSize: 20, privateBytes: 12 } }
    ])
    recordEditorV6ExportProcessMemorySample(report, [
      { type: 'Browser', memory: { workingSetSize: 150 } },
      { type: 'Tab', memory: { workingSetSize: 30, privateBytes: 13 } }
    ])
    recordEditorV6ExportProcessMemorySampleFailure(report)

    expect(report).toMatchObject({
      sampleCount: 2,
      failedSamples: 1,
      workingSetCompleteSamples: 2,
      privateBytesCompleteSamples: 1,
      peakTotalWorkingSetBytes: 184320,
      peakTotalPrivateBytes: 73728,
      peakByType: {
        Browser: { processCount: 1, workingSetBytes: 153600, privateBytes: 61440 },
        Tab: { processCount: 1, workingSetBytes: 30720, privateBytes: 13312 }
      }
    })
  })
})

import { describe, expect, it } from 'vitest'
import { createElectronChildProcessDiagnostic } from '../../electron/application/electronChildProcessDiagnostic'

describe('diagnóstico de encerramento de processos auxiliares Electron', () => {
  it('registra OOM de GPU como erro sem expor identificadores de processo', () => {
    const diagnostic = createElectronChildProcessDiagnostic({ type: 'GPU', reason: 'oom', exitCode: -36861 })

    expect(diagnostic).toMatchObject({
      severity: 'error',
      code: 'electron.child-process-gone',
      domain: 'electron',
      operation: 'electron.child-process-gone',
      stage: 'unexpected-exit',
      result: 'failure',
      message: 'Processo auxiliar GPU encerrou (oom; código -36861; Crashpad_NotConnectedToHandler).'
    })
    expect(JSON.stringify(diagnostic)).not.toMatch(/pid|serviceName|processName/i)
  })

  it('nomeia o código Crashpad positivo sem presumir OOM', () => {
    expect(createElectronChildProcessDiagnostic({ type: 'Renderer', reason: 'crashed', exitCode: 36861 })).toMatchObject({
      severity: 'error',
      message: 'Processo auxiliar Renderer encerrou (crashed; código 36861; Crashpad_NotConnectedToHandler).'
    })
  })

  it('registra encerramento forçado recuperável como aviso', () => {
    expect(createElectronChildProcessDiagnostic({ type: 'Utility', reason: 'killed', exitCode: 0 })).toMatchObject({
      severity: 'warning',
      code: 'electron.child-process-gone',
      result: 'failure'
    })
  })

  it('ignora a saída limpa dos subprocessos', () => {
    expect(createElectronChildProcessDiagnostic({ type: 'GPU', reason: 'clean-exit', exitCode: 0 })).toBeUndefined()
  })
})

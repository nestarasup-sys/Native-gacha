import type { LocalDiagnosticEventInput } from '../../src/shared/dataManagement'

const errorReasons = new Set<Electron.Details['reason']>([
  'abnormal-exit',
  'crashed',
  'integrity-failure',
  'launch-failed',
  'oom'
])

/** Maps unexpected Chromium helper exits to privacy-safe local diagnostics. */
export function createElectronChildProcessDiagnostic(
  details: Pick<Electron.Details, 'type' | 'reason' | 'exitCode'>
): LocalDiagnosticEventInput | undefined {
  if (details.reason === 'clean-exit') return undefined

  return {
    severity: errorReasons.has(details.reason) ? 'error' : 'warning',
    code: 'electron.child-process-gone',
    domain: 'electron',
    operation: 'electron.child-process-gone',
    stage: 'unexpected-exit',
    result: 'failure',
    message: `Processo auxiliar ${details.type} encerrou (${details.reason}; código ${details.exitCode}).`
  }
}

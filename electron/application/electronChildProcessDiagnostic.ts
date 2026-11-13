import type { LocalDiagnosticEventInput } from '../../src/shared/dataManagement'

const errorReasons = new Set<Electron.Details['reason']>([
  'abnormal-exit',
  'crashed',
  'integrity-failure',
  'launch-failed',
  'oom'
])
const CRASHPAD_NOT_CONNECTED_EXIT_CODE = 36861

/** Maps unexpected Chromium helper exits to privacy-safe local diagnostics. */
export function createElectronChildProcessDiagnostic(
  details: Pick<Electron.Details, 'type' | 'reason' | 'exitCode'>
): LocalDiagnosticEventInput | undefined {
  if (details.reason === 'clean-exit') return undefined
  const crashpadNote = Math.abs(details.exitCode) === CRASHPAD_NOT_CONNECTED_EXIT_CODE
    ? '; Crashpad_NotConnectedToHandler'
    : ''

  return {
    severity: errorReasons.has(details.reason) ? 'error' : 'warning',
    code: 'electron.child-process-gone',
    domain: 'electron',
    operation: 'electron.child-process-gone',
    stage: 'unexpected-exit',
    result: 'failure',
    message: `Processo auxiliar ${details.type} encerrou (${details.reason}; código ${details.exitCode}${crashpadNote}).`
  }
}

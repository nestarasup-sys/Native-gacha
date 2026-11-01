type DiagnosticSeverity = 'error' | 'warning' | 'info'

function currentSafeRoute(): string {
  const hashRoute = window.location.hash.startsWith('#/') ? window.location.hash.slice(1).split(/[?#]/, 1)[0] : ''
  const path = hashRoute || window.location.pathname.split(/[?#]/, 1)[0]
  return ['/', '/customizar', '/estudio', '/editor-v6', '/roteiros', '/base-videos', '/opcoes', '/fabricador-dev'].includes(path)
    ? path
    : '(outra rota)'
}

function messageOf(reason: unknown): string {
  if (reason instanceof Error) return `${reason.name}: ${reason.message}`
  if (typeof reason === 'string') return reason
  return 'O aplicativo recebeu uma falha sem mensagem textual.'
}

export function recordLocalRendererDiagnostic(code: string, reason: unknown, severity: DiagnosticSeverity = 'error'): void {
  try {
    void window.desktop.dataManagement.recordLocalDiagnosticEvent({
      severity,
      code,
      route: currentSafeRoute(),
      message: messageOf(reason)
    }).catch(() => undefined)
  } catch { /* Logging must never interfere with the app's error recovery. */ }
}

export function installRendererDiagnosticCapture(): () => void {
  const onError = (event: ErrorEvent) => {
    recordLocalRendererDiagnostic('renderer.uncaught-error', event.error ?? event.message ?? 'Erro não identificado.')
  }
  const onUnhandledRejection = (event: PromiseRejectionEvent) => {
    recordLocalRendererDiagnostic('renderer.unhandled-rejection', event.reason)
  }
  window.addEventListener('error', onError)
  window.addEventListener('unhandledrejection', onUnhandledRejection)
  return () => {
    window.removeEventListener('error', onError)
    window.removeEventListener('unhandledrejection', onUnhandledRejection)
  }
}

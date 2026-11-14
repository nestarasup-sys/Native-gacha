/** Preserve useful details when errors cross Electron or browser boundaries. */
export function formatEditorV6Error(error: unknown): string {
  if (error instanceof Error) {
    const cause = error.cause === undefined ? '' : ` | causa: ${formatEditorV6Error(error.cause)}`
    return `${error.name || 'Error'}: ${error.message || '(sem mensagem)'}${cause}`
  }
  if (error && typeof error === 'object') {
    const value = error as Record<string, unknown>
    const name = typeof value.name === 'string' ? value.name : ''
    const message = typeof value.message === 'string' ? value.message : ''
    const code = typeof value.code === 'string' || typeof value.code === 'number' ? ` [código ${value.code}]` : ''
    const stderr = typeof value.stderr === 'string' && value.stderr.trim() ? `\n${value.stderr.trim()}` : ''
    const stack = typeof value.stack === 'string' && value.stack.trim() ? `\n${value.stack.trim()}` : ''
    const fallback = typeof value.value === 'string' ? value.value : ''
    if (name || message || code || stderr || stack || fallback) return `${name ? `${name}: ` : ''}${message || fallback || '(objeto de erro sem mensagem)'}${code}${stderr}${stack}`
    try { return JSON.stringify(error) || Object.prototype.toString.call(error) }
    catch { return Object.prototype.toString.call(error) }
  }
  return String(error)
}

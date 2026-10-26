import { spawn } from 'node:child_process'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'

export function waitForExport<T>(operation: Promise<T>, signal: AbortSignal, timeoutMs: number, label: string): Promise<T> {
  if (signal.aborted) { void operation.catch(() => {}); return Promise.reject(signal.reason ?? Error('Exportação cancelada.')) }
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason ?? Error('Exportação cancelada.'))
    const timer = setTimeout(() => reject(Error(`Tempo limite: ${label}.`)), timeoutMs)
    signal.addEventListener('abort', abort, { once: true })
    operation.then(resolve, reject).finally(() => { clearTimeout(timer); signal.removeEventListener('abort', abort) }).catch(() => {})
  })
}

export function spawnExportProcess(binary: string, args: string[], signal: AbortSignal, cwd?: string) {
  signal.throwIfAborted()
  const child: ChildProcessWithoutNullStreams = spawn(binary, args, { windowsHide: true, cwd, stdio: ['pipe', 'pipe', 'pipe'] })
  let stdout = '', stderr = ''
  child.stdout.on('data', (data: Buffer) => { stdout += data.toString(); if (stdout.length > 16_000_000) child.kill() })
  child.stderr.on('data', (data: Buffer) => { stderr = (stderr + data.toString()).slice(-64000) })
  const abort = () => child.kill()
  signal.addEventListener('abort', abort, { once: true })
  const done = new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    child.once('error', reject)
    child.once('close', (code) => { signal.removeEventListener('abort', abort); if (signal.aborted) reject(signal.reason ?? Error('Exportação cancelada.')); else if (code !== 0) reject(Error(`FFmpeg/FFprobe terminou com código ${code}: ${stderr.slice(-4000)}`)); else resolve({ stdout, stderr }) })
  })
  void done.catch(() => {})
  child.stdin.on('error', () => {})
  return { child, done }
}
export async function runExportCommand(binary: string, args: string[], signal: AbortSignal, cwd?: string) {
  const process = spawnExportProcess(binary, args, signal, cwd)
  process.child.stdin.end()
  try { return await waitForExport(process.done, signal, 120000, 'processamento de mídia') }
  finally { if (process.child.exitCode === null) process.child.kill(); await process.done.catch(() => {}) }
}

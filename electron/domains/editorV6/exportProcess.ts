import { spawn } from 'node:child_process'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import type { Writable } from 'node:stream'

type SerializedProcessError = { name: string; message: string; code?: string; syscall?: string }
type ExportPipeState = {
  writableLength: number
  writableHighWaterMark: number
  writableNeedDrain: boolean
  destroyed: boolean
  writableEnded: boolean
  errored?: SerializedProcessError
}
type ExportProcessDiagnosticEvent = {
  event: string
  offsetMs: number
  stdin: ExportPipeState
  error?: SerializedProcessError
  exitCode?: number | null
  signal?: NodeJS.Signals | null
}
export type EditorV6ExportProcessDiagnosticSnapshot = {
  pid?: number
  exitCode: number | null
  signalCode: NodeJS.Signals | null
  killed: boolean
  stderrTail: string
  stdin: ExportPipeState
  eventCounts: Record<string, number>
  events: ExportProcessDiagnosticEvent[]
}
export type EditorV6SpawnedExportProcess = {
  child: ChildProcessWithoutNullStreams
  done: Promise<{ stdout: string; stderr: string }>
  getDiagnosticSnapshot?: () => EditorV6ExportProcessDiagnosticSnapshot
}

function serializeProcessError(error: unknown): SerializedProcessError | undefined {
  if (error == null) return undefined
  if (!(error instanceof Error)) return { name: 'Error', message: String(error) }
  const value = error as NodeJS.ErrnoException
  return {
    name: error.name,
    message: error.message,
    ...(typeof value.code === 'string' ? { code: value.code } : {}),
    ...(typeof value.syscall === 'string' ? { syscall: value.syscall } : {})
  }
}

function snapshotPipe(stream: Writable): ExportPipeState {
  const errored = serializeProcessError(stream.errored)
  return {
    writableLength: stream.writableLength,
    writableHighWaterMark: stream.writableHighWaterMark,
    writableNeedDrain: stream.writableNeedDrain,
    destroyed: stream.destroyed,
    writableEnded: stream.writableEnded,
    ...(errored ? { errored } : {})
  }
}

function createExportProcessDiagnostics(child: ChildProcessWithoutNullStreams, readStderr: () => string) {
  const startedAt = performance.now()
  const events: ExportProcessDiagnosticEvent[] = []
  const eventCounts: Record<string, number> = {}
  const recordEvent = (
    event: string,
    details: Pick<ExportProcessDiagnosticEvent, 'error' | 'exitCode' | 'signal'> = {}
  ) => {
    eventCounts[event] = (eventCounts[event] ?? 0) + 1
    events.push({ event, offsetMs: performance.now() - startedAt, stdin: snapshotPipe(child.stdin), ...details })
    if (events.length > 64) events.shift()
  }
  const getSnapshot = (): EditorV6ExportProcessDiagnosticSnapshot => ({
    pid: child.pid,
    exitCode: child.exitCode,
    signalCode: child.signalCode,
    killed: child.killed,
    stderrTail: readStderr(),
    stdin: snapshotPipe(child.stdin),
    eventCounts: { ...eventCounts },
    events: [...events]
  })
  return { recordEvent, getSnapshot }
}

export function waitForExport<T>(operation: Promise<T>, signal: AbortSignal, timeoutMs: number, label: string): Promise<T> {
  if (signal.aborted) { void operation.catch(() => {}); return Promise.reject(signal.reason ?? Error('Exportação cancelada.')) }
  return new Promise((resolve, reject) => {
    let settled = false
    const cleanup = () => { clearTimeout(timer); signal.removeEventListener('abort', abort) }
    const succeed = (value: T) => { if (settled) return; settled = true; cleanup(); resolve(value) }
    const fail = (error: unknown) => { if (settled) return; settled = true; cleanup(); reject(error) }
    const abort = () => fail(signal.reason ?? Error('Exportação cancelada.'))
    const timer = setTimeout(() => fail(Error(`Tempo limite: ${label}.`)), timeoutMs)
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) abort()
    operation.then(succeed, fail)
  })
}

export function spawnExportProcess(
  binary: string,
  args: string[],
  signal: AbortSignal,
  cwd?: string,
  captureFailureDiagnostics = false
): EditorV6SpawnedExportProcess {
  signal.throwIfAborted()
  const child: ChildProcessWithoutNullStreams = spawn(binary, args, { windowsHide: true, cwd, stdio: ['pipe', 'pipe', 'pipe'] })
  let stdout = '', stderr = ''
  const diagnostics = captureFailureDiagnostics ? createExportProcessDiagnostics(child, () => stderr) : undefined
  child.stdout.on('data', (data: Buffer) => { stdout += data.toString(); if (stdout.length > 16_000_000) child.kill() })
  child.stderr.on('data', (data: Buffer) => { stderr = (stderr + data.toString()).slice(-64000) })
  const abort = () => child.kill()
  signal.addEventListener('abort', abort, { once: true })
  if (signal.aborted) abort()
  const done = new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    if (diagnostics) {
      const finishClose = (code: number | null) => {
        signal.removeEventListener('abort', abort)
        if (signal.aborted) reject(signal.reason ?? Error('Exportação cancelada.'))
        else if (code !== 0) reject(Error(`FFmpeg/FFprobe terminou com código ${code}: ${stderr.slice(-4000)}`))
        else resolve({ stdout, stderr })
      }
      child.once('error', (error) => { diagnostics.recordEvent('process.error', { error: serializeProcessError(error) }); reject(error) })
      child.once('close', (code, closeSignal) => {
        diagnostics.recordEvent('process.close', { exitCode: code, signal: closeSignal })
        finishClose(code)
      })
    } else {
      child.once('error', reject)
      child.once('close', (code) => {
        signal.removeEventListener('abort', abort)
        if (signal.aborted) reject(signal.reason ?? Error('Exportação cancelada.'))
        else if (code !== 0) reject(Error(`FFmpeg/FFprobe terminou com código ${code}: ${stderr.slice(-4000)}`))
        else resolve({ stdout, stderr })
      })
    }
  })
  void done.catch(() => {})
  child.stdin.on('error', () => {})
  if (diagnostics) {
    child.once('spawn', () => diagnostics.recordEvent('process.spawn'))
    child.once('exit', (code, exitSignal) => diagnostics.recordEvent('process.exit', { exitCode: code, signal: exitSignal }))
    child.stdin.on('error', (error) => diagnostics.recordEvent('stdin.error', { error: serializeProcessError(error) }))
    child.stdin.on('close', () => diagnostics.recordEvent('stdin.close'))
    child.stdin.on('drain', () => diagnostics.recordEvent('stdin.drain'))
    return {
      child,
      done,
      getDiagnosticSnapshot: diagnostics.getSnapshot
    }
  }
  return { child, done }
}
export async function runExportCommand(binary: string, args: string[], signal: AbortSignal, cwd?: string) {
  const process = spawnExportProcess(binary, args, signal, cwd)
  process.child.stdin.end()
  try { return await waitForExport(process.done, signal, 120000, 'processamento de mídia') }
  finally { if (process.child.exitCode === null) process.child.kill(); await process.done.catch(() => {}) }
}

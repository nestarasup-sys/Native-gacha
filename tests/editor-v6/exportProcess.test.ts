import { afterEach, describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { PassThrough, Writable } from 'node:stream'

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }))
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  return { ...actual, spawn: spawnMock }
})

import { spawnExportProcess, waitForExport } from '../../electron/domains/editorV6/exportProcess'

function fakeChildProcess() {
  const child = Object.assign(new EventEmitter(), {
    pid: 123,
    exitCode: null as number | null,
    signalCode: null as NodeJS.Signals | null,
    killed: false,
    stdin: new Writable({ write(_chunk, _encoding, callback) { callback() } }),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill: vi.fn()
  })
  return child
}

afterEach(() => vi.useRealTimers())

describe('export operation lifetime', () => {
  it('keeps process diagnostics out of the normal path', async () => {
    const child = fakeChildProcess()
    spawnMock.mockReturnValueOnce(child)

    const process = spawnExportProcess('ffmpeg.exe', [], new AbortController().signal)

    expect(process.getDiagnosticSnapshot).toBeUndefined()
    expect(child.listenerCount('exit')).toBe(0)
    expect(child.stdin.listenerCount('drain')).toBe(0)
    const completed = expect(process.done).resolves.toMatchObject({ stdout: '', stderr: '' })
    child.emit('close', 0, null)
    await completed
  })

  it('captures stderr, pipe events, exit code, signal, and buffer state when opted in', async () => {
    const child = fakeChildProcess()
    spawnMock.mockReturnValueOnce(child)
    const process = spawnExportProcess('ffmpeg.exe', [], new AbortController().signal, undefined, true)
    expect(process.getDiagnosticSnapshot?.().stdin).not.toHaveProperty('errored')
    const failed = expect(process.done).rejects.toThrow('FFmpeg/FFprobe terminou com código null: saída sintética')

    child.stderr.write('saída sintética')
    child.stdin.emit('error', Object.assign(Error('write UNKNOWN'), { code: 'UNKNOWN', syscall: 'write' }))
    child.signalCode = 'SIGTERM'
    child.killed = true
    child.emit('exit', null, 'SIGTERM')
    child.emit('close', null, 'SIGTERM')
    await failed

    const snapshot = process.getDiagnosticSnapshot?.()
    expect(snapshot).toMatchObject({
      pid: 123,
      exitCode: null,
      signalCode: 'SIGTERM',
      killed: true,
      stderrTail: 'saída sintética',
      eventCounts: { 'stdin.error': 1, 'process.exit': 1, 'process.close': 1 }
    })
    expect(snapshot?.events.map((event) => event.event)).toContain('stdin.error')
    expect(snapshot?.events.find((event) => event.event === 'stdin.error')?.error).toMatchObject({
      code: 'UNKNOWN',
      syscall: 'write'
    })
  })

  it('removes the timer and listener immediately when cancelled even if the operation never ends', async () => {
    vi.useFakeTimers()
    const controller = new AbortController()
    const remove = vi.spyOn(controller.signal, 'removeEventListener')
    const result = waitForExport(new Promise<never>(() => {}), controller.signal, 60000, 'worker')
    const rejected = expect(result).rejects.toThrow('cancelado pelo usuário')
    controller.abort(Error('cancelado pelo usuário'))
    await rejected
    expect(vi.getTimerCount()).toBe(0)
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function))
  })

  it('cleans up on timeout and safely consumes a late rejection', async () => {
    vi.useFakeTimers()
    const controller = new AbortController()
    const remove = vi.spyOn(controller.signal, 'removeEventListener')
    let rejectOperation!: (error: Error) => void
    const operation = new Promise<never>((_, reject) => { rejectOperation = reject })
    const result = waitForExport(operation, controller.signal, 100, 'capturar quadro')
    const rejected = expect(result).rejects.toThrow('Tempo limite: capturar quadro.')
    await vi.advanceTimersByTimeAsync(100)
    await rejected
    expect(vi.getTimerCount()).toBe(0)
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function))
    rejectOperation(Error('resposta tardia'))
    await Promise.resolve()
  })

  it('preserves success and operation errors and creates no timer for an already cancelled signal', async () => {
    vi.useFakeTimers()
    const controller = new AbortController()
    await expect(waitForExport(Promise.resolve(42), controller.signal, 100, 'worker')).resolves.toBe(42)
    await expect(waitForExport(Promise.reject(Error('falha original')), controller.signal, 100, 'worker')).rejects.toThrow('falha original')
    controller.abort(Error('cancelado'))
    await expect(waitForExport(Promise.reject(Error('tardia')), controller.signal, 100, 'worker')).rejects.toThrow('cancelado')
    expect(vi.getTimerCount()).toBe(0)
  })
})

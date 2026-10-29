import { afterEach, describe, expect, it, vi } from 'vitest'
import { waitForExport } from '../../electron/domains/editorV6/exportProcess'

afterEach(() => vi.useRealTimers())

describe('export operation lifetime', () => {
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

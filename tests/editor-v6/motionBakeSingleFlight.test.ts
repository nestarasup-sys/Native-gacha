import { describe, expect, it, vi } from 'vitest'
import type { EditorV6MotionBakeResult } from '../../src/shared/editorV6Motion'
import { createEditorV6MotionBakeSingleFlight } from '../../electron/domains/editorV6/motionBakeSingleFlight'

const result = { asset: { id: 'motion' } } as EditorV6MotionBakeResult

describe('voos compartilhados de preparação de movimento', () => {
  it('compartilha o bake, mas o cancelamento de um assinante preserva os demais', async () => {
    const flights = createEditorV6MotionBakeSingleFlight()
    const first = new AbortController()
    const second = new AbortController()
    let resolveBake!: (value: EditorV6MotionBakeResult) => void
    let producerSignal: AbortSignal | undefined
    const bake = vi.fn((signal: AbortSignal) => {
      producerSignal = signal
      return new Promise<EditorV6MotionBakeResult>((resolve) => { resolveBake = resolve })
    })

    const firstResult = flights.run('same-key', first.signal, bake)
    const secondResult = flights.run('same-key', second.signal, bake)
    await Promise.resolve()
    expect(bake).toHaveBeenCalledOnce()

    first.abort(Error('first caller cancelled'))
    await expect(firstResult).rejects.toThrow('first caller cancelled')
    expect(producerSignal?.aborted).toBe(false)

    resolveBake(result)
    await expect(secondResult).resolves.toBe(result)
  })

  it('cancela o trabalho compartilhado quando seu último assinante sai', async () => {
    const flights = createEditorV6MotionBakeSingleFlight()
    const caller = new AbortController()
    let producerSignal: AbortSignal | undefined
    const bake = (signal: AbortSignal) => new Promise<EditorV6MotionBakeResult>((_resolve, reject) => {
      producerSignal = signal
      signal.addEventListener('abort', () => reject(signal.reason), { once: true })
    })

    const pending = flights.run('cancelled-key', caller.signal, bake)
    await Promise.resolve()
    caller.abort(Error('caller left'))
    await expect(pending).rejects.toThrow('caller left')
    expect(producerSignal?.aborted).toBe(true)
  })

  it('permite tentar novamente uma chave depois que o bake termina ou falha', async () => {
    const flights = createEditorV6MotionBakeSingleFlight()
    let attempts = 0
    const bake = async () => {
      attempts++
      if (attempts === 1) throw Error('synthetic bake failure')
      return result
    }

    await expect(flights.run('retry-key', new AbortController().signal, bake)).rejects.toThrow('synthetic bake failure')
    await expect(flights.run('retry-key', new AbortController().signal, bake)).resolves.toBe(result)
    await expect(flights.run('retry-key', new AbortController().signal, bake)).resolves.toBe(result)
    expect(attempts).toBe(3)
  })
})

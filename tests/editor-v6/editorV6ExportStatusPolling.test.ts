import { describe, expect, it, vi } from 'vitest'
import type { EditorV6ExportStatus } from '../../src/shared/editorV6Export'
import { isEditorV6ExportFinished, startEditorV6ExportStatusPolling, type EditorV6ExportStatusPollingScheduler } from '../../src/renderer/src/features/editorV6/editorV6ExportStatusPolling'

function status(state: EditorV6ExportStatus['state'] = 'rendering'): EditorV6ExportStatus {
  return { id: 'job-synthetic', state, frames: 10, totalFrames: 30, message: 'Progresso sintético', fallback: false }
}

function createScheduler() {
  let nextId = 1
  const callbacks = new Map<number, () => void>()
  const cancel = vi.fn((id: number) => { callbacks.delete(id) })
  const scheduler: EditorV6ExportStatusPollingScheduler = {
    schedule: vi.fn((callback, delayMs) => {
      expect(delayMs).toBe(500)
      const id = nextId++
      callbacks.set(id, callback)
      return id
    }),
    cancel
  }
  return {
    scheduler,
    cancel,
    runNext() {
      const entry = callbacks.entries().next().value as [number, () => void] | undefined
      if (!entry) throw new Error('Nenhuma consulta agendada')
      callbacks.delete(entry[0])
      entry[1]()
    },
    get pendingCount() { return callbacks.size }
  }
}

describe('consulta do status de exportação do Editor V6', () => {
  it('consulta imediatamente e repete a cada 500 ms até o dono cancelar', async () => {
    const timers = createScheduler()
    const getStatus = vi.fn(async () => status())
    const onStatus = vi.fn()
    const stop = startEditorV6ExportStatusPolling('job-synthetic', {
      getStatus, onStatus, onError: vi.fn(), scheduler: timers.scheduler
    })

    await Promise.resolve()
    expect(getStatus).toHaveBeenCalledTimes(1)
    expect(onStatus).toHaveBeenCalledWith(status())
    expect(timers.pendingCount).toBe(1)

    timers.runNext()
    await Promise.resolve()
    expect(getStatus).toHaveBeenCalledTimes(2)
    expect(timers.pendingCount).toBe(1)

    stop()
    expect(timers.cancel).toHaveBeenCalledWith(2)
    expect(timers.pendingCount).toBe(0)
  })

  it('reporta erro de consulta e mantém o polling para a próxima tentativa', async () => {
    const timers = createScheduler()
    const failure = new Error('Falha sintética de consulta')
    const onError = vi.fn()
    const stop = startEditorV6ExportStatusPolling('job-synthetic', {
      getStatus: vi.fn().mockRejectedValue(failure), onStatus: vi.fn(), onError, scheduler: timers.scheduler
    })

    await Promise.resolve()
    expect(onError).toHaveBeenCalledWith(failure)
    expect(timers.pendingCount).toBe(1)
    stop()
  })

  it('ignora resultados que chegam depois do cancelamento', async () => {
    const timers = createScheduler()
    let resolveStatus!: (value: EditorV6ExportStatus) => void
    const getStatus = vi.fn(() => new Promise<EditorV6ExportStatus>((resolve) => { resolveStatus = resolve }))
    const onStatus = vi.fn()
    const onError = vi.fn()
    const stop = startEditorV6ExportStatusPolling('job-synthetic', {
      getStatus, onStatus, onError, scheduler: timers.scheduler
    })

    stop()
    resolveStatus(status())
    await Promise.resolve()
    expect(onStatus).not.toHaveBeenCalled()
    expect(onError).not.toHaveBeenCalled()
    expect(timers.pendingCount).toBe(0)
  })

  it('reconhece somente os três estados terminais existentes', () => {
    expect(isEditorV6ExportFinished(status('completed'))).toBe(true)
    expect(isEditorV6ExportFinished(status('cancelled'))).toBe(true)
    expect(isEditorV6ExportFinished(status('failed'))).toBe(true)
    expect(isEditorV6ExportFinished(status('preparing'))).toBe(false)
    expect(isEditorV6ExportFinished(status('rendering'))).toBe(false)
    expect(isEditorV6ExportFinished(status('joining'))).toBe(false)
    expect(isEditorV6ExportFinished(status('validating'))).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import { createEditorV6ExportJobRegistry, type EditorV6ExportJob } from '../../electron/domains/editorV6/exportJobRegistry'

function job(id: string, owner: number, state: EditorV6ExportJob['status']['state'] = 'preparing'): EditorV6ExportJob {
  return {
    owner,
    status: { id, state, frames: 0, totalFrames: 30, message: state, fallback: false },
    controller: new AbortController(),
    promise: Promise.resolve()
  }
}

describe('registro de jobs de exportação do Editor V6', () => {
  it('resolve o job mais recente apenas dentro da janela proprietária', () => {
    const registry = createEditorV6ExportJobRegistry()
    const first = job('first', 7)
    const otherWindow = job('other-window', 8)
    const latest = job('latest-owner-job', 7)
    registry.add(first)
    registry.add(otherWindow)
    registry.add(latest)

    expect(registry.findOwned('latest', 7)).toBe(latest)
    expect(registry.findOwned('first', 7)).toBe(first)
    expect(() => registry.findOwned('latest-owner-job', 8)).toThrow('Exportação não encontrada nesta janela.')
    expect(() => registry.findOwned('missing', 7)).toThrow('Exportação não encontrada nesta janela.')
  })

  it('conta como ativos e pendentes somente jobs não terminais', () => {
    const registry = createEditorV6ExportJobRegistry()
    const preparing = job('preparing', 1)
    const rendering = job('rendering', 1, 'rendering')
    const completed = job('completed', 1, 'completed')
    registry.add(preparing)
    registry.add(rendering)
    registry.add(completed)

    expect(registry.hasActive()).toBe(true)
    expect(registry.pendingPromises()).toEqual([preparing.promise, rendering.promise])

    preparing.status = { ...preparing.status, state: 'cancelled' }
    rendering.status = { ...rendering.status, state: 'failed' }
    expect(registry.hasActive()).toBe(false)
    expect(registry.pendingPromises()).toEqual([])
  })

  it('cancela apenas jobs ativos', () => {
    const registry = createEditorV6ExportJobRegistry()
    const active = job('active', 1)
    const complete = job('complete', 1, 'completed')
    registry.add(active)
    registry.add(complete)

    registry.cancelAll(Error('fechando'))

    expect(active.controller.signal.aborted).toBe(true)
    expect(active.controller.signal.reason.message).toBe('fechando')
    expect(complete.controller.signal.aborted).toBe(false)
  })

  it('remove históricos terminais quando excede o limite e conserva jobs ativos', () => {
    const registry = createEditorV6ExportJobRegistry()
    for (let index = 0; index < 22; index++) registry.add(job(`job-${index}`, 1, index < 20 ? 'completed' : 'rendering'))

    registry.pruneTerminal(20)

    expect(registry.size).toBe(2)
    expect(registry.findOwned('job-20', 1).status.state).toBe('rendering')
    expect(() => registry.findOwned('job-0', 1)).toThrow('Exportação não encontrada nesta janela.')
  })

  it('não elimina jobs quando a quantidade está abaixo do limite', () => {
    const registry = createEditorV6ExportJobRegistry()
    registry.add(job('finished', 1, 'completed'))
    registry.pruneTerminal(20)
    expect(registry.size).toBe(1)
  })
})

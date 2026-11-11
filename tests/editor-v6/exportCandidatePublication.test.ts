import { describe, expect, it, vi } from 'vitest'
import type { EditorV6ExportReport } from '../../electron/domains/editorV6/exportReport'
import { publishEditorV6ExportCandidate } from '../../electron/domains/editorV6/exportCandidatePublication'

function report(): EditorV6ExportReport {
  return {
    state: 'validating', outputPath: 'requested.mp4', deliveryWarning: 'aviso anterior',
    phaseMilliseconds: { publication: 0 }, mainProcessMemory: { startRssBytes: 10, peakRssBytes: 18, sampleIntervalMs: 500 }
  } as unknown as EditorV6ExportReport
}

function dependencies(overrides: Partial<Parameters<typeof publishEditorV6ExportCandidate>[0]> = {}) {
  return {
    report: report(), candidate: 'validated-candidate.mp4', outputPath: 'requested.mp4', id: 'run-1',
    started: 100, memorySampler: {} as ReturnType<typeof setInterval>, signal: new AbortController().signal,
    saveReport: vi.fn(async () => {}), publish: vi.fn(async () => ({ outputPath: 'requested.mp4' })),
    now: (() => { let tick = 100; return () => ++tick })(), timestamp: () => '2026-11-11T00:00:00.000Z',
    currentRss: () => 20, clearMemorySampler: vi.fn(), formatError: (error: unknown) => String(error),
    ...overrides
  }
}

describe('publishEditorV6ExportCandidate', () => {
  it('salva o estado de publicação antes de mover o candidato e conclui o relatório', async () => {
    const options = dependencies()
    const operations: string[] = []
    options.saveReport.mockImplementation(async () => { operations.push(`report:${options.report.state}`) })
    options.publish.mockImplementation(async (candidate, destination, id) => {
      operations.push(`publish:${candidate}:${destination}:${id}`)
      return { outputPath: 'recovered.mp4', warning: 'Destino ocupado; salvo com nome alternativo.' }
    })
    options.clearMemorySampler.mockImplementation(() => { operations.push('clear-sampler') })

    await publishEditorV6ExportCandidate(options)

    expect(operations).toEqual([
      'report:publishing', 'publish:validated-candidate.mp4:requested.mp4:run-1',
      'clear-sampler', 'report:completed'
    ])
    expect(options.report).toMatchObject({
      state: 'completed', outputPath: 'recovered.mp4', deliveryWarning: 'aviso anterior Destino ocupado; salvo com nome alternativo.',
      endedAt: '2026-11-11T00:00:00.000Z', mainProcessMemory: { peakRssBytes: 20 }
    })
    expect(options.report.phaseMilliseconds.publication).toBe(1)
  })

  it('reconfere cancelamento depois de gravar o estado e não publica o candidato', async () => {
    const controller = new AbortController()
    const options = dependencies({
      signal: controller.signal,
      saveReport: vi.fn(async () => { controller.abort() })
    })

    await expect(publishEditorV6ExportCandidate(options)).rejects.toThrow()

    expect(options.report.state).toBe('publishing')
    expect(options.publish).not.toHaveBeenCalled()
    expect(options.clearMemorySampler).not.toHaveBeenCalled()
  })

  it('mantém o vídeo publicado e registra aviso se a atualização final do relatório falhar', async () => {
    const options = dependencies({
      saveReport: vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('relatório indisponível')),
      formatError: error => error instanceof Error ? error.message : String(error)
    })

    await expect(publishEditorV6ExportCandidate(options)).resolves.toBeUndefined()

    expect(options.publish).toHaveBeenCalledOnce()
    expect(options.report).toMatchObject({ state: 'completed', outputPath: 'requested.mp4' })
    expect(options.report.deliveryWarning).toContain('Vídeo salvo, mas não foi possível atualizar o relatório: relatório indisponível')
  })
})

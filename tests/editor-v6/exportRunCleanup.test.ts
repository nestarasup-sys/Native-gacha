import { describe, expect, it, vi } from 'vitest'
import { cleanupEditorV6ExportRun } from '../../electron/domains/editorV6/exportRunCleanup'

function createDependencies(overrides: Partial<Parameters<typeof cleanupEditorV6ExportRun>[0]> = {}) {
  return {
    report: {
      endedAt: 'before-cleanup',
      milliseconds: 12,
      deliveryWarning: undefined,
      mainProcessMemory: { startRssBytes: 100, peakRssBytes: 150, sampleIntervalMs: 500 }
    },
    published: false,
    started: 900,
    motionCacheScope: 'synthetic-scope',
    releaseMotionCacheScope: vi.fn(),
    memorySampler: {} as ReturnType<typeof setInterval>,
    candidate: 'synthetic-candidate.mp4',
    tempRoot: 'synthetic-temp-root',
    folder: 'synthetic-temp-root/editor-v6-export-synthetic',
    saveReport: vi.fn(async () => {}),
    removeCandidate: vi.fn(async () => {}),
    removeTempFolder: vi.fn(async () => true),
    now: () => 1_000,
    timestamp: () => 'after-cleanup',
    currentRss: () => 200,
    clearMemorySampler: vi.fn(),
    formatError: (error: unknown) => error instanceof Error ? error.message : String(error),
    warn: vi.fn(),
    ...overrides
  }
}

describe('encerramento de um job de exportação do Editor V6', () => {
  it('grava o estado final e libera recursos antes de limpar os artefatos', async () => {
    const order: string[] = []
    const dependencies = createDependencies({
      releaseMotionCacheScope: vi.fn(() => order.push('release-cache')),
      clearMemorySampler: vi.fn(() => order.push('clear-sampler')),
      saveReport: vi.fn(async () => { order.push('save-report') }),
      removeCandidate: vi.fn(async () => { order.push('remove-candidate') }),
      removeTempFolder: vi.fn(async () => { order.push('remove-folder'); return true })
    })

    await cleanupEditorV6ExportRun(dependencies)

    expect(order).toEqual(['release-cache', 'clear-sampler', 'save-report', 'remove-candidate', 'remove-folder'])
    expect(dependencies.report).toMatchObject({ endedAt: 'after-cleanup', milliseconds: 100, mainProcessMemory: { peakRssBytes: 200 } })
    expect(dependencies.releaseMotionCacheScope).toHaveBeenCalledWith('synthetic-scope')
    expect(dependencies.clearMemorySampler).toHaveBeenCalledWith(dependencies.memorySampler)
    expect(dependencies.removeTempFolder).toHaveBeenCalledWith(dependencies.tempRoot, dependencies.folder)
  })

  it('preserva a falha principal e agrega todas as falhas de limpeza quando não publicou', async () => {
    const primary = new Error('renderização falhou')
    const reportFailure = new Error('relatório falhou')
    const candidateFailure = new Error('candidato ocupado')
    const folderFailure = new Error('pasta ocupada')
    const dependencies = createDependencies({
      exportFailure: primary,
      saveReport: vi.fn(async () => { throw reportFailure }),
      removeCandidate: vi.fn(async () => { throw candidateFailure }),
      removeTempFolder: vi.fn(async () => { throw folderFailure })
    })

    const error = await cleanupEditorV6ExportRun(dependencies).catch((reason: unknown) => reason)

    expect(error).toBeInstanceOf(AggregateError)
    expect((error as AggregateError).errors).toEqual([primary, reportFailure, candidateFailure, folderFailure])
    expect(dependencies.removeCandidate).toHaveBeenCalledOnce()
    expect(dependencies.removeTempFolder).toHaveBeenCalledOnce()
  })

  it('registra aviso e não invalida o vídeo já publicado se a limpeza falhar', async () => {
    const dependencies = createDependencies({
      published: true,
      report: {
        endedAt: 'published-time',
        milliseconds: 50,
        deliveryWarning: 'Vídeo recuperado em outro caminho.',
        mainProcessMemory: { startRssBytes: 100, peakRssBytes: 180, sampleIntervalMs: 500 }
      },
      removeCandidate: vi.fn(async () => { throw new Error('MP4 temporário ocupado') }),
      removeTempFolder: vi.fn(async () => { throw new Error('pasta temporária ocupada') })
    })

    await expect(cleanupEditorV6ExportRun(dependencies)).resolves.toBeUndefined()

    expect(dependencies.report.deliveryWarning).toBe('Vídeo recuperado em outro caminho. O MP4 foi salvo, mas houve falha ao limpar arquivos temporários.')
    expect(dependencies.report.mainProcessMemory?.peakRssBytes).toBe(200)
    expect(dependencies.report.endedAt).toBe('published-time')
    expect(dependencies.saveReport).toHaveBeenCalledOnce()
    expect(dependencies.warn).toHaveBeenCalledTimes(1)
  })

  it('não regrava o relatório publicado quando todos os recursos temporários foram removidos', async () => {
    const dependencies = createDependencies({ published: true })

    await cleanupEditorV6ExportRun(dependencies)

    expect(dependencies.saveReport).not.toHaveBeenCalled()
    expect(dependencies.report.endedAt).toBe('before-cleanup')
    expect(dependencies.removeCandidate).toHaveBeenCalledOnce()
    expect(dependencies.removeTempFolder).toHaveBeenCalledOnce()
  })
})

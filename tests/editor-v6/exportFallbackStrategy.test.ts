import { describe, expect, it, vi } from 'vitest'
import type { EditorV6ExportOptions, EditorV6ExportPart, EditorV6ExportStatus } from '../../src/shared/editorV6Export'
import type { EditorV6ExportAttemptReport } from '../../electron/domains/editorV6/exportReport'
import type { EditorV6ExportPartReport } from '../../electron/domains/editorV6/exportPartRenderer'
import { renderEditorV6ExportWithFallback, type EditorV6ExportAttempt } from '../../electron/domains/editorV6/exportFallbackStrategy'

function createPart(index: number, startFrame = index * 300, endFrame = startFrame + 300): EditorV6ExportPart {
  return { index, startFrame, endFrame }
}

function createPartReport(part: EditorV6ExportPart, encoder: string): EditorV6ExportPartReport {
  return {
    ...part,
    path: `synthetic-${part.index}.mp4`,
    encoder,
    rendered: part.endFrame - part.startFrame,
    reused: 0,
    frames: part.endFrame - part.startFrame,
    milliseconds: 1,
    startedAtOffsetMs: 0
  }
}

function createDependencies(overrides: Partial<Parameters<typeof renderEditorV6ExportWithFallback>[0]> = {}) {
  const report = { attempts: [] as EditorV6ExportAttemptReport[], fallback: false }
  const renderAttempt: EditorV6ExportAttempt = vi.fn(async (parts, encoder, parallelism = 2) => {
    report.attempts.push({ parts: [], encoder, parallelism })
    return parts.map((part) => createPartReport(part, encoder))
  })
  const finishMeasured = vi.fn(async () => ({ valid: true }))
  const options: EditorV6ExportOptions = {
    startFrame: 0, endFrame: 650, width: 320, height: 180, turbo: true, encoder: 'auto'
  }
  return {
    options,
    plannedParts: [createPart(0, 0, 300), createPart(1, 300, 600), createPart(2, 600, 650)],
    requestedPartCount: 3,
    speechInRange: false,
    encoder: 'h264_nvenc',
    signal: new AbortController().signal,
    report,
    progress: vi.fn<(patch: Partial<EditorV6ExportStatus>) => void>(),
    renderAttempt,
    finishMeasured,
    selectFallbackEncoder: vi.fn(async () => 'libx264'),
    formatError: (error: unknown) => error instanceof Error ? error.message : String(error),
    ...overrides
  }
}

describe('política de fallback da exportação do Editor V6', () => {
  it('usa o paralelismo do harness para o Turbo e mantém a validação da primeira tentativa', async () => {
    const dependencies = createDependencies({ stressWorkerOverride: '3' })

    await expect(renderEditorV6ExportWithFallback(dependencies)).resolves.toEqual({ valid: true })

    expect(dependencies.renderAttempt).toHaveBeenCalledWith(dependencies.plannedParts, 'h264_nvenc', 3)
    expect(dependencies.finishMeasured).toHaveBeenCalledOnce()
    expect(dependencies.selectFallbackEncoder).not.toHaveBeenCalled()
    expect(dependencies.report.fallback).toBe(false)
  })

  it('repete com CPU e divide a faixa de fala em partes de 300 quadros', async () => {
    const failure = new Error('falha no Turbo')
    const dependencies = createDependencies({
      speechInRange: true,
      renderAttempt: vi.fn<EditorV6ExportAttempt>(async (parts, encoder, parallelism = 2) => {
        dependencies.report.attempts.push({ parts: [], encoder, parallelism })
        if (dependencies.renderAttempt.mock.calls.length === 1) throw failure
        return parts.map((part) => createPartReport(part, encoder))
      })
    })

    await expect(renderEditorV6ExportWithFallback(dependencies)).resolves.toEqual({ valid: true })

    expect(dependencies.renderAttempt).toHaveBeenNthCalledWith(1, dependencies.plannedParts, 'h264_nvenc', 2)
    const fallbackParts = vi.mocked(dependencies.renderAttempt).mock.calls[1]?.[0]
    expect(fallbackParts).toEqual([createPart(0, 0, 300), createPart(1, 300, 600), createPart(2, 600, 650)])
    expect(dependencies.renderAttempt).toHaveBeenNthCalledWith(2, fallbackParts, 'libx264', 1)
    expect(dependencies.selectFallbackEncoder).toHaveBeenCalledWith('h264_nvenc')
    expect(dependencies.progress).toHaveBeenCalledWith({ message: 'O Turbo falhou. Reiniciando com um renderizador e CPU…', fallback: true })
    expect(dependencies.report.fallback).toBe(true)
    expect(dependencies.report.attempts[0]?.error).toBe(failure.message)
  })

  it('não tenta fallback para CPU, faixa com uma parte ou Turbo obrigatório', async () => {
    const scenarios = [
      { name: 'CPU', overrides: { options: { ...createDependencies().options, turbo: false } } },
      { name: 'uma parte', overrides: { requestedPartCount: 1 } },
      { name: 'Turbo obrigatório', overrides: { options: { ...createDependencies().options, forceTurbo1080: true } } }
    ]

    for (const scenario of scenarios) {
      const failure = new Error(`falha ${scenario.name}`)
      const dependencies = createDependencies({
        ...scenario.overrides,
        renderAttempt: vi.fn<EditorV6ExportAttempt>(async (parts, encoder, parallelism = 2) => {
          dependencies.report.attempts.push({ parts: [], encoder, parallelism })
          throw failure
        })
      })

      if (scenario.name === 'Turbo obrigatório') await expect(renderEditorV6ExportWithFallback(dependencies)).rejects.toThrow('Turbo obrigatório falhou:')
      else await expect(renderEditorV6ExportWithFallback(dependencies)).rejects.toBe(failure)
      expect(dependencies.renderAttempt).toHaveBeenCalledOnce()
      expect(dependencies.selectFallbackEncoder).not.toHaveBeenCalled()
      expect(dependencies.report.fallback).toBe(false)
    }
  })

  it('propaga cancelamento antes de preparar fallback', async () => {
    const controller = new AbortController()
    const cancelled = new Error('exportação cancelada')
    const dependencies = createDependencies({
      signal: controller.signal,
      renderAttempt: vi.fn<EditorV6ExportAttempt>(async (parts, encoder, parallelism = 2) => {
        dependencies.report.attempts.push({ parts: [], encoder, parallelism })
        controller.abort(cancelled)
        throw new Error('renderer interrompido')
      })
    })

    await expect(renderEditorV6ExportWithFallback(dependencies)).rejects.toBe(cancelled)

    expect(dependencies.selectFallbackEncoder).not.toHaveBeenCalled()
    expect(dependencies.report.fallback).toBe(false)
  })
})

import { describe, expect, it, vi } from 'vitest'
import type { EditorV6Document } from '../../src/shared/editorV6'
import type { EditorV6ExportOptions, EditorV6ExportPart, EditorV6ExportStatus } from '../../src/shared/editorV6Export'
import { editorV6ExportTestSettings } from '../../src/shared/editorV6ExportTestModes'
import { renderEditorV6ExportPart, type EditorV6ExportPartReport } from '../../electron/domains/editorV6/exportPartRenderer'
import { renderEditorV6ExportAttempt, type EditorV6ExportPartRenderer } from '../../electron/domains/editorV6/exportAttemptRenderer'
import type { EditorV6ExportReport } from '../../electron/domains/editorV6/exportReport'

type PreparedMouthLoops = Parameters<Parameters<typeof renderEditorV6ExportPart>[0]['onMouthPrepared']>[0]

function createReport(): Pick<EditorV6ExportReport, 'attempts' | 'fallback' | 'mouthAnimation' | 'phaseMilliseconds'> {
  return {
    attempts: [],
    fallback: false,
    phaseMilliseconds: { temporarySetup: 0, characterLoading: 0, motionPreparation: 0, encoderProbe: 0, rendering: 0, finalization: 0, publication: 0 }
  }
}

function createPart(index: number): EditorV6ExportPart {
  return { index, startFrame: index * 2, endFrame: index * 2 + 2 }
}

function createPartReport(part: EditorV6ExportPart, encoder: string): EditorV6ExportPartReport {
  return {
    ...part,
    path: `synthetic-${part.index}.mp4`,
    encoder,
    rendered: 2,
    reused: 0,
    frames: 2,
    milliseconds: 1,
    startedAtOffsetMs: 0
  }
}

function createDependencies(overrides: Partial<Parameters<typeof renderEditorV6ExportAttempt>[0]> = {}) {
  const project = { id: 'project-synthetic' } as EditorV6Document
  const options: EditorV6ExportOptions = { startFrame: 0, endFrame: 8, width: 320, height: 180, turbo: false, encoder: 'cpu', mouthLoopCycleFrames: 24 }
  const report = createReport()
  const renderPart: EditorV6ExportPartRenderer = vi.fn(async (dependencies) => {
    const result = createPartReport(dependencies.part, dependencies.encoder)
    dependencies.onPartCreated(result)
    dependencies.onFrameWritten()
    dependencies.onFrameWritten()
    return result
  })
  return {
    project,
    parts: [createPart(0)],
    encoder: 'libx264',
    exportStartedAt: performance.now(),
    options,
    layeredVideo: false,
    speechInRange: false,
    characters: [],
    testSettings: editorV6ExportTestSettings(),
    folder: 'synthetic-temp',
    ffmpeg: 'ffmpeg.exe',
    ffprobe: 'ffprobe.exe',
    motionCacheScope: 'synthetic-scope',
    signal: new AbortController().signal,
    report,
    createWorker: vi.fn(),
    bakeMotion: vi.fn(),
    mediaPath: vi.fn(),
    progress: vi.fn<(patch: Partial<EditorV6ExportStatus>) => void>(),
    saveReport: vi.fn(async () => {}),
    formatError: (error: unknown) => error instanceof Error ? error.message : String(error),
    renderPart,
    ...overrides
  }
}

describe('agendamento de tentativas do Editor V6', () => {
  it('limita concorrência por grupos, salva cada grupo e devolve as partes ordenadas', async () => {
    let active = 0
    let peak = 0
    const dependencies = createDependencies({
      parts: [createPart(3), createPart(1), createPart(2), createPart(0)],
      maxParallelism: 2,
      renderPart: vi.fn<EditorV6ExportPartRenderer>(async (partDependencies) => {
        active++
        peak = Math.max(peak, active)
        const result = createPartReport(partDependencies.part, partDependencies.encoder)
        partDependencies.onPartCreated(result)
        await new Promise((resolve) => setTimeout(resolve, partDependencies.part.index % 2 === 0 ? 4 : 1))
        partDependencies.onFrameWritten()
        active--
        return result
      })
    })

    const results = await renderEditorV6ExportAttempt(dependencies)

    expect(peak).toBe(2)
    expect(results.map((part) => part.index)).toEqual([0, 1, 2, 3])
    expect(dependencies.report.attempts).toHaveLength(1)
    expect(dependencies.report.attempts[0]).toMatchObject({ encoder: 'libx264', parallelism: 2, parts: expect.any(Array) })
    expect(dependencies.report.attempts[0]?.parts).toHaveLength(4)
    expect(dependencies.saveReport).toHaveBeenCalledTimes(2)
    expect(dependencies.progress).toHaveBeenCalledWith(expect.objectContaining({ state: 'rendering', frames: 0 }))
    expect(dependencies.progress).toHaveBeenCalledWith({ frames: 1 })
  })

  it('agrega diagnósticos de loops de boca e limita detalhes repetidos', async () => {
    const mouth: PreparedMouthLoops = {
      project: { id: 'prepared-project' } as EditorV6Document,
      mouthLoops: { startFrame: 0, cycleFrames: 24, states: [{ characterId: 'char-1' }, { characterId: 'char-2' }] },
      stats: {
        states: 2, characters: 2, skipped: 1, skippedStale: 0, skippedUnsupported: 0,
        isolatedStates: 1, legacyPatchStates: 1, atlasBytes: 128, atlasPixels: 32,
        errors: ['detalhe A', 'detalhe A', 'detalhe B', 'detalhe C', 'detalhe D'], milliseconds: 6
      }
    }
    const dependencies = createDependencies({
      parts: [createPart(0), createPart(1)],
      renderPart: vi.fn<EditorV6ExportPartRenderer>(async (partDependencies) => {
        partDependencies.onMouthPrepared(mouth)
        const result = createPartReport(partDependencies.part, partDependencies.encoder)
        partDependencies.onPartCreated(result)
        return result
      })
    })

    await renderEditorV6ExportAttempt(dependencies)

    expect(dependencies.report.mouthAnimation).toEqual({
      stateAtlases: 4,
      characters: 2,
      isolatedStates: 2,
      legacyPatchStates: 2,
      skippedStates: 2,
      staleStates: 0,
      cycleFrames: 24,
      atlasBytes: 256,
      atlasPixels: 64,
      preparationMilliseconds: 12,
      details: ['detalhe A', 'detalhe B', 'detalhe C']
    })
  })

  it('preserva o relatório parcial, registra falha e remove o listener de cancelamento', async () => {
    const failure = new Error('falha sintética ao renderizar trecho')
    const controller = new AbortController()
    const removeListener = vi.spyOn(controller.signal, 'removeEventListener')
    const dependencies = createDependencies({
      signal: controller.signal,
      saveReport: vi.fn(async () => {}),
      renderPart: vi.fn<EditorV6ExportPartRenderer>(async (partDependencies) => {
        const partial = createPartReport(partDependencies.part, partDependencies.encoder)
        partDependencies.onPartCreated(partial)
        partDependencies.abort(failure)
        throw failure
      })
    })

    await expect(renderEditorV6ExportAttempt(dependencies)).rejects.toBe(failure)

    expect(dependencies.report.attempts[0]).toMatchObject({ error: failure.message, parts: [{ index: 0 }] })
    expect(dependencies.report.phaseMilliseconds.rendering).toBeGreaterThanOrEqual(0)
    expect(dependencies.saveReport).not.toHaveBeenCalled()
    expect(removeListener).toHaveBeenCalledWith('abort', expect.any(Function))
  })

  it('remove o listener quando a publicação inicial do progresso falha', async () => {
    const failure = new Error('falha sintética ao publicar progresso')
    const controller = new AbortController()
    const removeListener = vi.spyOn(controller.signal, 'removeEventListener')
    const progress = vi.fn<(patch: Partial<EditorV6ExportStatus>) => void>(() => { throw failure })
    const dependencies = createDependencies({ signal: controller.signal, progress })

    await expect(renderEditorV6ExportAttempt(dependencies)).rejects.toBe(failure)

    expect(dependencies.report.attempts[0]).toMatchObject({ error: failure.message })
    expect(dependencies.renderPart).not.toHaveBeenCalled()
    expect(removeListener).toHaveBeenCalledWith('abort', expect.any(Function))
  })
})

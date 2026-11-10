import { describe, expect, it, vi } from 'vitest'
import type { CustomizerCharacter } from '../../src/shared/customizer'
import type { EditorV6Document, EditorV6Element, EditorV6TimelineTrack } from '../../src/shared/editorV6'
import type { EditorV6ExportOptions, EditorV6ExportStatus } from '../../src/shared/editorV6Export'
import type { EditorV6ExportTestSettings } from '../../src/shared/editorV6ExportTestModes'
import type { EditorV6MotionBakeRequest, EditorV6MotionBakeResult } from '../../src/shared/editorV6Motion'
import { editorV6ExportTestSettings } from '../../src/shared/editorV6ExportTestModes'
import type { EditorV6ExportReport } from '../../electron/domains/editorV6/exportReport'
import type { EditorV6MotionCacheReport, EditorV6PreparedExportMotions } from '../../electron/domains/editorV6/exportMotionPreparation'
import type { EditorV6MotionCacheStats } from '../../electron/domains/editorV6/motionCache'
import { prepareEditorV6ExportReadiness, type EditorV6ExportMotionPreparation } from '../../electron/domains/editorV6/exportReadiness'

function createReport(): Pick<EditorV6ExportReport, 'hairPreparation' | 'motionTransitionsRequired' | 'motionTransitionsPrepared' | 'motionPreparation' | 'motionCache' | 'phaseMilliseconds'> {
  return {
    motionTransitionsRequired: 0,
    motionTransitionsPrepared: 0,
    phaseMilliseconds: { temporarySetup: 0, characterLoading: 0, motionPreparation: 0, encoderProbe: 0, rendering: 0, finalization: 0, publication: 0 }
  }
}

function createProject(): EditorV6Document {
  return { id: 'project-synthetic', elements: [], assets: [], timeline: { fps: 30, durationFrames: 650, tracks: [] } } as EditorV6Document
}

function createStats(): EditorV6PreparedExportMotions['stats'] {
  return {
    total: 2, unique: 1, requested: 1, reused: 1, preparedRigs: 1, reusedRigs: 0,
    rigKeyLookups: 1, rigRebuilds: 1, rigBuildMilliseconds: 3, maxConcurrentBakes: 1,
    milliseconds: 5, requestMilliseconds: [2]
  }
}

function createMotionCacheReport(): EditorV6MotionCacheReport {
  return {
    memoryHits: 1, diskHits: 2, misses: 3, rasterized: 4, diskMissing: 0, diskRejected: 0,
    diskReadErrors: 0, diskWrites: 1, diskWriteSkipped: 0, diskWriteErrors: 0,
    diskBytesRead: 128, diskBytesWritten: 256, inputSamples: []
  }
}

function createDependencies(overrides: Partial<Parameters<typeof prepareEditorV6ExportReadiness>[0]> = {}) {
  const project = createProject()
  const characters: CustomizerCharacter[] = []
  const options: EditorV6ExportOptions = { startFrame: 0, endFrame: 650, width: 320, height: 180, turbo: false, encoder: 'cpu' }
  const testSettings: EditorV6ExportTestSettings = editorV6ExportTestSettings()
  const report = createReport()
  const cacheStats: EditorV6MotionCacheStats = {
    memoryHits: 1, diskHits: 2, misses: 3, rasterized: 4, diskMissing: 0, diskRejected: 0,
    diskReadErrors: 0, diskWrites: 1, diskWriteSkipped: 0, diskWriteErrors: 0, diskBytesRead: 128, diskBytesWritten: 256
  }
  const prepareMotions: EditorV6ExportMotionPreparation = vi.fn(async (dependencies) => {
    dependencies.onProgress(1, 2, 'Personagem sintético')
    return { project, stats: createStats(), motionCache: createMotionCacheReport() }
  })
  return {
    project,
    options,
    testSettings,
    hairPreparation: { totalMilliseconds: 7, stages: [], counts: { surfaces: 1, textures: 0, rigs: 0, motionTransitions: 0, encodedCharacters: 0 } },
    motionPreparationConcurrency: 2 as const,
    motionCacheScope: 'synthetic-scope',
    signal: new AbortController().signal,
    getCharacters: vi.fn(async () => characters),
    getMotionCacheStats: vi.fn(() => cacheStats),
    bakeMotion: vi.fn(async (_request: EditorV6MotionBakeRequest, _signal: AbortSignal) => ({} as EditorV6MotionBakeResult)),
    report,
    progress: vi.fn<(patch: Partial<EditorV6ExportStatus>) => void>(),
    saveReport: vi.fn(async () => {}),
    prepareMotions,
    ...overrides
  }
}

function createMotionProject(): EditorV6Document {
  const first: EditorV6Element = { id: 'actor', kind: 'character', characterId: 'character-1', text: 'Actor', x: 0, y: 0, width: 40, height: 60, rotation: 0, zIndex: 0, poseSlot: 0 }
  const next: EditorV6Element = { ...first, poseSlot: 1 }
  const track: EditorV6TimelineTrack = {
    id: 'character-track', kind: 'character', name: 'Actor', muted: false, locked: false,
    blocks: [
      { id: 'block-1', label: 'A', startFrame: 0, durationFrames: 10, state: first },
      { id: 'block-2', label: 'B', startFrame: 10, durationFrames: 10, state: next }
    ]
  }
  return { ...createProject(), elements: [first], timeline: { fps: 30, durationFrames: 20, tracks: [track] } }
}

describe('preparação do estado pronto para exportar no Editor V6', () => {
  it('carrega personagens, prepara movimentos, publica progresso e salva os diagnósticos', async () => {
    const dependencies = createDependencies()

    const result = await prepareEditorV6ExportReadiness(dependencies)

    expect(result).toEqual({ project: dependencies.project, characters: [] })
    expect(dependencies.getCharacters).toHaveBeenCalledOnce()
    expect(dependencies.prepareMotions).toHaveBeenCalledWith(expect.objectContaining({
      project: dependencies.project,
      options: dependencies.options,
      testSettings: dependencies.testSettings,
      characters: [],
      signal: dependencies.signal,
      motionPreparationConcurrency: 2,
      motionCacheScope: 'synthetic-scope',
      cacheBefore: expect.any(Object),
      getMotionCacheStats: dependencies.getMotionCacheStats,
      bakeMotion: dependencies.bakeMotion
    }))
    expect(dependencies.progress).toHaveBeenCalledWith(expect.objectContaining({ state: 'preparing', motionProgress: { completed: 1, total: 2 } }))
    expect(dependencies.report).toMatchObject({
      hairPreparation: dependencies.hairPreparation,
      motionTransitionsRequired: 2,
      motionTransitionsPrepared: 2,
      motionPreparation: createStats(),
      motionCache: createMotionCacheReport()
    })
    expect(dependencies.report.phaseMilliseconds.characterLoading).toBeGreaterThanOrEqual(0)
    expect(dependencies.report.phaseMilliseconds.motionPreparation).toBeGreaterThanOrEqual(0)
    expect(dependencies.saveReport).toHaveBeenCalledOnce()
  })

  it('interrompe a exportação se a preparação não entregar todos os movimentos', async () => {
    const project = createMotionProject()
    const dependencies = createDependencies({
      project,
      options: { ...createDependencies().options, endFrame: 20 },
      prepareMotions: vi.fn<EditorV6ExportMotionPreparation>(async () => ({ project, stats: createStats(), motionCache: createMotionCacheReport() }))
    })

    await expect(prepareEditorV6ExportReadiness(dependencies)).rejects.toThrow('Não foi possível preparar todas as transições deste intervalo.')

    expect(dependencies.report.motionTransitionsRequired).toBe(2)
    expect(dependencies.saveReport).not.toHaveBeenCalled()
  })

  it('respeita o cancelamento antes de carregar personagens ou iniciar bake', async () => {
    const controller = new AbortController()
    const cancelled = new Error('exportação cancelada')
    controller.abort(cancelled)
    const dependencies = createDependencies({ signal: controller.signal })

    await expect(prepareEditorV6ExportReadiness(dependencies)).rejects.toBe(cancelled)

    expect(dependencies.getCharacters).not.toHaveBeenCalled()
    expect(dependencies.prepareMotions).not.toHaveBeenCalled()
    expect(dependencies.saveReport).not.toHaveBeenCalled()
  })
})

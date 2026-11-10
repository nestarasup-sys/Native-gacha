import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EditorV6Document } from '../../src/shared/editorV6'
import type { EditorV6MotionBakeRequest, EditorV6MotionBakeResult } from '../../src/shared/editorV6Motion'
import { editorV6ExportTestSettings } from '../../src/shared/editorV6ExportTestModes'

vi.mock('../../electron/domains/editorV6/prepareMotions', () => ({ prepareExportMotions: vi.fn() }))
vi.mock('../../electron/domains/editorV6/motionCache', () => ({ motionCacheKey: vi.fn() }))

import { motionCacheKey } from '../../electron/domains/editorV6/motionCache'
import { prepareExportMotions } from '../../electron/domains/editorV6/prepareMotions'
import { prepareEditorV6ExportMotions } from '../../electron/domains/editorV6/exportMotionPreparation'

const stats = {
  total: 3, unique: 2, requested: 1, reused: 2, preparedRigs: 4, reusedRigs: 2,
  rigKeyLookups: 6, rigRebuilds: 1, rigBuildMilliseconds: 12, maxConcurrentBakes: 2,
  milliseconds: 80, requestMilliseconds: [20, 30]
} satisfies Awaited<ReturnType<typeof prepareExportMotions>>['stats']

function cacheStats(value: number) {
  return {
    memoryHits: value, diskHits: value, misses: value, rasterized: value, diskMissing: value,
    diskRejected: value, diskReadErrors: value, diskWrites: value, diskWriteSkipped: value,
    diskWriteErrors: value, diskBytesRead: value, diskBytesWritten: value
  }
}

function createDependencies(overrides: Partial<Parameters<typeof prepareEditorV6ExportMotions>[0]> = {}) {
  const project = { id: 'project-synthetic' } as EditorV6Document
  return {
    project,
    options: { startFrame: 10, endFrame: 40, mouthLoopCycleFrames: 24, testMode: 'movimentos-1' as const },
    testSettings: editorV6ExportTestSettings('movimentos-1'),
    characters: [],
    signal: new AbortController().signal,
    motionPreparationConcurrency: 3 as const,
    motionCacheScope: 'scope-synthetic',
    getMotionCacheStats: vi.fn(),
    bakeMotion: vi.fn(async () => ({} as EditorV6MotionBakeResult)),
    onProgress: vi.fn(),
    ...overrides
  }
}

function request(characterId: string, key: string): EditorV6MotionBakeRequest {
  return {
    id: `request-${key}`,
    plan: { key } as EditorV6MotionBakeRequest['plan'],
    character: { id: characterId } as EditorV6MotionBakeRequest['character']
  }
}

describe('preparação de movimentos da exportação do Editor V6', () => {
  beforeEach(() => {
    vi.mocked(prepareExportMotions).mockReset()
    vi.mocked(motionCacheKey).mockReset().mockImplementation((input) => `cache-${input.plan.key}`)
  })

  afterEach(() => vi.clearAllMocks())

  it('encaminha configuração de boca, concorrência do modo de teste e progresso', async () => {
    const preparedProject = { id: 'project-prepared' } as EditorV6Document
    const dependencies = createDependencies()
    vi.mocked(prepareExportMotions).mockImplementation(async (_project, _startFrame, _endFrame, preparation) => {
      preparation.progress(1, 3, 'personagem sintético')
      return { project: preparedProject, stats } as never
    })

    const result = await prepareEditorV6ExportMotions(dependencies)

    expect(prepareExportMotions).toHaveBeenCalledWith(dependencies.project, 10, 40, expect.objectContaining({
      signal: dependencies.signal,
      characters: [],
      concurrency: 1,
      mouthLoop: { startFrame: 10, cycleFrames: 24 }
    }))
    expect(dependencies.onProgress).toHaveBeenCalledWith(1, 3, 'personagem sintético')
    expect(result).toMatchObject({ project: preparedProject, stats })
  })

  it('usa a concorrência configurada fora dos modos de teste e retorna a diferença de cache com até três personagens-amostra', async () => {
    const dependencies = createDependencies({
      options: { startFrame: 0, endFrame: 30 },
      motionPreparationConcurrency: 3,
      cacheBefore: cacheStats(4),
      getMotionCacheStats: vi.fn().mockReturnValue(cacheStats(7))
    })
    const requests = [request('a', 'one'), request('a', 'same-character'), request('b', 'two'), request('c', 'three'), request('d', 'four')]
    vi.mocked(prepareExportMotions).mockImplementation(async (_project, _startFrame, _endFrame, preparation) => {
      for (const item of requests) await preparation.bake(item, dependencies.signal)
      return { project: dependencies.project, stats } as never
    })

    const result = await prepareEditorV6ExportMotions(dependencies)

    expect(prepareExportMotions).toHaveBeenCalledWith(dependencies.project, 0, 30, expect.objectContaining({ concurrency: 3 }))
    expect(dependencies.bakeMotion).toHaveBeenCalledTimes(5)
    expect(dependencies.bakeMotion).toHaveBeenCalledWith(expect.objectContaining({ cacheScope: 'scope-synthetic' }), dependencies.signal)
    expect(result.motionCache).toMatchObject({ memoryHits: 3, diskHits: 3, misses: 3 })
    expect(result.motionCache?.inputSamples.map((sample) => sample.characterId)).toEqual(['a', 'b', 'c'])
    expect(result.motionCache?.inputSamples.every((sample) => /^[a-f0-9]{64}$/.test(sample.planKeyHash) && /^[a-f0-9]{64}$/.test(sample.characterFingerprint))).toBe(true)
  })

  it('propaga falha do preparo sem consultar contadores de cache posteriores', async () => {
    const failure = new Error('Falha sintética no preparo')
    const getMotionCacheStats = vi.fn().mockReturnValue(cacheStats(1))
    const dependencies = createDependencies({ cacheBefore: cacheStats(0), getMotionCacheStats })
    vi.mocked(prepareExportMotions).mockRejectedValue(failure)

    await expect(prepareEditorV6ExportMotions(dependencies)).rejects.toBe(failure)

    expect(getMotionCacheStats).not.toHaveBeenCalled()
  })
})

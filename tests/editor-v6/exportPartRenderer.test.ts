import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { join } from 'node:path'
import type { EditorV6Document } from '../../src/shared/editorV6'
import type { EditorV6ExportOptions } from '../../src/shared/editorV6Export'
import { editorV6ExportTestSettings } from '../../src/shared/editorV6ExportTestModes'

vi.mock('../../src/shared/editorV6VideoComposition', () => ({ planEditorV6VideoOverlays: vi.fn(() => []) }))
vi.mock('../../electron/domains/editorV6/prepareMouthLoops', () => ({ prepareExportMouthLoops: vi.fn() }))
vi.mock('../../electron/domains/editorV6/exportProcess', () => ({
  spawnExportProcess: vi.fn(),
  waitForExport: vi.fn((operation: Promise<unknown>) => operation)
}))
vi.mock('../../electron/domains/editorV6/exportMediaProbe', () => ({ probeExportMedia: vi.fn() }))
vi.mock('../../electron/domains/editorV6/exportVideoComposition', () => ({ buildEditorV6VideoComposition: vi.fn() }))

import { planEditorV6VideoOverlays } from '../../src/shared/editorV6VideoComposition'
import { prepareExportMouthLoops } from '../../electron/domains/editorV6/prepareMouthLoops'
import { spawnExportProcess, waitForExport } from '../../electron/domains/editorV6/exportProcess'
import { probeExportMedia } from '../../electron/domains/editorV6/exportMediaProbe'
import { buildEditorV6VideoComposition } from '../../electron/domains/editorV6/exportVideoComposition'
import type { EditorV6FrameWorker } from '../../electron/domains/editorV6/exportWorkers'
import { renderEditorV6ExportPart } from '../../electron/domains/editorV6/exportPartRenderer'

function mockProcess(exitCode: number | null = 0) {
  const stdin = {
    write: vi.fn((_bitmap: Buffer, callback?: (error?: Error | null) => void) => { callback?.(); return true }),
    end: vi.fn()
  }
  const child = { pid: 321, exitCode, stdin, kill: vi.fn() }
  const done = Promise.resolve({ stdout: '', stderr: '' })
  return { value: { child, done } as unknown as ReturnType<typeof spawnExportProcess>, child, stdin }
}

function mockWorker(frame = vi.fn(async (index: number) => ({ reused: false, bitmap: Buffer.from([index + 1]), timings: { faceCompositionMs: 2 }, metrics: { hairRasterFrames: 1 } }))) {
  const close = vi.fn()
  return { value: { frame, close } as EditorV6FrameWorker, frame, close }
}

function createDependencies(overrides: Partial<Parameters<typeof renderEditorV6ExportPart>[0]> = {}) {
  const project = { id: 'project-synthetic' } as EditorV6Document
  const part = { index: 0, startFrame: 0, endFrame: 2 }
  const options: EditorV6ExportOptions = { startFrame: 0, endFrame: 2, width: 320, height: 180, turbo: false, encoder: 'cpu' }
  return {
    project,
    part,
    attemptNumber: 2,
    attemptPartCount: 1,
    exportStartedAt: performance.now() - 10,
    encoder: 'libx264',
    parallelism: 1,
    options,
    layeredVideo: false,
    speechInRange: false,
    characters: [],
    testSettings: editorV6ExportTestSettings(),
    folder: 'C:/synthetic/temp',
    ffmpeg: 'ffmpeg.exe',
    ffprobe: 'ffprobe.exe',
    motionCacheScope: 'scope-synthetic',
    signal: new AbortController().signal,
    abort: vi.fn(),
    completedFrames: vi.fn(() => 0),
    createWorker: vi.fn(async () => mockWorker().value),
    bakeMotion: vi.fn(),
    mediaPath: vi.fn(),
    onFfmpegProcessStarted: vi.fn(),
    progress: vi.fn(),
    onMouthPrepared: vi.fn(),
    onPartCreated: vi.fn(),
    onFrameWritten: vi.fn(),
    ...overrides
  }
}

describe('renderização de um trecho da exportação do Editor V6', () => {
  beforeEach(() => {
    vi.mocked(planEditorV6VideoOverlays).mockReturnValue([])
    vi.mocked(prepareExportMouthLoops).mockReset()
    vi.mocked(spawnExportProcess).mockReset()
    vi.mocked(waitForExport).mockReset().mockImplementation((operation) => operation)
    vi.mocked(probeExportMedia).mockReset().mockResolvedValue({
      streams: [{ codec_type: 'video', codec_name: 'h264', nb_frames: '2' }], format: { duration: '0.066' }
    })
    vi.mocked(buildEditorV6VideoComposition).mockReset().mockReturnValue({ rawHeight: 180, videoInputs: [], filterArgs: [] })
  })

  afterEach(() => vi.clearAllMocks())

  it('registra, compõe, escreve, valida e fecha os recursos de um trecho', async () => {
    const process = mockProcess()
    vi.mocked(spawnExportProcess).mockReturnValue(process.value)
    const renderedWorker = mockWorker()
    const dependencies = createDependencies({ createWorker: vi.fn(async () => renderedWorker.value) })

    const result = await renderEditorV6ExportPart(dependencies)

    expect(dependencies.onPartCreated).toHaveBeenCalledTimes(1)
    expect(dependencies.onPartCreated).toHaveBeenCalledWith(result)
    expect(planEditorV6VideoOverlays).toHaveBeenCalledWith(dependencies.project, 0, 2)
    expect(buildEditorV6VideoComposition).toHaveBeenCalledWith(expect.objectContaining({ width: 320, height: 180, layeredVideo: false }))
    expect(spawnExportProcess).toHaveBeenCalledWith('ffmpeg.exe', expect.arrayContaining(['320x180']), dependencies.signal)
    expect(process.stdin.write).toHaveBeenCalledTimes(2)
    expect(process.stdin.end).toHaveBeenCalledOnce()
    expect(probeExportMedia).toHaveBeenCalledWith('ffprobe.exe', result.path, dependencies.signal)
    expect(dependencies.onFfmpegProcessStarted).toHaveBeenCalledWith(321)
    expect(dependencies.onFrameWritten).toHaveBeenCalledTimes(2)
    expect(renderedWorker.close).toHaveBeenCalledOnce()
    expect(process.child.kill).not.toHaveBeenCalled()
    expect(result.path).toBe(join('C:/synthetic/temp', 'attempt-2-part-0.mp4'))
    expect(result).toMatchObject({ rendered: 2, reused: 0, frames: 2, probe: { streams: [{ nb_frames: '2' }] } })
    expect(result.frameMetrics).toEqual({ hairRasterFrames: 2 })
  })

  it('prepara os loops de fala antes de criar o worker e encaminha projeto e atlas preparados', async () => {
    const process = mockProcess()
    vi.mocked(spawnExportProcess).mockReturnValue(process.value)
    const project = { id: 'mouth-project' } as EditorV6Document
    const preparedProject = { id: 'mouth-project-prepared' } as EditorV6Document
    const mouthLoops = { startFrame: 0, cycleFrames: 30, states: [{ characterId: 'character-synthetic' }] }
    const mouth = { project: preparedProject, mouthLoops, stats: { states: 1, characters: 1, skipped: 0, skippedStale: 0, skippedUnsupported: 0, isolatedStates: 1, legacyPatchStates: 0, atlasBytes: 8, atlasPixels: 4, errors: [], milliseconds: 2 } }
    vi.mocked(prepareExportMouthLoops).mockResolvedValue(mouth as never)
    const renderedWorker = mockWorker()
    const createWorker = vi.fn(async () => renderedWorker.value)
    const dependencies = createDependencies({ project, speechInRange: true, completedFrames: () => 7, createWorker })

    await renderEditorV6ExportPart(dependencies)

    vi.mocked(prepareExportMouthLoops).mock.calls[0]?.[4].progress(0, 1, 'boca sintética')
    expect(prepareExportMouthLoops).toHaveBeenCalledWith(project, 0, 2, 30, expect.objectContaining({ signal: dependencies.signal, characters: [] }), 0, 1, 2)
    expect(dependencies.onMouthPrepared).toHaveBeenCalledWith(mouth)
    expect(createWorker).toHaveBeenCalledWith(preparedProject, dependencies.part, dependencies.signal, false, mouthLoops)
    expect(dependencies.progress).toHaveBeenCalledWith(expect.objectContaining({ state: 'preparing', frames: 7 }))
  })

  it('aborta sem iniciar FFmpeg quando a preparação de fala falha', async () => {
    const failure = new Error('Falha sintética na preparação da fala')
    vi.mocked(prepareExportMouthLoops).mockRejectedValue(failure)
    const dependencies = createDependencies({ speechInRange: true })

    await expect(renderEditorV6ExportPart(dependencies)).rejects.toBe(failure)

    expect(dependencies.abort).toHaveBeenCalledWith(failure)
    expect(dependencies.onPartCreated).not.toHaveBeenCalled()
    expect(spawnExportProcess).not.toHaveBeenCalled()
  })

  it('mata o processo e preserva o relatório parcial quando o worker falha', async () => {
    const failure = new Error('Falha sintética do worker')
    const process = mockProcess(null)
    vi.mocked(spawnExportProcess).mockReturnValue(process.value)
    const dependencies = createDependencies({ createWorker: vi.fn(async () => { throw failure }) })

    await expect(renderEditorV6ExportPart(dependencies)).rejects.toBe(failure)

    expect(dependencies.abort).toHaveBeenCalledWith(failure)
    expect(process.child.kill).toHaveBeenCalledOnce()
    expect(dependencies.onPartCreated).toHaveBeenCalledTimes(1)
    expect(dependencies.onPartCreated.mock.calls[0]?.[0].finishedAtOffsetMs).toBeTypeOf('number')
  })
})

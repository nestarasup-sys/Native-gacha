import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'
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
import { editorV6PipeRawCaptureFirstFrame, editorV6PipeRawCaptureFrameCount, editorV6PipeRawCaptureKind } from '../../electron/domains/editorV6/pipeRawCaptureWindow'
import type { EditorV6FrameWorker } from '../../electron/domains/editorV6/exportWorkers'
import { renderEditorV6ExportPart } from '../../electron/domains/editorV6/exportPartRenderer'

function mockProcess(exitCode: number | null = 0) {
  const stdin = Object.assign(new EventEmitter(), {
    write: vi.fn((_bitmap: Buffer, callback?: (error?: Error | null) => void) => { callback?.(); return true }),
    end: vi.fn((callback?: (error?: Error | null) => void) => callback?.()),
    writableLength: 0,
    writableHighWaterMark: 16_384,
    writableNeedDrain: false,
    destroyed: false,
    writableEnded: false,
    errored: null as Error | null
  })
  const child = { pid: 321, exitCode, stdin, kill: vi.fn() }
  const done = Promise.resolve({ stdout: '', stderr: '' })
  const getDiagnosticSnapshot = vi.fn(() => ({
    pid: 321,
    exitCode: child.exitCode,
    signalCode: null,
    killed: child.exitCode === null,
    stderrTail: 'synthetic FFmpeg stderr',
    stdin: { writableLength: stdin.writableLength, writableHighWaterMark: stdin.writableHighWaterMark, writableNeedDrain: stdin.writableNeedDrain, destroyed: stdin.destroyed, writableEnded: stdin.writableEnded },
    eventCounts: { 'stdin.error': 1 },
    events: [{ event: 'stdin.error', offsetMs: 5, stdin: { writableLength: stdin.writableLength, writableHighWaterMark: stdin.writableHighWaterMark, writableNeedDrain: stdin.writableNeedDrain, destroyed: stdin.destroyed, writableEnded: stdin.writableEnded } }]
  }))
  return { value: { child, done, getDiagnosticSnapshot } as unknown as ReturnType<typeof spawnExportProcess>, child, stdin, getDiagnosticSnapshot }
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
    vi.stubEnv('GACHA_EDITOR_V6_NUT_UNIQUE_FRAMES', '0')
    vi.mocked(planEditorV6VideoOverlays).mockReturnValue([])
    vi.mocked(prepareExportMouthLoops).mockReset()
    vi.mocked(spawnExportProcess).mockReset()
    vi.mocked(waitForExport).mockReset().mockImplementation((operation) => operation)
    vi.mocked(probeExportMedia).mockReset().mockResolvedValue({
      streams: [{ codec_type: 'video', codec_name: 'h264', nb_frames: '2' }], format: { duration: '0.066' }
    })
    vi.mocked(buildEditorV6VideoComposition).mockReset().mockReturnValue({ rawHeight: 180, videoInputs: [], filterArgs: [] })
  })

  afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks() })

  it('registra, compõe, escreve, valida e fecha os recursos de um trecho', async () => {
    vi.stubEnv('GACHA_EDITOR_V6_PHASE2_DIAGNOSTICS', '1')
    const process = mockProcess()
    vi.mocked(spawnExportProcess).mockReturnValue(process.value)
    const renderedWorker = mockWorker()
    const dependencies = createDependencies({ createWorker: vi.fn(async () => renderedWorker.value) })

    const result = await renderEditorV6ExportPart(dependencies)

    expect(dependencies.onPartCreated).toHaveBeenCalledTimes(1)
    expect(dependencies.onPartCreated).toHaveBeenCalledWith(result)
    expect(planEditorV6VideoOverlays).not.toHaveBeenCalled()
    expect(buildEditorV6VideoComposition).toHaveBeenCalledWith(expect.objectContaining({ width: 320, height: 180, layeredVideo: false }))
    expect(spawnExportProcess).toHaveBeenCalledWith('ffmpeg.exe', expect.arrayContaining(['320x180']), dependencies.signal)
    expect(process.stdin.write).toHaveBeenCalledTimes(2)
    expect(process.getDiagnosticSnapshot).not.toHaveBeenCalled()
    expect(process.stdin.end).toHaveBeenCalledOnce()
    expect(probeExportMedia).toHaveBeenCalledWith('ffprobe.exe', result.path, dependencies.signal)
    expect(dependencies.onFfmpegProcessStarted).toHaveBeenCalledWith(321)
    expect(dependencies.onFrameWritten).toHaveBeenCalledTimes(2)
    expect(renderedWorker.close).toHaveBeenCalledOnce()
    expect(process.child.kill).not.toHaveBeenCalled()
    expect(result.path).toBe(join('C:/synthetic/temp', 'attempt-2-part-0.mp4'))
    expect(result).toMatchObject({ rendered: 2, reused: 0, frames: 2, probe: { streams: [{ nb_frames: '2' }] } })
    expect(result.frameMetrics).toEqual({ hairRasterFrames: 2 })
    expect(result.framePipelineOverlap).toBe(true)
    expect(result.frameRafGate).toBe(false)
    expect(result.frameLayerCapture).toBe('single')
  })

  it('aplica e registra a política padrão de threads em trechos com e sem vídeo', async () => {
    vi.stubEnv('GACHA_VIDEO_STRESS_OFFSCREEN', '1')
    vi.stubEnv('GACHA_EDITOR_V6_STRESS_CAPTURE_FFMPEG_ARGS', '1')
    vi.mocked(spawnExportProcess).mockReturnValue(mockProcess().value)

    const withoutVideo = await renderEditorV6ExportPart(createDependencies())
    expect(withoutVideo.filterThreads).toBe(2)
    expect(withoutVideo.ffmpegArgs).toEqual(expect.arrayContaining([
      '-filter_threads', '2', '-filter_complex_threads', '2', '-threads', '2'
    ]))
    expect(withoutVideo.ffmpegArgs?.indexOf('-filter_threads')).toBeLessThan(withoutVideo.ffmpegArgs?.indexOf('-i') ?? -1)

    vi.mocked(planEditorV6VideoOverlays).mockReturnValue([{
      blockId: 'video', fileName: 'video.mp4', startFrame: 0, endFrame: 2, mediaInFrame: 0,
      layout: { x: 0, y: 0, width: 100, height: 100, rotation: 0 }
    }])
    vi.mocked(buildEditorV6VideoComposition).mockReturnValue({
      rawHeight: 180, videoInputs: ['-i', 'video.mp4'], filterArgs: ['-filter_complex', '[1:v]null[v]']
    })
    const withVideo = await renderEditorV6ExportPart(createDependencies({ layeredVideo: true }))
    expect(withVideo.ffmpegArgs).toEqual(expect.arrayContaining([
      '-filter_threads', '2', '-filter_complex_threads', '2', '-i', 'video.mp4', '-filter_complex', '[1:v]null[v]', '-threads', '2'
    ]))
  })

  it('preserva CFR somente quando o harness solicita explicitamente', async () => {
    vi.stubEnv('GACHA_EDITOR_V6_NUT_UNIQUE_FRAMES', '0')
    const process = mockProcess()
    vi.mocked(spawnExportProcess).mockReturnValue(process.value)
    const frames = [
      { reused: false, bitmap: Buffer.from([1, 2, 3, 4]) },
      { reused: true, bitmap: undefined },
      { reused: false, bitmap: Buffer.from([5, 6, 7, 8]) },
      { reused: false, bitmap: Buffer.from([5, 6, 7, 8]) }
    ]
    let frameIndex = 0
    const renderedWorker = mockWorker(vi.fn(async () => frames[frameIndex++]!))
    const dependencies = createDependencies({
      part: { index: 0, startFrame: 0, endFrame: 4 },
      options: { ...createDependencies().options, endFrame: 4 },
      createWorker: vi.fn(async () => renderedWorker.value)
    })
    vi.mocked(probeExportMedia).mockResolvedValueOnce({
      streams: [{ codec_type: 'video', codec_name: 'h264', nb_frames: '4' }], format: { duration: '0.133' }
    })

    await renderEditorV6ExportPart(dependencies)

    const spawnArgs = vi.mocked(spawnExportProcess).mock.calls[0]?.[1] ?? []
    expect(spawnArgs).toContain('rawvideo')
    expect(spawnArgs).not.toContain('nut')
    expect(process.stdin.end).toHaveBeenCalledOnce()
    expect(dependencies.onPartCreated.mock.calls[0]?.[0].nutUniqueInput).toBeUndefined()
  })

  it('usa NUT por padrão, preserva FPS e escreve o marcador terminal', async () => {
    vi.unstubAllEnvs()
    const process = mockProcess()
    vi.mocked(spawnExportProcess).mockReturnValue(process.value)
    const frames = [
      { reused: false, bitmap: Buffer.from([1, 2, 3, 4]) },
      { reused: true, bitmap: undefined },
      { reused: false, bitmap: Buffer.from([5, 6, 7, 8]) },
      { reused: false, bitmap: Buffer.from([5, 6, 7, 8]) }
    ]
    let frameIndex = 0
    const renderedWorker = mockWorker(vi.fn(async () => frames[frameIndex++]!))
    vi.mocked(buildEditorV6VideoComposition).mockReturnValue({ rawHeight: 1, videoInputs: [], filterArgs: [] })
    const dependencies = createDependencies({
      part: { index: 0, startFrame: 0, endFrame: 4 },
      options: { ...createDependencies().options, width: 1, height: 1, endFrame: 4 },
      createWorker: vi.fn(async () => renderedWorker.value)
    })
    vi.mocked(probeExportMedia).mockResolvedValueOnce({
      streams: [{ codec_type: 'video', codec_name: 'h264', nb_frames: '4' }], format: { duration: '0.133' }
    })

    const result = await renderEditorV6ExportPart(dependencies)

    const spawnArgs = vi.mocked(spawnExportProcess).mock.calls[0]?.[1] ?? []
    expect(spawnArgs.slice(spawnArgs.indexOf('-f'), spawnArgs.indexOf('-f') + 4)).toEqual(['-f', 'nut', '-i', 'pipe:0'])
    expect(spawnArgs).not.toContain('rawvideo')
    expect(buildEditorV6VideoComposition).toHaveBeenCalledWith(expect.objectContaining({ inputFrameRate: 30 }))
    expect(process.stdin.end).toHaveBeenCalledOnce()
    expect(result).toMatchObject({
      frames: 4,
      nutUniqueInput: {
        logicalFrames: 4,
        uniqueRunFrames: 2,
        repeatedFrames: 2,
        framePackets: 3,
        bitmapPayloadBytes: 12
      }
    })
    expect(result.nutUniqueInput!.nutBytesWritten).toBeGreaterThan(result.nutUniqueInput!.bitmapPayloadBytes)
  })

  it('não combina a flag NUT com a captura bruta de diagnóstico', async () => {
    vi.stubEnv('GACHA_EDITOR_V6_NUT_UNIQUE_FRAMES', '1')
    vi.stubEnv('GACHA_EDITOR_V6_PIPE_RAW_CAPTURE_DIRECTORY', 'out/editor-v6-stress/dumps/synthetic')

    await expect(renderEditorV6ExportPart(createDependencies())).rejects.toThrow('não pode combinar')

    expect(spawnExportProcess).not.toHaveBeenCalled()
  })

  it('descarta os quadros sem iniciar FFmpeg apenas no modo isolado do teto do produtor', async () => {
    vi.stubEnv('GACHA_VIDEO_STRESS_OFFSCREEN', '1')
    vi.stubEnv('GACHA_EDITOR_V6_PRODUCER_ONLY', '1')
    const renderedWorker = mockWorker()
    const dependencies = createDependencies({ createWorker: vi.fn(async () => renderedWorker.value) })

    const result = await renderEditorV6ExportPart(dependencies)

    expect(spawnExportProcess).not.toHaveBeenCalled()
    expect(probeExportMedia).not.toHaveBeenCalled()
    expect(result).toMatchObject({ pipeSink: 'discard', rendered: 2, reused: 0, frames: 2, stage: 'completed' })
    expect(renderedWorker.frame).toHaveBeenCalledTimes(2)
    expect(renderedWorker.close).toHaveBeenCalledOnce()
    expect(dependencies.onFrameWritten).toHaveBeenCalledTimes(2)
  })

  it('rejeita o descarte do pipe fora do harness isolado', async () => {
    vi.stubEnv('GACHA_EDITOR_V6_PRODUCER_ONLY', '1')

    await expect(renderEditorV6ExportPart(createDependencies())).rejects.toThrow('harness isolado')

    expect(spawnExportProcess).not.toHaveBeenCalled()
  })

  it('captures process and pipe state for a failed write only when failure diagnostics are enabled', async () => {
    vi.stubEnv('GACHA_EDITOR_V6_PIPE_FAILURE_DIAGNOSTICS', '1')
    const process = mockProcess(null)
    const writeError = Object.assign(Error('write UNKNOWN'), { code: 'UNKNOWN', syscall: 'write' })
    process.stdin.write.mockImplementationOnce((_bitmap, callback) => {
      process.stdin.writableLength = 4096
      process.stdin.writableNeedDrain = true
      callback?.(writeError)
      return false
    })
    vi.mocked(spawnExportProcess).mockReturnValue(process.value)
    const dependencies = createDependencies()

    await expect(renderEditorV6ExportPart(dependencies)).rejects.toThrow('write UNKNOWN')

    const part = vi.mocked(dependencies.onPartCreated).mock.calls[0]?.[0]
    expect(part).toMatchObject({
      failedOutputFrame: 0,
      pipeFailureContext: {
        partIndex: 0,
        outputFrame: 0,
        bytes: 1,
        writableLengthBefore: 0,
        writableNeedDrainBefore: false,
        writableLengthAtFailure: 4096,
        writableNeedDrainAtFailure: true,
        error: { name: 'Error', message: 'write UNKNOWN', code: 'UNKNOWN', syscall: 'write' },
        processAtFailure: { pid: 321, stderrTail: 'synthetic FFmpeg stderr' },
        processAfterStop: { exitCode: null, killed: true }
      }
    })
    expect(process.getDiagnosticSnapshot).toHaveBeenCalledTimes(2)
    expect(process.child.kill).toHaveBeenCalledOnce()
  })

  it('stores recent write buffers and FFmpeg exit state only when failure diagnostics are enabled', async () => {
    vi.stubEnv('GACHA_EDITOR_V6_PIPE_FAILURE_DIAGNOSTICS', '1')
    const process = mockProcess(0)
    vi.mocked(spawnExportProcess).mockReturnValue(process.value)
    const result = await renderEditorV6ExportPart(createDependencies())

    expect(result.pipeWriteDiagnostics?.process).toMatchObject({
      pid: 321,
      exitCode: 0,
      signalCode: null,
      stderrTail: 'synthetic FFmpeg stderr'
    })
    expect(result.pipeWriteDiagnostics?.recentWrites).toHaveLength(2)
    expect(result.pipeWriteDiagnostics?.recentWrites).toMatchObject([
      { partIndex: 0, outputFrame: 0, bytes: 1, writableLengthBefore: 0, writableLengthAfter: 0 },
      { partIndex: 0, outputFrame: 1, bytes: 1, writableLengthBefore: 0, writableLengthAfter: 0 }
    ])
    expect(result.pipeFailureContext).toBeUndefined()
    expect(process.getDiagnosticSnapshot).toHaveBeenCalledOnce()
  })

  it('uses serial capture for layered video exports', async () => {
    const process = mockProcess()
    vi.mocked(spawnExportProcess).mockReturnValue(process.value)
    vi.mocked(planEditorV6VideoOverlays).mockReturnValue([{
      blockId: 'video', fileName: 'video.mp4', startFrame: 0, endFrame: 2, mediaInFrame: 0,
      layout: { x: 0, y: 0, width: 100, height: 100, rotation: 0 }
    }])
    const layered = await renderEditorV6ExportPart(createDependencies({ layeredVideo: true }))
    expect(layered.framePipelineOverlap).toBe(true)
    expect(layered.frameLayerCapture).toBe('serial')

    vi.stubEnv('GACHA_EDITOR_V6_NUT_UNIQUE_FRAMES', '0')
    vi.stubEnv('GACHA_EDITOR_V6_FRAME_OVERLAP', '0')
    const baseline = await renderEditorV6ExportPart(createDependencies())
    expect(baseline.framePipelineOverlap).toBe(false)
    expect(baseline.frames).toBe(2)
    vi.unstubAllEnvs()
  })

  it('usa uma única camada no trecho sem vídeo de um export com vídeos', async () => {
    vi.mocked(spawnExportProcess).mockReturnValue(mockProcess().value)
    const dependencies = createDependencies({ layeredVideo: true })

    const result = await renderEditorV6ExportPart(dependencies)

    expect(planEditorV6VideoOverlays).toHaveBeenCalledWith(dependencies.project, 0, 2)
    expect(result.frameLayerCapture).toBe('single')
    expect(dependencies.createWorker).toHaveBeenCalledWith(dependencies.project, dependencies.part, dependencies.signal, false, undefined)
    expect(buildEditorV6VideoComposition).toHaveBeenCalledWith(expect.objectContaining({ clips: [], layeredVideo: false }))
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

    const result = await renderEditorV6ExportPart(dependencies)
    expect(result.mouthPreparationMs).toBe(2)

    vi.mocked(prepareExportMouthLoops).mock.calls[0]?.[4].progress(0, 1, 'boca sintética')
    expect(prepareExportMouthLoops).toHaveBeenCalledWith(project, 0, 2, 30, expect.objectContaining({ signal: dependencies.signal, characters: [] }), 0, 1, 2)
    expect(dependencies.onMouthPrepared).toHaveBeenCalledWith(mouth)
    expect(createWorker).toHaveBeenCalledWith(preparedProject, dependencies.part, dependencies.signal, false, mouthLoops)
    expect(dependencies.progress).toHaveBeenCalledWith(expect.objectContaining({ state: 'preparing', frames: 7 }))
  })

  it('pula toda preparação de boca quando o perfil a desativa', async () => {
    const process = mockProcess()
    vi.mocked(spawnExportProcess).mockReturnValue(process.value)
    const dependencies = createDependencies({ speechInRange: true, options: { ...createDependencies().options, mouthLoop: false } })

    await renderEditorV6ExportPart(dependencies)

    expect(prepareExportMouthLoops).not.toHaveBeenCalled()
    expect(dependencies.onMouthPrepared).not.toHaveBeenCalled()
    expect(dependencies.createWorker).toHaveBeenCalledWith(dependencies.project, dependencies.part, dependencies.signal, false, undefined)
  })

  it('aborta sem iniciar FFmpeg quando a preparação de fala falha', async () => {
    const failure = new Error('Falha sintética na preparação da fala')
    vi.mocked(prepareExportMouthLoops).mockRejectedValue(failure)
    const dependencies = createDependencies({ speechInRange: true })

    await expect(renderEditorV6ExportPart(dependencies)).rejects.toBe(failure)

    expect(dependencies.abort).toHaveBeenCalledWith(failure)
    expect(dependencies.onPartCreated).toHaveBeenCalledWith(expect.objectContaining({
      stage: 'mouthPreparation', frames: 0, expectedFrames: 2, error: expect.stringContaining(failure.message),
      mouthPreparationMs: expect.any(Number)
    }))
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
    expect(dependencies.onPartCreated.mock.calls[0]?.[0]).toMatchObject({ stage: 'workerStartup', error: expect.stringContaining(failure.message) })
  })
})

describe('janela de captura bruta do pipe', () => {
  it('mantém 150 quadros por padrão e permite configurar a parte completa de 600 quadros', () => {
    expect(editorV6PipeRawCaptureKind()).toBeUndefined()
    expect(editorV6PipeRawCaptureKind('with-video')).toBe('with-video')
    expect(editorV6PipeRawCaptureKind('without-video')).toBe('without-video')
    expect(editorV6PipeRawCaptureFrameCount()).toBe(150)
    expect(editorV6PipeRawCaptureFrameCount('600')).toBe(600)
    expect(editorV6PipeRawCaptureFirstFrame('without-video', 0, 600)).toBe(0)
    expect(editorV6PipeRawCaptureFirstFrame('with-video', 600, 1200)).toBe(600)
    expect(editorV6PipeRawCaptureFirstFrame('with-video', 600, 1200, '164')).toBe(764)
    expect(editorV6PipeRawCaptureFirstFrame('with-video', 600, 1200, undefined, 600)).toBe(600)
  })

  it('recusa contagens/deslocamentos inválidos ou janelas que ultrapassam a parte', () => {
    expect(() => editorV6PipeRawCaptureKind('both')).toThrow('tipo de captura')
    expect(() => editorV6PipeRawCaptureFrameCount('0')).toThrow('entre 1 e 600')
    expect(() => editorV6PipeRawCaptureFrameCount('601')).toThrow('entre 1 e 600')
    expect(() => editorV6PipeRawCaptureFrameCount('1.5')).toThrow('entre 1 e 600')
    expect(() => editorV6PipeRawCaptureFirstFrame('with-video', 600, 1200, '-1')).toThrow('não negativo')
    expect(() => editorV6PipeRawCaptureFirstFrame('with-video', 600, 1200, '1.5')).toThrow('número inteiro')
    expect(() => editorV6PipeRawCaptureFirstFrame('with-video', 600, 1200, '451')).toThrow('caber dentro')
    expect(() => editorV6PipeRawCaptureFirstFrame('with-video', 600, 1200, '1', 600)).toThrow('caber dentro')
  })
})

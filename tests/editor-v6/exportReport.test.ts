import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EditorV6Document } from '../../src/shared/editorV6'
import { editorV6ExportTestSettings } from '../../src/shared/editorV6ExportTestModes'
import type { EditorV6ExportOptions } from '../../src/shared/editorV6Export'

vi.mock('../../src/shared/editorV6VideoComposition', () => ({ planEditorV6VideoOverlays: vi.fn(() => []) }))

import { planEditorV6VideoOverlays } from '../../src/shared/editorV6VideoComposition'
import { createEditorV6ExportReportContext } from '../../electron/domains/editorV6/exportReport'

function createInput() {
  const project = { id: 'project-synthetic' } as EditorV6Document
  const options: EditorV6ExportOptions = {
    startFrame: 30,
    endFrame: 150,
    width: 320,
    height: 180,
    turbo: true,
    encoder: 'cpu',
    mouthLoop: true
  }
  return { project, options, testSettings: editorV6ExportTestSettings(), id: 'job-synthetic', outputPath: 'C:/synthetic/output.mp4' }
}

describe('contexto e relatório inicial da exportação do Editor V6', () => {
  beforeEach(() => vi.mocked(planEditorV6VideoOverlays).mockReset())
  afterEach(() => vi.clearAllMocks())

  it('cria relatório compatível e calcula camada e entradas únicas a partir do plano de vídeos', () => {
    vi.mocked(planEditorV6VideoOverlays).mockReturnValue([
      { fileName: 'video-a.mp4' },
      { fileName: 'video-a.mp4' },
      { fileName: 'video-b.mp4' }
    ] as never)
    const input = createInput()
    const before = performance.now()

    const context = createEditorV6ExportReportContext(input)

    expect(planEditorV6VideoOverlays).toHaveBeenCalledOnce()
    expect(planEditorV6VideoOverlays).toHaveBeenCalledWith(input.project, 30, 150)
    expect(context.layeredVideo).toBe(true)
    expect(context.totalFrames).toBe(120)
    expect(context.started).toBeGreaterThanOrEqual(before)
    expect(context.report).toMatchObject({
      schemaVersion: 1,
      id: 'job-synthetic',
      projectId: 'project-synthetic',
      options: input.options,
      fps: 30,
      totalFrames: 120,
      state: 'preparing',
      fallback: false,
      attempts: [],
      encoderTests: [],
      audioClips: 0,
      videoInputs: 2,
      proxies: 0,
      motionTransitionsRequired: 0,
      motionTransitionsPrepared: 0,
      phaseMilliseconds: { temporarySetup: 0, characterLoading: 0, motionPreparation: 0, encoderProbe: 0, rendering: 0, finalization: 0, publication: 0 },
      outputPath: input.outputPath
    })
    expect(Number.isFinite(Date.parse(context.report.startedAt))).toBe(true)
    expect(context.report.runtime).toMatchObject({ platform: process.platform, arch: process.arch, node: process.versions.node })
    expect(context.report.mainProcessMemory).toMatchObject({
      startRssBytes: expect.any(Number),
      peakRssBytes: expect.any(Number),
      sampleIntervalMs: 500
    })
  })

  it('inicializa sem camada de vídeo quando o intervalo não tem clips', () => {
    vi.mocked(planEditorV6VideoOverlays).mockReturnValue([])

    const context = createEditorV6ExportReportContext(createInput())

    expect(context.layeredVideo).toBe(false)
    expect(context.report.videoInputs).toBe(0)
  })
})

import { describe, expect, it } from 'vitest'
import type { EditorV6Document } from '../../src/shared/editorV6'
import type { EditorV6ExportOptions } from '../../src/shared/editorV6Export'
import { createEditorV6ExportExecutionPlan } from '../../electron/domains/editorV6/exportPlanning'

function createOptions(overrides: Partial<EditorV6ExportOptions> = {}): EditorV6ExportOptions {
  return { startFrame: 0, endFrame: 600, width: 320, height: 180, turbo: true, encoder: 'cpu', ...overrides }
}

function createProject(durationFrames: number, tracks: EditorV6Document['timeline']['tracks'] = []): EditorV6Document {
  return { id: 'project-synthetic', timeline: { durationFrames, tracks } } as EditorV6Document
}

function speechTrack(overrides: Record<string, unknown> = {}) {
  return {
    kind: 'speech',
    blocks: [{ characterId: 'character-synthetic', startFrame: 0, durationFrames: 900 }],
    ...overrides
  } as EditorV6Document['timeline']['tracks'][number]
}

describe('planejamento da exportação do Editor V6', () => {
  it('força o loop de boca e conserva a divisão Turbo quando não há fala vinculada', () => {
    const result = createEditorV6ExportExecutionPlan(createProject(900), createOptions(), {}, 'win32')

    expect(result.options.mouthLoop).toBe(true)
    expect(result.testSettings.motionConcurrency).toBe(2)
    expect(result.speechInRange).toBe(false)
    expect(result.requestedParts).toEqual([
      { index: 0, startFrame: 0, endFrame: 300 },
      { index: 1, startFrame: 300, endFrame: 600 }
    ])
    expect(result.parts).toEqual(result.requestedParts)
  })

  it('respeita o ciclo da boca no perfil AMF e divide o trecho falado', () => {
    const result = createEditorV6ExportExecutionPlan(
      createProject(1000, [speechTrack()]),
      createOptions({ encoder: 'amf', mouthLoop: true, turbo: false }),
      {},
      'win32'
    )

    expect(result.options.mouthLoop).toBe(true)
    expect(result.speechInRange).toBe(true)
    expect(result.parts).toEqual([
      { index: 0, startFrame: 0, endFrame: 600 }
    ])
  })

  it('divide apenas o intervalo com fala vinculada e mantém a cobertura dos quadros', () => {
    const result = createEditorV6ExportExecutionPlan(
      createProject(1000, [speechTrack()]),
      createOptions({ startFrame: 100, endFrame: 800, turbo: false }),
      {},
      'win32'
    )

    expect(result.speechInRange).toBe(true)
    expect(result.requestedParts).toEqual([{ index: 0, startFrame: 100, endFrame: 800 }])
    expect(result.parts).toEqual([
      { index: 0, startFrame: 100, endFrame: 700 },
      { index: 1, startFrame: 700, endFrame: 800 }
    ])
  })

  it.each([
    ['faixa oculta', speechTrack({ hidden: true })],
    ['faixa silenciada', speechTrack({ muted: true })],
    ['bloco sem personagem', { kind: 'speech', blocks: [{ startFrame: 0, durationFrames: 900 }] }],
    ['fora do intervalo', { kind: 'speech', blocks: [{ characterId: 'character-synthetic', startFrame: 700, durationFrames: 100 }] }]
  ])('não divide por fala em %s', (_name, track) => {
    const result = createEditorV6ExportExecutionPlan(
      createProject(1000, [track as EditorV6Document['timeline']['tracks'][number]]),
      createOptions({ endFrame: 600, turbo: false }),
      {},
      'win32'
    )

    expect(result.speechInRange).toBe(false)
    expect(result.parts).toEqual(result.requestedParts)
  })

  it('recusa comparar quatro workers quando só existem dois trechos disponíveis', () => {
    const environment = { GACHA_VIDEO_STRESS_OFFSCREEN: '1', GACHA_EDITOR_V6_STRESS_EXPORT_WORKERS: '4' }

    expect(() => createEditorV6ExportExecutionPlan(createProject(600, [speechTrack()]), createOptions(), environment, 'win32'))
      .toThrow('o plano contém apenas 2 trechos')
  })

  it('planeja quatro trechos quando o harness solicita quatro workers', () => {
    const environment = {
      GACHA_VIDEO_STRESS_OFFSCREEN: '1', GACHA_EDITOR_V6_STRESS_EXPORT_WORKERS: '4',
      GACHA_EDITOR_V6_STRESS_MOUTH_BATCH_FRAMES: '300'
    }
    const result = createEditorV6ExportExecutionPlan(
      createProject(1200, [speechTrack({ blocks: [{ characterId: 'character-synthetic', startFrame: 0, durationFrames: 1200 }] })]),
      createOptions({ endFrame: 1200 }), environment, 'win32'
    )

    expect(result.stressWorkerOverride).toBe('4')
    expect(result.parts).toHaveLength(4)
    expect(result.parts.every((part) => part.endFrame - part.startFrame === 300)).toBe(true)
  })

  it('planeja seis trechos de 200 quadros para medir seis workers no harness', () => {
    const project = createProject(1200, [speechTrack({ blocks: [{ characterId: 'character-synthetic', startFrame: 0, durationFrames: 1200 }] })])
    const result = createEditorV6ExportExecutionPlan(project, createOptions({ endFrame: 1200 }), {
      GACHA_VIDEO_STRESS_OFFSCREEN: '1', GACHA_EDITOR_V6_STRESS_EXPORT_WORKERS: '6',
      GACHA_EDITOR_V6_STRESS_MOUTH_BATCH_FRAMES: '200'
    }, 'win32')

    expect(result.parts).toHaveLength(6)
    expect(result.parts.every((part) => part.endFrame - part.startFrame === 200)).toBe(true)
  })

  it('permite testar 600 quadros por trecho somente no harness isolado', () => {
    const project = createProject(1200, [speechTrack({ blocks: [{ characterId: 'character-synthetic', startFrame: 0, durationFrames: 1200 }] })])
    const options = createOptions({ endFrame: 1200 })
    const isolated = createEditorV6ExportExecutionPlan(project, options, {
      GACHA_VIDEO_STRESS_OFFSCREEN: '1', GACHA_EDITOR_V6_STRESS_MOUTH_BATCH_FRAMES: '600'
    }, 'win32')
    const production = createEditorV6ExportExecutionPlan(project, options, {}, 'win32')

    expect(isolated.mouthLoopBatchFrames).toBe(600)
    expect(isolated.parts).toHaveLength(2)
    expect(isolated.parts.every((part) => part.endFrame - part.startFrame === 600)).toBe(true)
    expect(production.mouthLoopBatchFrames).toBe(600)
    expect(production.parts).toHaveLength(2)
    expect(() => createEditorV6ExportExecutionPlan(project, options, {
      GACHA_VIDEO_STRESS_OFFSCREEN: '1', GACHA_EDITOR_V6_STRESS_MOUTH_BATCH_FRAMES: '900'
    }, 'win32')).toThrow('O benchmark isolado aceita trechos de boca de 200, 300, 600 ou 1200 quadros.')
  })

  it('permite testar 1200 quadros por trecho somente no harness isolado', () => {
    const project = createProject(2400, [speechTrack({ blocks: [{ characterId: 'character-synthetic', startFrame: 0, durationFrames: 2400 }] })])
    const options = createOptions({ endFrame: 2400 })
    const isolated = createEditorV6ExportExecutionPlan(project, options, {
      GACHA_VIDEO_STRESS_OFFSCREEN: '1', GACHA_EDITOR_V6_STRESS_MOUTH_BATCH_FRAMES: '1200'
    }, 'win32')
    const production = createEditorV6ExportExecutionPlan(project, options, {}, 'win32')

    expect(isolated.mouthLoopBatchFrames).toBe(1200)
    expect(isolated.parts).toHaveLength(2)
    expect(isolated.parts.every((part) => part.endFrame - part.startFrame === 1200)).toBe(true)
    expect(production.mouthLoopBatchFrames).toBe(600)
    expect(production.parts).toHaveLength(4)
  })

  it('ignora a variável de workers se o harness isolado não estiver habilitado', () => {
    const result = createEditorV6ExportExecutionPlan(
      createProject(600, [speechTrack()]),
      createOptions(),
      { GACHA_EDITOR_V6_STRESS_EXPORT_WORKERS: '4' },
      'win32'
    )

    expect(result.stressWorkerOverride).toBeUndefined()
    expect(result.parts).toHaveLength(2)
    expect(result.parts.every((part) => part.endFrame - part.startFrame === 300)).toBe(true)
  })

  it('rejeita overrides fora do intervalo validado e plataformas sem o exportador BGRA', () => {
    const project = createProject(600)
    expect(() => createEditorV6ExportExecutionPlan(project, createOptions(), {
      GACHA_VIDEO_STRESS_OFFSCREEN: '1', GACHA_EDITOR_V6_STRESS_EXPORT_WORKERS: '1'
    }, 'win32')).toThrow('O benchmark isolado do Editor V6 aceita de 2 a 6 renderizadores Turbo.')
    expect(() => createEditorV6ExportExecutionPlan(project, createOptions(), {}, 'linux')).toThrow('Este exportador BGRA está preparado para Windows.')
  })
})

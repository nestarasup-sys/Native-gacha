import { describe, expect, it } from 'vitest'
import type { EditorV6ExportStatus } from '../../src/shared/editorV6Export'
import { measureEditorV6ExportActivity, recordEditorV6ExportActivitySample } from '../../src/renderer/src/features/editorV6/editorV6ExportActivityMetrics'

function status(patch: Partial<EditorV6ExportStatus> = {}): EditorV6ExportStatus {
  return { id: 'job-a', state: 'rendering', frames: 0, totalFrames: 300, message: 'Renderizando…', fallback: false, ...patch }
}

describe('atividade da exportação do Editor V6', () => {
  it('mede FPS e estima o tempo restante usando apenas quadros observados', () => {
    let samples = recordEditorV6ExportActivitySample([], status({ state: 'preparing' }), 0)
    samples = recordEditorV6ExportActivitySample(samples, status({ state: 'rendering' }), 1000)
    samples = recordEditorV6ExportActivitySample(samples, status({ frames: 30 }), 2000)
    samples = recordEditorV6ExportActivitySample(samples, status({ frames: 60 }), 3000)

    const metrics = measureEditorV6ExportActivity(samples, status({ frames: 60 }), 3000, 0)
    expect(metrics.progress).toBe(20)
    expect(metrics.elapsedMs).toBe(3000)
    expect(metrics.framesPerSecond).toBe(30)
    expect(metrics.estimatedRemainingMs).toBe(8000)
    expect(metrics.speedSamples).toHaveLength(2)
  })

  it('não mistura trabalhos e ignora amostras sem avanço ou mudanças repetidas de estado', () => {
    const first = recordEditorV6ExportActivitySample([], status(), 100)
    const duplicate = recordEditorV6ExportActivitySample(first, status(), 600)
    expect(duplicate).toEqual(first)

    const nextJob = recordEditorV6ExportActivitySample(duplicate, status({ id: 'job-b', frames: 7 }), 700)
    expect(nextJob).toEqual([{ jobId: 'job-b', at: 700, frames: 7, state: 'rendering' }])
  })

  it('recupera a medição após reinício de quadros e não gera taxa negativa', () => {
    let samples = recordEditorV6ExportActivitySample([], status(), 0)
    samples = recordEditorV6ExportActivitySample(samples, status({ frames: 15 }), 500)
    samples = recordEditorV6ExportActivitySample(samples, status({ frames: 0, fallback: true }), 1000)
    samples = recordEditorV6ExportActivitySample(samples, status({ frames: 15, fallback: true }), 1500)

    const metrics = measureEditorV6ExportActivity(samples, status({ frames: 15, fallback: true }), 1500)
    expect(metrics.speedSamples.every((sample) => sample.framesPerSecond > 0)).toBe(true)
    expect(metrics.framesPerSecond).toBe(30)
  })

  it('mantém velocidade e ETA sem estimativa até haver amostras suficientes', () => {
    const samples = recordEditorV6ExportActivitySample([], status({ frames: 10 }), 100)
    const metrics = measureEditorV6ExportActivity(samples, status({ frames: 10 }), 600)
    expect(metrics.framesPerSecond).toBeNull()
    expect(metrics.estimatedRemainingMs).toBeNull()
    expect(metrics.progress).toBeCloseTo(10 / 3)
  })

  it('marca um trabalho concluído como 100%, mesmo se o último status não trouxer o total', () => {
    const metrics = measureEditorV6ExportActivity([], status({ state: 'completed', frames: 300 }), 10)
    expect(metrics.progress).toBe(100)
    expect(metrics.estimatedRemainingMs).toBeNull()
  })
})

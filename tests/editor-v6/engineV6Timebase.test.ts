import { describe, expect, it } from 'vitest'
import { editorV6OutputFrame } from '../../src/shared/editorV6Export'
import { engineV6OutputBoundary, engineV6OutputFrameCount, engineV6OutputSampleAt } from '../../src/engine-v6/engineTimebase'

describe('Engine V6 — amostragem racional determinística 24/30 fps', () => {
  it('preserva 30fps frame por frame, sem arredondamento ou drift', () => {
    const range = { startFrame: 13, endFrame: 60013, fps: 30 as const }
    expect(engineV6OutputFrameCount(range)).toBe(60000)
    for (const i of [0, 1, 29, 30, 100, 59999]) {
      const sample = engineV6OutputSampleAt(range, i)
      expect(sample.timelineFrame).toBe(range.startFrame + i)
      expect(sample.authoredTime.numerator / sample.authoredTime.denominator).toBe(range.startFrame + i)
      expect(sample.presentationTime.numerator / sample.presentationTime.denominator).toBe(i / 30)
    }
  })

  it('soma 4.800 frames para 200s a 24fps e não amostra fora da janela', () => {
    const range = { startFrame: 0, endFrame: 6000, fps: 24 as const }
    expect(engineV6OutputFrameCount(range)).toBe(4800)
    expect(engineV6OutputSampleAt(range, 0).timelineFrame).toBe(0)
    expect(engineV6OutputSampleAt(range, 4).timelineFrame).toBe(5)
    expect(engineV6OutputSampleAt(range, 4799).timelineFrame).toBe(5998)
    expect(engineV6OutputSampleAt(range, 4799).presentationTime).toEqual({ numerator: 4799, denominator: 24 })
  })

  it('usa exatamente as bordas semifechadas já definidas pelo export antigo', () => {
    for (const fps of [24, 30] as const) {
      const range = { startFrame: 17, endFrame: 241, fps }
      for (let frame = range.startFrame; frame <= range.endFrame; frame++) {
        expect(engineV6OutputBoundary(range, frame)).toBe(editorV6OutputFrame(frame, range.startFrame, fps))
      }
      expect(engineV6OutputBoundary(range, range.endFrame)).toBe(engineV6OutputFrameCount(range))
    }
  })

  it('partições da timeline preservam cada output frame e o resultado independe da ordem', () => {
    for (const fps of [24, 30] as const) {
      const range = { startFrame: 3, endFrame: 247, fps }
      const partitions = [3, 4, 15, 24, 88, 89, 162, 247]
      const rendered: number[] = []
      for (let p = 1; p < partitions.length; p++) {
        const from = engineV6OutputBoundary(range, partitions[p - 1])
        const to = engineV6OutputBoundary(range, partitions[p])
        for (let frame = from; frame < to; frame++) {
          const sample = engineV6OutputSampleAt(range, frame)
          expect(sample.timelineFrame).toBeGreaterThanOrEqual(partitions[p - 1])
          expect(sample.timelineFrame).toBeLessThan(partitions[p])
          rendered.push(frame)
        }
      }
      const sequential = Array.from({ length: engineV6OutputFrameCount(range) }, (_, i) => i)
      expect(rendered).toEqual(sequential)
      const shuffled = [...rendered].reverse().map(i => engineV6OutputSampleAt(range, i))
      expect(shuffled.reverse()).toEqual(sequential.map(i => engineV6OutputSampleAt(range, i)))
    }
  })

  it('rejeita FPS, limites, timestamps e tamanhos inválidos', () => {
    const ok = { startFrame: 0, endFrame: 120, fps: 24 as const }
    expect(() => engineV6OutputFrameCount({ ...ok, fps: 25 as 24 })).toThrow(/inválido/)
    expect(() => engineV6OutputFrameCount({ ...ok, endFrame: 0 })).toThrow(/inválido/)
    expect(() => engineV6OutputFrameCount({ ...ok, startFrame: -1 })).toThrow(/inválido/)
    expect(() => engineV6OutputFrameCount({ ...ok, endFrame: 1_000_001 })).toThrow(/inválido/)
    expect(() => engineV6OutputBoundary(ok, 121)).toThrow(/fora da timeline/)
    expect(() => engineV6OutputSampleAt(ok, -1)).toThrow(/fora dos limites/)
    expect(() => engineV6OutputSampleAt(ok, engineV6OutputFrameCount(ok))).toThrow(/fora dos limites/)
    expect(() => engineV6OutputSampleAt(ok, Number.NaN)).toThrow(/fora dos limites/)
  })
})

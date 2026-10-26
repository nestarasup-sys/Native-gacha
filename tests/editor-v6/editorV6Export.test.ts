import { describe, expect, it } from 'vitest'
import { planEditorV6Audio, planEditorV6Export } from '../../src/shared/editorV6Export'
import { editorV6ExportAudioSchema } from '../../src/shared/editorV6Schema'
const options = { startFrame: 5, endFrame: 86, width: 1920, height: 1080, turbo: true, encoder: 'cpu' as const }
describe('planejamento de exportação do Editor V6', () => {
  it('divide intervalos ímpares sem repetir nem omitir quadros', () => {
    expect(planEditorV6Export(options, 100)).toEqual([{ index: 0, startFrame: 5, endFrame: 45 }, { index: 1, startFrame: 45, endFrame: 86 }])
    for (const count of [1, 2, 3, 29, 30, 31, 18000]) {
      const parts = planEditorV6Export({ ...options, startFrame: 0, endFrame: count }, count)
      expect(parts[0].startFrame).toBe(0)
      expect(parts.at(-1)!.endFrame).toBe(count)
      expect(parts.reduce((sum, part) => sum + part.endFrame - part.startFrame, 0)).toBe(count)
      if (parts.length === 2) expect(parts[0].endFrame).toBe(parts[1].startFrame)
    }
  })
  it('rejeita intervalo e resolução inválidos', () => {
    for (const update of [{ endFrame: 101 }, { startFrame: -1 }, { startFrame: 86 }, { width: 1919 }, { height: 1000 }]) expect(() => planEditorV6Export({ ...options, ...update }, 100)).toThrow()
  })
  it('recorta e desloca o áudio sobre o intervalo inteiro da exportação', () => {
    const clip = { id: crypto.randomUUID(), fileName: `${crypto.randomUUID()}.wav`, name: 'Música', sourceFrames: 900, sourceInFrame: 30, startFrame: 90, durationFrames: 300, gain: 1, muted: false }
    expect(planEditorV6Audio([clip], 120, 240)[0]).toMatchObject({ sourceInFrame: 60, durationFrames: 120, delayFrames: 0 })
    expect(planEditorV6Audio([clip], 30, 240)[0]).toMatchObject({ sourceInFrame: 30, durationFrames: 150, delayFrames: 60 })
    expect(planEditorV6Audio([{ ...clip, muted: true }], 0, 900)).toEqual([])
    expect(planEditorV6Audio([{ ...clip, gain: 0 }], 0, 900)).toEqual([])
    expect(editorV6ExportAudioSchema.safeParse({ ...clip, sourceInFrame: 800 }).success).toBe(false)
    expect(editorV6ExportAudioSchema.safeParse({ ...clip, fileName: '../música.wav' }).success).toBe(false)
  })
})

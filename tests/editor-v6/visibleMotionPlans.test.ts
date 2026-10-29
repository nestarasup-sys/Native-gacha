import { describe, expect, it } from 'vitest'
import { editorV6MotionPlan } from '../../src/shared/editorV6Motion'
import type { EditorV6Element, EditorV6TimelineBlock, EditorV6TimelineTrack } from '../../src/shared/editorV6'
import { editorV6VisibleMotionPlans, selectEditorV6MotionPairsInRange } from '../../src/renderer/src/features/editorV6/editorV6VisibleMotionPlans'

function fixture(count: number): { track: EditorV6TimelineTrack; blocks: EditorV6TimelineBlock[] } {
  const blocks = Array.from({ length: count }, (_, index) => {
    const state: EditorV6Element = {
      id: 'alice', kind: 'character', characterId: 'alice', text: 'Alice', x: index, y: 0,
      width: 20, height: 40, rotation: 0, zIndex: 1, poseSlot: index % 2
    }
    return { id: `block-${String(index).padStart(5, '0')}`, elementId: 'alice', label: 'Alice', startFrame: index * 30, durationFrames: 30, state }
  })
  const track: EditorV6TimelineTrack = { id: 'alice-track', kind: 'character', characterId: 'alice', name: 'Alice', muted: false, locked: false, blocks }
  return { track, blocks }
}

describe('planos de movimento visíveis na timeline do Editor V6', () => {
  it('mantém as mesmas transições do cálculo completo dentro da faixa visível', () => {
    const { track, blocks } = fixture(1200)
    const range = [12000, 12300] as const
    const expected = blocks.slice(1)
      .map((next, index) => editorV6MotionPlan(track, blocks[index], next))
      .filter((plan) => plan && plan.startFrame <= range[1] && plan.endFrame >= range[0])

    expect(editorV6VisibleMotionPlans(track, blocks, range)).toEqual(expected)
  })

  it('preserva a transição entre blocos com o mesmo quadro inicial', () => {
    const { track, blocks } = fixture(8)
    blocks[2] = { ...blocks[2], startFrame: blocks[1].startFrame }
    const ranges = [[30, 90], [31, 90], [90, 90], [91, 150]] as const

    for (const range of ranges) {
      const expected = blocks.slice(1)
        .map((next, index) => editorV6MotionPlan(track, blocks[index], next))
        .filter((plan) => plan && plan.startFrame <= range[1] && plan.endFrame >= range[0])
      expect(editorV6VisibleMotionPlans(track, blocks, range)).toEqual(expected)
    }
  })

  it('limita a geração de planos aos blocos visíveis e à janela máxima de 250 ms', () => {
    const { blocks } = fixture(5000)
    const pairs = selectEditorV6MotionPairsInRange(blocks, [60000, 60450])

    expect(pairs.length).toBeLessThanOrEqual(17)
    expect(pairs.every(([previous, next]) => previous.startFrame <= 60450 && next.startFrame >= 60000 && next.startFrame <= 60457.5)).toBe(true)
  })

  it('inclui a transição na borda inicial e exclui uma transição já encerrada', () => {
    const { track, blocks } = fixture(5)

    expect(editorV6VisibleMotionPlans(track, blocks, [82, 90]).map((plan) => plan.blockId)).toEqual(['block-00003'])
    expect(editorV6VisibleMotionPlans(track, blocks, [91, 100])).toEqual([])
  })

  it('não calcula planos em faixas sem transições de personagem', () => {
    const { track, blocks } = fixture(5)
    const objectTrack = { ...track, kind: 'object' as const }

    expect(editorV6VisibleMotionPlans(objectTrack, blocks, [0, 300])).toEqual([])
  })
})

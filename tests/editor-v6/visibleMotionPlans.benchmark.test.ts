import { performance } from 'node:perf_hooks'
import { describe, expect, it } from 'vitest'
import { editorV6MotionPlan } from '../../src/shared/editorV6Motion'
import type { EditorV6TimelineBlock, EditorV6TimelineTrack } from '../../src/shared/editorV6'
import { editorV6VisibleMotionPlans, selectEditorV6MotionPairsInRange } from '../../src/renderer/src/features/editorV6/editorV6VisibleMotionPlans'

const blockCount = 30_000
const rounds = 7
const range = [435_000, 436_000] as const
const blocks: EditorV6TimelineBlock[] = Array.from({ length: blockCount }, (_, index) => ({
  id: `block-${String(index).padStart(5, '0')}`,
  elementId: 'alice',
  label: 'Alice',
  startFrame: index * 30,
  durationFrames: 30,
  state: { id: 'alice', kind: 'character', characterId: 'alice', text: 'Alice', x: index, y: 0, width: 20, height: 40, rotation: 0, zIndex: 1, poseSlot: index % 2 }
}))
const track: EditorV6TimelineTrack = { id: 'alice-track', kind: 'character', characterId: 'alice', name: 'Alice', muted: false, locked: false, blocks }

function fullTimelineScan() {
  const plans = []
  for (let index = 1; index < blocks.length; index++) {
    const plan = editorV6MotionPlan(track, blocks[index - 1], blocks[index])
    if (plan && plan.startFrame <= range[1] && plan.endFrame >= range[0]) plans.push(plan)
  }
  return plans
}

function signature(plans: ReturnType<typeof fullTimelineScan>) {
  return plans.map(({ blockId, startFrame, endFrame, key }) => [blockId, startFrame, endFrame, key])
}

describe('benchmark: planos de movimento visíveis no Editor V6', () => {
  it('compara o viewport com a varredura completa sem alterar o resultado', () => {
    const expected = fullTimelineScan()
    const actual = editorV6VisibleMotionPlans(track, blocks, range)
    expect(signature(actual)).toEqual(signature(expected))

    const fullSamples: number[] = [], visibleSamples: number[] = []
    for (let round = 0; round < rounds; round++) {
      let started = performance.now()
      const full = fullTimelineScan()
      fullSamples.push(performance.now() - started)
      started = performance.now()
      const visible = editorV6VisibleMotionPlans(track, blocks, range)
      visibleSamples.push(performance.now() - started)
      expect(signature(visible)).toEqual(signature(full))
    }

    const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]
    const fullMedianMs = median(fullSamples), visibleMedianMs = median(visibleSamples)
    console.log(JSON.stringify({
      scenario: { characterBlocks: blockCount, viewportFrames: range, rounds, visiblePairsChecked: selectEditorV6MotionPairsInRange(blocks, range).length },
      fullTimelineScan: { medianMs: Number(fullMedianMs.toFixed(3)), adjacentPairsChecked: blockCount - 1 },
      visibleRange: { medianMs: Number(visibleMedianMs.toFixed(3)), plans: actual.length },
      speedup: Number((fullMedianMs / visibleMedianMs).toFixed(2)),
      identicalVisiblePlans: actual.length
    }, null, 2))
  }, 30_000)
})

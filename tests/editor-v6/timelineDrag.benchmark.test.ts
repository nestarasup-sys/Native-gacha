import { describe, expect, it } from 'vitest'
import type { EditorV6Timeline } from '../../src/shared/editorV6'
import { snapEditorV6Frame } from '../../src/shared/editorV6TimelineEdits'

describe('benchmark de snap da timeline em arraste denso', () => {
  it('compara a varredura integral com o índice pré-calculado em 20 mil blocos', () => {
    const blockCount = 20_000
    const blocks = Array.from({ length: blockCount }, (_, index) => ({ id: `block-${index}`, label: 'Fixture', startFrame: index * 30, durationFrames: 20 }))
    const timeline = { durationFrames: blockCount * 30, tracks: [{ id: 'dense', kind: 'object', name: 'Densa', muted: false, locked: false, blocks }] } as unknown as EditorV6Timeline
    const excluded = 'block-10000'
    const points = blocks.flatMap((block, order) => block.id === excluded ? [] : [
      { frame: block.startFrame, order: order * 2 }, { frame: block.startFrame + block.durationFrames, order: order * 2 + 1 }
    ]).sort((a, b) => a.frame - b.frame || a.order - b.order)
    const moves = Array.from({ length: 80 }, (_, index) => ({ frame: (index * 7919) % (timeline.durationFrames - 40), cursor: (index * 11003) % timeline.durationFrames }))
    let fullScanMilliseconds = 0, indexedMilliseconds = 0
    for (let round = 0; round < 3; round++) {
      const fullStarted = performance.now()
      const full = moves.map(({ frame, cursor }) => snapEditorV6Frame(timeline, frame, cursor, excluded, 3, 10))
      fullScanMilliseconds += performance.now() - fullStarted
      const indexedStarted = performance.now()
      const indexed = moves.map(({ frame, cursor }) => snapEditorV6Frame(timeline, frame, cursor, excluded, 3, 10, points))
      indexedMilliseconds += performance.now() - indexedStarted
      expect(indexed).toEqual(full)
    }
    const result = { blocks: blockCount, pointerMoves: moves.length * 3, fullScanTotalMs: Number(fullScanMilliseconds.toFixed(2)), indexedTotalMs: Number(indexedMilliseconds.toFixed(2)), fullScanPerMoveMs: Number((fullScanMilliseconds / (moves.length * 3)).toFixed(4)), indexedPerMoveMs: Number((indexedMilliseconds / (moves.length * 3)).toFixed(4)), speedup: Number((fullScanMilliseconds / indexedMilliseconds).toFixed(1)) }
    console.log('[Editor V6 · timeline snap benchmark]', JSON.stringify(result))
  })
})

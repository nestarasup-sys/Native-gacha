import { describe, expect, it } from 'vitest'
import { createExportHairTransitionFrameIndex } from '../../src/renderer/src/features/editorV6/exportHairTransitionIndex'

type Fixture = {
  elementId: string
  startFrame: number
  endFrame: number
  from?: { id: string }
  to?: { id: string }
  samples: Array<{ offset: number; progress: number }>
  atlas?: { frames: Array<{ offset: number; name: string }> }
}
const make = (id: string, start: number, end: number, offsets: number[]): Fixture => ({
  elementId: id, startFrame: start, endFrame: end, from: { id: 'from' }, to: { id: 'to' },
  samples: offsets.map((offset, index) => ({ offset, progress: index / Math.max(1, offsets.length - 1) })),
  atlas: { frames: offsets.map((offset, index) => ({ offset, name: id + '-' + index })) }
})
const legacy = (transitions: Fixture[], elementId: string, frame: number) => {
  const transition = transitions.find(item => item.elementId === elementId
    && item.atlas && item.from && item.to && frame > item.startFrame && frame < item.endFrame
    && item.atlas.frames.some(sample => item.endFrame + sample.offset === frame))
  return transition
    ? { transition, poseSample: transition.samples.find(sample => transition.endFrame + sample.offset === frame),
      atlasFrame: transition.atlas!.frames.find(sample => transition.endFrame + sample.offset === frame) }
    : undefined
}

describe('export-only hair transition frame index', () => {
  it('matches the former first-match lookup at boundaries, gaps, overlaps and duplicate samples', () => {
    const transitions: Fixture[] = [
      make('alice', 10, 20, [-12, -9, -8, -8, -3, 0]),
      make('alice', 11, 24, [-13, -12, -11, -8]),
      make('bob', 10, 20, [-9, -8]),
      { ...make('alice', 12, 23, [-10]), from: undefined },
      { ...make('alice', 12, 23, [-10]), atlas: undefined },
      { ...make('alice', 12, 23, [-10]), to: undefined }
    ]
    const indexed = createExportHairTransitionFrameIndex(transitions)
    for (const id of ['alice', 'bob', 'not-present']) for (let frame = 0; frame <= 30; frame++) {
      const expected = legacy(transitions, id, frame)
      const actual = indexed.get(id, frame)
      expect(actual?.transition).toBe(expected?.transition)
      expect(actual?.poseSample).toBe(expected?.poseSample)
      expect(actual?.atlasFrame).toBe(expected?.atlasFrame)
    }
  })

  it('retains atlas matches without an interpolating pose sample (fallback parity)', () => {
    const transition = make('actor', 0, 30, [-3, -2])
    transition.samples = [{ offset: -2, progress: 0.5 }]
    const lookup = createExportHairTransitionFrameIndex([transition])
    expect(lookup.get('actor', 27)?.transition).toBe(transition)
    expect(lookup.get('actor', 27)?.poseSample).toBeUndefined()
    expect(lookup.get('actor', 27)?.atlasFrame.name).toBe('actor-0')
    expect(lookup.get('actor', 30)).toBeUndefined()
  })

  it('matches linear lookup across a longer synthetic timeline with independent actors', () => {
    const transitions = Array.from({ length: 350 }, (_, index) => make(index % 2 ? 'alice' : 'bob', index * 14, index * 14 + 12, [-9, -7, -4, -1]))
    const indexed = createExportHairTransitionFrameIndex(transitions)
    for (const id of ['alice', 'bob']) for (let frame = 0; frame < 5_000; frame++) {
      const expected = legacy(transitions, id, frame)
      const actual = indexed.get(id, frame)
      expect(actual?.transition).toBe(expected?.transition)
      expect(actual?.atlasFrame).toBe(expected?.atlasFrame)
      expect(actual?.poseSample).toBe(expected?.poseSample)
    }
  })
})

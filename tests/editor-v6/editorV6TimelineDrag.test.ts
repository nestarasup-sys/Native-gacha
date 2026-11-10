import { describe, expect, it } from 'vitest'
import type { EditorV6MediaAsset, EditorV6Timeline, EditorV6TimelineBlock, EditorV6TimelineTrack } from '../../src/shared/editorV6'
import { createEditorV6TimelineDragSnapshot, previewEditorV6TimelineDrag } from '../../src/renderer/src/features/editorV6/editorV6TimelineDrag'

const makeBlock = (id: string, startFrame: number, durationFrames: number, extra: Partial<EditorV6TimelineBlock> = {}): EditorV6TimelineBlock => ({ id, label: id, startFrame, durationFrames, ...extra })
const makeTrack = (id: string, kind: EditorV6TimelineTrack['kind'], blocks: EditorV6TimelineBlock[], characterId?: string): EditorV6TimelineTrack => ({ id, kind, ...(characterId ? { characterId } : {}), name: id, muted: false, locked: false, blocks })
const makeTimeline = (tracks: EditorV6TimelineTrack[]): EditorV6Timeline => ({ fps: 30, durationFrames: 300, tracks })
const preview = (input: {
  timeline: EditorV6Timeline
  track: EditorV6TimelineTrack
  block: EditorV6TimelineBlock
  mode: 'move' | 'resize'
  deltaFrames: number
  snap?: boolean
  playheadFrame?: number
  media?: readonly EditorV6MediaAsset[]
}) => previewEditorV6TimelineDrag({
  snapshot: createEditorV6TimelineDragSnapshot({ initial: input.timeline, track: input.track, block: input.block, mode: input.mode }),
  deltaFrames: input.deltaFrames,
  playheadFrame: input.playheadFrame ?? 270,
  pixelsPerSecond: 72,
  snap: input.snap ?? false,
  altKey: false,
  media: input.media
})

describe('arraste da timeline do Editor V6', () => {
  it('move um clipe visual mantendo o snap alinhado ao início de outro clipe', () => {
    const moving = makeBlock('moving', 30, 30)
    const target = makeBlock('target', 70, 20)
    const track = makeTrack('video', 'video', [moving, target])
    const timeline = makeTimeline([track])

    const result = preview({ timeline, track, block: moving, mode: 'move', deltaFrames: 8, snap: true })

    expect(result.block).toMatchObject({ startFrame: 40, durationFrames: 30 })
    expect(result.guide).toBe(70)
    expect(moving.startFrame).toBe(30)
  })

  it('limita o redimensionamento do vídeo ao restante da mídia de origem', () => {
    const clip = makeBlock('video-block', 0, 20, { mediaId: 'source', mediaInFrame: 10 })
    const track = makeTrack('video', 'video', [clip])
    const timeline = makeTimeline([track])
    const media: EditorV6MediaAsset[] = [{ id: 'source', name: 'Fonte', fileName: 'source.mp4', kind: 'video', mimeType: 'video/mp4', sourceFrames: 50, hasAudio: false, sizeBytes: 100 }]

    const result = preview({ timeline, track, block: clip, mode: 'resize', deltaFrames: 100, media })

    expect(result.block).toMatchObject({ startFrame: 0, durationFrames: 40 })
  })

  it('redimensiona um estado persistente e desloca o próximo sem ultrapassar o seguinte', () => {
    const first = makeBlock('first', 0, 100, { elementId: 'actor' })
    const second = makeBlock('second', 100, 100, { elementId: 'actor' })
    const third = makeBlock('third', 200, 100, { elementId: 'actor' })
    const track = makeTrack('actor-track', 'character', [first, second, third], 'actor')
    const timeline = makeTimeline([track])

    const result = preview({ timeline, track, block: first, mode: 'resize', deltaFrames: 20 })
    const blocks = result.timeline.tracks[0].blocks

    expect(blocks.map(({ id, startFrame, durationFrames }) => ({ id, startFrame, durationFrames }))).toEqual([
      { id: 'first', startFrame: 0, durationFrames: 120 },
      { id: 'second', startFrame: 120, durationFrames: 80 },
      { id: 'third', startFrame: 200, durationFrames: 100 }
    ])
  })

  it('mantém clipe filho dentro do vídeo pai e atualiza seu tempo relativo', () => {
    const parent = makeBlock('parent', 60, 90)
    const videoTrack = makeTrack('video', 'video', [parent])
    const child = makeBlock('child', 70, 20, { parentBlockId: 'parent', relativeStartFrame: 10 })
    const audioTrack = makeTrack('audio', 'audio', [child])
    const timeline = makeTimeline([videoTrack, audioTrack])

    const result = preview({ timeline, track: audioTrack, block: child, mode: 'move', deltaFrames: 999 })

    expect(result.block).toMatchObject({ startFrame: 149, durationFrames: 1, relativeStartFrame: 89 })
    expect(timeline.tracks[1].blocks[0]).toMatchObject({ startFrame: 70, durationFrames: 20 })
  })
})

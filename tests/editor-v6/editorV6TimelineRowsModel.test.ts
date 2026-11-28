import { describe, expect, it } from 'vitest'
import type { EditorV6MotionPlan } from '../../src/shared/editorV6Motion'
import type { EditorV6Timeline, EditorV6TimelineBlock, EditorV6TimelineTrack } from '../../src/shared/editorV6'
import {
  canMoveEditorV6TimelineTrack,
  createEditorV6TimelineDisplayRows,
  createEditorV6TimelineSortedBlocks,
  getEditorV6TimelineBlockPixels,
  getEditorV6TimelineBlockSeekFrame,
  getEditorV6TimelineMotionPixels,
  getEditorV6TimelineVisibleBlocks,
  resolveEditorV6TimelineBlockHit
} from '../../src/renderer/src/features/editorV6/editorV6TimelineRowsModel'

function track(id: string, kind: EditorV6TimelineTrack['kind'], blocks: EditorV6TimelineBlock[] = [], locked = false): EditorV6TimelineTrack {
  return { id, kind, name: id, muted: false, locked, blocks, ...(kind === 'character' ? { characterId: id } : {}) }
}

function block(id: string, startFrame: number, durationFrames: number, background = false): EditorV6TimelineBlock {
  return {
    id, label: id, startFrame, durationFrames,
    ...(background ? { background: { backgroundColor: '#000000', backgroundAssetId: null, backgroundX: 0, backgroundY: 0, backgroundWidth: 100, backgroundHeight: 100, backgroundRotation: 0 } } : {})
  }
}

describe('modelo de linhas da timeline do Editor V6', () => {
  it('ordena faixas, separa estados de fundo e cria linha de fundo sem faixa de vídeo', () => {
    const video = track('video', 'video', [block('clip', 0, 60), block('background', 60, 30, true)])
    const timeline: EditorV6Timeline = { fps: 30, durationFrames: 120, tracks: [track('actor', 'character'), track('speech', 'speech'), video] }
    const rows = createEditorV6TimelineDisplayRows(timeline)

    expect(rows.map(({ key }) => key)).toEqual(['speech', 'video', 'actor', 'background:video'])
    expect(rows.find(({ key }) => key === 'video')?.blocks.map(({ id }) => id)).toEqual(['clip'])
    expect(rows.find(({ key }) => key === 'background:video')?.blocks.map(({ id }) => id)).toEqual(['background'])
    expect(rows.find(({ key }) => key === 'background:video')?.backgroundLane).toBe(true)

    const withoutVideo = createEditorV6TimelineDisplayRows({ ...timeline, tracks: [track('speech', 'speech')] })
    expect(withoutVideo.at(-1)).toMatchObject({ key: 'background:editor-v6-background-source', backgroundLane: true, blocks: [] })
  })

  it('classifica movimento de faixa e preserva o encaixe fixo ao final', () => {
    const rows = createEditorV6TimelineDisplayRows({
      fps: 30, durationFrames: 120,
      tracks: [track('speech', 'speech'), track('thought', 'thought'), track('actor', 'character'), track('object', 'object'), track('audio', 'audio')]
    })
    expect(canMoveEditorV6TimelineTrack(rows, 0, -1)).toBe(false)
    expect(canMoveEditorV6TimelineTrack(rows, 0, 1)).toBe(true)
    expect(canMoveEditorV6TimelineTrack(rows, 2, 1)).toBe(false)
    expect(canMoveEditorV6TimelineTrack(rows, 3, -1)).toBe(false)
    expect(canMoveEditorV6TimelineTrack(rows, 99, -1)).toBe(false)
  })

  it('ordena blocos, mantém interseções inclusivas e calcula pixels com largura mínima', () => {
    const rows = createEditorV6TimelineDisplayRows({
      fps: 30, durationFrames: 120,
      tracks: [track('speech', 'speech', [block('late', 50, 10), block('start-edge', 10, 5), block('end-edge', 0, 10)])]
    })
    const sorted = createEditorV6TimelineSortedBlocks(rows).get('speech')!
    expect(sorted.map(({ id }) => id)).toEqual(['end-edge', 'start-edge', 'late'])
    expect(getEditorV6TimelineVisibleBlocks(sorted, [10, 40]).map(({ id }) => id)).toEqual(['end-edge', 'start-edge'])
    expect(getEditorV6TimelineBlockPixels(block('tiny', 30, 1), 60)).toEqual({ left: 60, width: 3 })
    expect(getEditorV6TimelineBlockPixels(block('wide', 30, 30), 60)).toEqual({ left: 60, width: 60 })
  })

  it('só procura o playhead no segundo clique e limita o quadro aos limites do bloco', () => {
    const clip = block('selected', 30, 60)
    expect(getEditorV6TimelineBlockSeekFrame(clip, 1, 160, 100, 60)).toBeUndefined()
    expect(getEditorV6TimelineBlockSeekFrame(clip, 2, 160, 100, 60)).toBe(60)
    expect(getEditorV6TimelineBlockSeekFrame(clip, 2, 0, 100, 60)).toBe(30)
    expect(getEditorV6TimelineBlockSeekFrame(clip, 2, 1000, 100, 60)).toBe(90)
    expect(getEditorV6TimelineBlockSeekFrame(clip, 2, 160, 100, 0)).toBeUndefined()
  })

  it('permite selecionar em sequência todos os blocos cujas larguras mínimas se sobrepõem', () => {
    const previous = block('previous', 0, 10)
    const short = block('one-frame', 10, 1)
    const next = block('next', 11, 90)
    const blocks = [previous, short, next]
    // At 6 px/s, adjacent one-frame clips each render at the 3 px minimum.
    const first = resolveEditorV6TimelineBlockHit({ blocks, targetBlockId: 'one-frame', x: 2.5, pixelsPerSecond: 6 })
    expect(first?.block.id).toBe('one-frame')
    const second = resolveEditorV6TimelineBlockHit({ blocks, targetBlockId: 'one-frame', x: 2.5, pixelsPerSecond: 6, previous: first?.cycle })
    expect(second?.block.id).toBe('next')
    const third = resolveEditorV6TimelineBlockHit({ blocks, targetBlockId: 'one-frame', x: 2.5, pixelsPerSecond: 6, previous: second?.cycle })
    expect(third?.block.id).toBe('previous')
    expect(resolveEditorV6TimelineBlockHit({ blocks, targetBlockId: 'next', x: 20, pixelsPerSecond: 6 })?.block.id).toBe('next')
  })

  it('converte o intervalo de transição em pixels pela escala atual', () => {
    const plan = { startFrame: 45, endFrame: 60 } as EditorV6MotionPlan
    expect(getEditorV6TimelineMotionPixels(plan, 60)).toEqual({ left: 90, width: 30 })
  })
})

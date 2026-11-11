import { describe, expect, it } from 'vitest'
import type { EditorV6MotionPlan } from '../../src/shared/editorV6Motion'
import type { EditorV6Timeline, EditorV6TimelineBlock, EditorV6TimelineTrack } from '../../src/shared/editorV6'
import {
  canMoveEditorV6TimelineTrack,
  createEditorV6TimelineDisplayRows,
  createEditorV6TimelineSortedBlocks,
  getEditorV6TimelineBlockPixels,
  getEditorV6TimelineMotionPixels,
  getEditorV6TimelineVisibleBlocks
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

  it('converte o intervalo de transição em pixels pela escala atual', () => {
    const plan = { startFrame: 45, endFrame: 60 } as EditorV6MotionPlan
    expect(getEditorV6TimelineMotionPixels(plan, 60)).toEqual({ left: 90, width: 30 })
  })
})

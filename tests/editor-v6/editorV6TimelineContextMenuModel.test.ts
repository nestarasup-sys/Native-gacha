import { describe, expect, it } from 'vitest'
import type { EditorV6TimelineBlock, EditorV6TimelineTrack } from '../../src/shared/editorV6'
import { getEditorV6TimelineContextMenuActions, getEditorV6TimelineContextMenuPosition, type EditorV6TimelineContextMenuState } from '../../src/renderer/src/features/editorV6/editorV6TimelineContextMenuModel'

const block: EditorV6TimelineBlock = { id: 'block-1', label: 'Clip', startFrame: 30, durationFrames: 60 }
const track: EditorV6TimelineTrack = { id: 'track-1', kind: 'speech', name: 'Speech', muted: false, locked: false, blocks: [block] }
const menu: EditorV6TimelineContextMenuState = { x: 10, y: 20, track, block }

describe('modelo do menu contextual da timeline do Editor V6', () => {
  it('mantém o menu dentro dos mesmos limites usados pela tela', () => {
    expect(getEditorV6TimelineContextMenuPosition(500, 500, 800, 600)).toEqual({ x: 500, y: 375 })
    expect(getEditorV6TimelineContextMenuPosition(0, 0, 100, 100)).toEqual({ x: -95, y: 8 })
  })

  it('desabilita exclusão, duplicação e divisão em faixa travada', () => {
    expect(getEditorV6TimelineContextMenuActions({ ...menu, track: { ...track, locked: true } }, 60)).toEqual({
      duplicateDisabled: true, removeDisabled: true, splitDisabled: true
    })
  })

  it('permite dividir somente dentro dos limites do bloco', () => {
    expect(getEditorV6TimelineContextMenuActions(menu, 30).splitDisabled).toBe(true)
    expect(getEditorV6TimelineContextMenuActions(menu, 60).splitDisabled).toBe(false)
    expect(getEditorV6TimelineContextMenuActions(menu, 90).splitDisabled).toBe(true)
  })
})

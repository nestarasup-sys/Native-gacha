import { describe, expect, it } from 'vitest'
import type { EditorV6Timeline, EditorV6TimelineBlock, EditorV6TimelineTrack } from '../../src/shared/editorV6'
import { createEditorV6TimelineBlockCommands } from '../../src/renderer/src/features/editorV6/editorV6TimelineBlockCommands'

function createHarness(locked = false, characterBlocks?: EditorV6TimelineBlock[]) {
  const block: EditorV6TimelineBlock = { id: 'block-1', elementId: 'actor', label: 'Actor', startFrame: 30, durationFrames: 60 }
  const child: EditorV6TimelineBlock = { id: 'child-1', label: 'Dialog', startFrame: 40, durationFrames: 20, parentBlockId: 'block-1', relativeStartFrame: 10 }
  const track: EditorV6TimelineTrack = { id: 'track-1', kind: 'character', characterId: 'actor', name: 'Actor', muted: false, locked, blocks: characterBlocks ?? [block] }
  const childTrack: EditorV6TimelineTrack = { id: 'track-2', kind: 'speech', name: 'Speech', muted: false, locked: false, blocks: [child] }
  let timeline: EditorV6Timeline = { fps: 30, durationFrames: 300, tracks: [track, childTrack] }
  const closedMenus: boolean[] = []
  const commands = createEditorV6TimelineBlockCommands({
    getTimeline: () => timeline,
    getFrame: () => 60,
    changeTimeline: (update) => { timeline = update(timeline) },
    closeMenu: () => closedMenus.push(true)
  })
  return { commands, closedMenus, getTimeline: () => timeline }
}

describe('comandos de bloco da timeline do Editor V6', () => {
  it('remove o bloco e seus filhos vinculados, mas respeita faixa bloqueada', () => {
    const locked = createHarness(true)
    locked.commands.remove('block-1')
    expect(locked.closedMenus).toEqual([])
    expect(locked.getTimeline().tracks.find(({ id }) => id === 'track-1')?.blocks).toHaveLength(1)

    const editable = createHarness()
    editable.commands.remove('block-1')
    expect(editable.getTimeline().tracks.find(({ id }) => id === 'track-1')?.blocks).toEqual([
      expect.objectContaining({ label: 'Vazio', startFrame: 30, durationFrames: 60, emptyGap: true })
    ])
    expect(editable.getTimeline().tracks.find(({ id }) => id === 'track-2')?.blocks).toEqual([])
    expect(editable.closedMenus).toEqual([true])
  })

  it('move todos os blocos seguintes para preencher a duração removida', () => {
    const blocks: EditorV6TimelineBlock[] = [
      { id: 'before', elementId: 'actor', label: 'Antes', startFrame: 0, durationFrames: 30 },
      { id: 'block-1', elementId: 'actor', label: 'Remover', startFrame: 30, durationFrames: 60 },
      { id: 'after', elementId: 'actor', label: 'Depois', startFrame: 90, durationFrames: 30 },
      { id: 'later', elementId: 'actor', label: 'Mais tarde', startFrame: 150, durationFrames: 30 }
    ]
    const { commands, getTimeline } = createHarness(false, blocks)
    commands.remove('block-1')

    expect(getTimeline().tracks[0].blocks.map(({ id, startFrame }) => ({ id, startFrame }))).toEqual([
      { id: 'before', startFrame: 0 },
      { id: 'after', startFrame: 30 },
      { id: 'later', startFrame: 90 }
    ])
  })

  it('divide no frame atual e fecha o menu após alterar a timeline', () => {
    const { commands, closedMenus, getTimeline } = createHarness()

    commands.split('block-1')

    expect(getTimeline().tracks.find(({ id }) => id === 'track-1')?.blocks.map(({ startFrame, durationFrames }) => ({ startFrame, durationFrames }))).toEqual([
      { startFrame: 30, durationFrames: 30 },
      { startFrame: 60, durationFrames: 240 }
    ])
    expect(closedMenus).toEqual([true])
  })

  it('duplica o bloco ao final do original e fecha o menu', () => {
    const { commands, closedMenus, getTimeline } = createHarness()

    commands.duplicate('block-1')

    const blocks = getTimeline().tracks.find(({ id }) => id === 'track-1')!.blocks
    expect(blocks).toHaveLength(2)
    expect(blocks[1]).toMatchObject({ startFrame: 90, durationFrames: 270 })
    expect(blocks[1].id).not.toBe('block-1')
    expect(closedMenus).toEqual([true])
  })
})

import { describe, expect, it } from 'vitest'
import type { EditorV6Document, EditorV6Element, EditorV6Timeline, EditorV6TimelineBlock, EditorV6TimelineTrack } from '../../src/shared/editorV6'
import { createEditorV6TimelineBlockCommands } from '../../src/renderer/src/features/editorV6/editorV6TimelineBlockCommands'
import { recordEditorV6History, redoEditorV6History, undoEditorV6History } from '../../src/shared/editorV6History'
import { normalizeEditorV6Timeline } from '../../src/shared/editorV6TimelineCore'

const actorState: EditorV6Element = { id: 'actor', kind: 'character', characterId: 'alice', assetId: 'asset', text: 'Actor', x: 0, y: 0, width: 20, height: 30, rotation: 0, zIndex: 1 }

function createHarness(locked = false, characterBlocks?: EditorV6TimelineBlock[]) {
  const block: EditorV6TimelineBlock = { id: 'block-1', elementId: 'actor', state: actorState, label: 'Actor', startFrame: 30, durationFrames: 60 }
  const child: EditorV6TimelineBlock = { id: 'child-1', label: 'Dialog', startFrame: 40, durationFrames: 20, parentBlockId: 'block-1', relativeStartFrame: 10 }
  const track: EditorV6TimelineTrack = { id: 'track-1', kind: 'character', characterId: 'actor', name: 'Actor', muted: false, locked, blocks: characterBlocks ?? [block] }
  const childTrack: EditorV6TimelineTrack = { id: 'track-2', kind: 'speech', name: 'Speech', muted: false, locked: false, blocks: [child] }
  let timeline: EditorV6Timeline = { fps: 30, durationFrames: 300, tracks: [track, childTrack] }
  const closedMenus: boolean[] = []
  const commands = createEditorV6TimelineBlockCommands({
    getTimeline: () => timeline,
    getFrame: () => 60,
    changeTimeline: (update) => { timeline = normalizeEditorV6Timeline(update(timeline)) },
    closeMenu: () => closedMenus.push(true)
  })
  return { commands, closedMenus, getTimeline: () => timeline }
}

describe('comandos de bloco da timeline do Editor V6', () => {
  it('remove só o bloco selecionado e preserva os filhos desvinculados e seu tempo', () => {
    const locked = createHarness(true)
    locked.commands.remove('block-1')
    expect(locked.closedMenus).toEqual([])
    expect(locked.getTimeline().tracks.find(({ id }) => id === 'track-1')?.blocks).toHaveLength(1)

    const editable = createHarness()
    editable.commands.remove('block-1')
    expect(editable.getTimeline().tracks.find(({ id }) => id === 'track-1')?.blocks[0]).toMatchObject({
      label: 'Vazio', startFrame: 30, emptyGap: true, state: { ...actorState, visible: false }
    })
    expect(editable.getTimeline().tracks.find(({ id }) => id === 'track-2')?.blocks).toEqual([
      { id: 'child-1', label: 'Dialog', startFrame: 40, durationFrames: 20 }
    ])
    expect(editable.closedMenus).toEqual([true])
  })

  it('mantém os horários dos blocos seguintes e reserva vazio ao remover um estado intermediário de personagem', () => {
    const blocks: EditorV6TimelineBlock[] = [
      { id: 'before', elementId: 'actor', state: actorState, label: 'Antes', startFrame: 0, durationFrames: 30 },
      { id: 'block-1', elementId: 'actor', state: actorState, label: 'Remover', startFrame: 30, durationFrames: 60 },
      { id: 'after', elementId: 'actor', state: actorState, label: 'Depois', startFrame: 90, durationFrames: 30 },
      { id: 'later', elementId: 'actor', state: actorState, label: 'Mais tarde', startFrame: 150, durationFrames: 30 }
    ]
    const { commands, getTimeline } = createHarness(false, blocks)
    commands.remove('block-1')

    expect(getTimeline().tracks.find(track => track.id === 'track-1')!.blocks.map(({ id, startFrame }) => ({ id, startFrame }))).toEqual([
      { id: 'before', startFrame: 0 },
      { id: expect.any(String), startFrame: 30 },
      { id: 'after', startFrame: 90 },
      { id: 'later', startFrame: 150 }
    ])
    expect(getTimeline().tracks.find(track => track.id === 'track-1')!.blocks[1]).toMatchObject({ label: 'Vazio', durationFrames: 60, emptyGap: true })
  })

  it('remove um estado de um quadro e mantém os estados vizinhos editáveis', () => {
    const blocks: EditorV6TimelineBlock[] = [
      { id: 'before', elementId: 'actor', state: actorState, label: 'Antes', startFrame: 0, durationFrames: 100 },
      { id: 'one-frame', elementId: 'actor', state: actorState, label: 'Residual', startFrame: 100, durationFrames: 1 },
      { id: 'after', elementId: 'actor', state: actorState, label: 'Depois', startFrame: 101, durationFrames: 100 }
    ]
    const { commands, getTimeline } = createHarness(false, blocks)
    commands.remove('one-frame')
    expect(getTimeline().tracks.find(track => track.id === 'track-1')!.blocks.map(({ id, startFrame }) => ({ id, startFrame }))).toEqual([
      { id: 'before', startFrame: 0 },
      { id: expect.any(String), startFrame: 100 },
      { id: 'after', startFrame: 101 }
    ])
  })

  it('não desloca vídeos, áudios, cards ou falas ao excluir um fundo ou vídeo', () => {
    const background = { id: 'background', label: 'Fundo', startFrame: 0, durationFrames: 60, background: { backgroundColor: '#ffffff', backgroundAssetId: null, backgroundX: 0, backgroundY: 0, backgroundWidth: 100, backgroundHeight: 100, backgroundRotation: 0 } }
    const video = { id: 'video', label: 'Vídeo', mediaId: 'media', startFrame: 60, durationFrames: 60 }
    const videoAfter = { id: 'video-after', label: 'Depois', mediaId: 'media', startFrame: 180, durationFrames: 60 }
    const audio = { id: 'audio', label: 'Áudio', mediaId: 'audio-media', startFrame: 210, durationFrames: 30 }
    const card = { id: 'card', label: 'Card', startFrame: 70, durationFrames: 20, videoCard: { videoBlockId: video.id, components: {
      temporal: { enabled: false, startFrame: 0, endFrame: 20, text: 'Past' as const },
      english: { enabled: false, startFrame: 0, endFrame: 20, text: '' },
      portuguese: { enabled: true, startFrame: 0, endFrame: 20, text: 'Card' }
    } } }
    const speech = { id: 'speech', label: 'Fala', startFrame: 75, durationFrames: 10, parentBlockId: video.id, relativeStartFrame: 15 }
    let timeline: EditorV6Timeline = { fps: 30, durationFrames: 300, tracks: [
      { id: 'videos', kind: 'video', name: 'Vídeos', muted: false, locked: false, blocks: [background, video, videoAfter] },
      { id: 'audio-track', kind: 'audio', name: 'Áudio', muted: false, locked: false, blocks: [audio] },
      { id: 'cards', kind: 'card', name: 'Cards', muted: false, locked: false, blocks: [card] },
      { id: 'speech-track', kind: 'speech', name: 'Falas', muted: false, locked: false, blocks: [speech] }
    ] }
    const commands = createEditorV6TimelineBlockCommands({ getTimeline: () => timeline, getFrame: () => 90, changeTimeline: update => { timeline = normalizeEditorV6Timeline(update(timeline)) }, closeMenu: () => {} })

    commands.remove(background.id)
    expect(timeline.tracks.find(track => track.id === 'videos')?.blocks.map(block => [block.id, block.startFrame])).toEqual([[video.id, video.startFrame], [videoAfter.id, videoAfter.startFrame]])
    expect(timeline.tracks.find(track => track.id === 'audio-track')?.blocks).toEqual([audio])
    expect(timeline.tracks.find(track => track.id === 'cards')?.blocks[0]).toMatchObject({ id: card.id, startFrame: card.startFrame, durationFrames: card.durationFrames })

    commands.remove(video.id)
    expect(timeline.tracks.find(track => track.id === 'videos')?.blocks.map(block => [block.id, block.startFrame])).toEqual([[videoAfter.id, videoAfter.startFrame]])
    expect(timeline.tracks.find(track => track.id === 'audio-track')?.blocks).toEqual([audio])
    expect(timeline.tracks.find(track => track.id === 'cards')?.blocks[0]).toMatchObject({ id: card.id, startFrame: card.startFrame, durationFrames: card.durationFrames })
    expect(timeline.tracks.find(track => track.id === 'speech-track')?.blocks[0]).toEqual({ id: 'speech', label: 'Fala', startFrame: 75, durationFrames: 10 })
  })

  it('desfaz e refaz a exclusão preservando os horários originais', () => {
    const timeline: EditorV6Timeline = { fps: 30, durationFrames: 300, tracks: [{
      id: 'video-track', kind: 'video', name: 'Vídeos', muted: false, locked: false,
      blocks: [
        { id: 'selected', label: 'Fundo', startFrame: 30, durationFrames: 30, background: { backgroundColor: '#ffffff', backgroundAssetId: null, backgroundX: 0, backgroundY: 0, backgroundWidth: 100, backgroundHeight: 100, backgroundRotation: 0 } },
        { id: 'later', label: 'Vídeo', mediaId: 'media', startFrame: 90, durationFrames: 60 }
      ]
    }] }
    const before: EditorV6Document = {
      schemaVersion: 1, id: crypto.randomUUID(), title: 'Undo', color: '#ffffff', createdAt: '2026-11-27T12:00:00.000Z', updatedAt: '2026-11-27T12:00:00.000Z',
      backgroundColor: '#ffffff', backgroundAssetId: null, backgroundX: 0, backgroundY: 0, backgroundWidth: 100, backgroundHeight: 100, backgroundRotation: 0,
      assets: [], elements: [], timeline
    }
    const history = recordEditorV6History({ undo: [], redo: [] }, before)
    const after = { ...before, timeline: { ...timeline, tracks: [{ ...timeline.tracks[0], blocks: [timeline.tracks[0].blocks[1]] }] } }
    const undone = undoEditorV6History(history, after)!
    expect(undone.document.timeline.tracks[0].blocks.map(block => [block.id, block.startFrame])).toEqual([['selected', 30], ['later', 90]])
    const redone = redoEditorV6History(undone.history, undone.document)!
    expect(redone.document.timeline.tracks[0].blocks.map(block => [block.id, block.startFrame])).toEqual([['later', 90]])
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

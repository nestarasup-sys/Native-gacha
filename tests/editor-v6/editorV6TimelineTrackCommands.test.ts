import { describe, expect, it, vi } from 'vitest'
import type { EditorV6Document, EditorV6Element, EditorV6Timeline as Timeline, EditorV6TimelineBlock as Block, EditorV6TimelineTrack as Track } from '../../src/shared/editorV6'
import { createEditorV6TimelineTrackCommands } from '../../src/renderer/src/features/editorV6/editorV6TimelineTrackCommands'

function track(id: string, kind: Track['kind'], blocks: Block[] = [], overrides: Partial<Track> = {}): Track {
  return { id, kind, name: id, muted: false, locked: false, blocks, ...overrides } as Track
}

function character(): EditorV6Element {
  return { id: 'character-element', kind: 'character', characterId: 'hero', assetId: 'character-asset', text: 'Hero', x: 0, y: 0, width: 30, height: 40, rotation: 0, zIndex: 2 }
}

function image(): EditorV6Element {
  return { id: 'image-element', kind: 'image', assetId: 'object-asset', text: 'Prop', x: 0, y: 0, width: 20, height: 20, rotation: 0, zIndex: 1 }
}

function document(elements: EditorV6Element[] = [], tracks?: Track[]): EditorV6Document {
  const timeline: Timeline = { fps: 30, durationFrames: 90, tracks: tracks ?? [track('speech-track', 'speech'), track('thought-track', 'thought'), track('object-track', 'object'), track('video-track', 'video'), track('audio-track', 'audio')], knownElementIds: elements.map(({ id }) => id) }
  return {
    schemaVersion: 1, id: 'project', title: 'Project', color: '#ffffff', createdAt: '2026-11-10T12:00:00.000Z', updatedAt: '2026-11-10T12:00:00.000Z',
    backgroundColor: '#ffffff', backgroundAssetId: null, backgroundX: 0, backgroundY: 0, backgroundWidth: 100, backgroundHeight: 100, backgroundRotation: 0,
    elements, assets: [], timeline
  }
}

function setup(initial = document(), frame = 30) {
  let current = initial
  const changeTimeline = vi.fn((update: (timeline: Timeline) => Timeline) => { current = { ...current, timeline: update(current.timeline) } })
  const changeDocument = vi.fn((update: (document: EditorV6Document) => EditorV6Document) => { current = update(current) })
  const seek = vi.fn(), select = vi.fn(), setNotice = vi.fn()
  let nextId = 0
  const commands = createEditorV6TimelineTrackCommands({
    getDocument: () => current,
    getFrame: () => frame,
    changeTimeline,
    changeDocument,
    seek,
    select,
    setNotice,
    createId: () => `generated-${++nextId}`
  })
  return { commands, changeTimeline, changeDocument, seek, select, setNotice, getDocument: () => current }
}

describe('comandos de faixa da timeline do Editor V6', () => {
  it('adiciona fala no cursor atual, estende a duração e seleciona o novo bloco', () => {
    const context = setup()

    context.commands.onTrack(track('speech-track', 'speech'), 'add')

    const saved = context.getDocument()
    const block = saved.timeline.tracks.find(({ id }) => id === 'speech-track')!.blocks[0]
    expect(saved.elements[0]).toMatchObject({ id: 'generated-1', kind: 'speech', text: 'Digite aqui', zIndex: 1 })
    expect(block).toMatchObject({ id: 'generated-2', elementId: 'generated-1', startFrame: 30, durationFrames: expect.any(Number), label: 'Digite aqui' })
    expect(saved.timeline.durationFrames).toBeGreaterThan(90)
    expect(saved.timeline.knownElementIds).toContain('generated-1')
    expect(context.seek).toHaveBeenCalledWith(30)
    expect(context.select).toHaveBeenCalledWith(block)
  })

  it('seleciona o bloco de personagem existente no cursor sem duplicá-lo', () => {
    const existing: Block = { id: 'character-block', elementId: 'character-element', label: 'Hero', startFrame: 30, durationFrames: 20 }
    const actorTrack = track('hero-track', 'character', [existing], { characterId: 'hero' })
    const context = setup(document([character()], [actorTrack]), 30)

    context.commands.onTrack(actorTrack, 'add')

    expect(context.changeDocument).not.toHaveBeenCalled()
    expect(context.select).toHaveBeenCalledWith(existing)
  })

  it('duplica no cursor o estado visual do objeto ativo sem criar outro asset', () => {
    const prop = { ...image(), x: 44, y: -12 }
    const existing: Block = { id: 'object-block', elementId: prop.id, label: 'Prop em movimento', state: prop, startFrame: 0, durationFrames: 60 }
    const objectTrack = track('object-track', 'object', [existing])
    const context = setup(document([prop], [objectTrack]), 30)

    context.commands.onTrack(objectTrack, 'add')

    const block = context.getDocument().timeline.tracks[0].blocks[1]
    expect(block).toMatchObject({ elementId: prop.id, startFrame: 30, label: 'Prop', state: { x: 44, y: -12 } })
    expect(context.getDocument().elements).toHaveLength(1)
    expect(context.getDocument().elements[0].id).toBe(prop.id)
    expect(context.changeDocument).toHaveBeenCalledOnce()
  })

  it('orienta para os fluxos de importação quando faltam mídia ou imagem-base', () => {
    const context = setup()

    context.commands.onTrack(track('audio-track', 'audio'), 'add')
    context.commands.onTrack(track('object-track', 'object'), 'add')
    context.commands.onTrack(track('video-track', 'video'), 'add')

    expect(context.setNotice.mock.calls.map(([message]) => message)).toEqual([
      'Use Importar áudio para copiar uma mídia para o projeto e criar um bloco.',
      'Importe uma imagem em Objetos para criar um bloco.',
      'Use Selecionar vídeo para adicionar clipes à faixa Vídeo.'
    ])
    expect(context.changeDocument).not.toHaveBeenCalled()
  })

  it('permite ocultar/desbloquear faixa travada e bloqueia as demais mutações', () => {
    const locked = track('speech-track', 'speech', [], { locked: true })
    const context = setup(document([], [locked]))

    context.commands.onTrack(locked, 'add')
    context.commands.onTrack(locked, 'rename', 'Novo nome')
    expect(context.changeTimeline).not.toHaveBeenCalled()

    context.commands.onTrack(locked, 'hidden')
    expect(context.getDocument().timeline.tracks[0]).toMatchObject({ hidden: true, muted: false, locked: true })
    context.commands.onTrack(context.getDocument().timeline.tracks[0], 'locked')
    expect(context.getDocument().timeline.tracks[0].locked).toBe(false)
  })

  it('ignora movimento de faixa fixa no rodapé', () => {
    const context = setup(document([], [track('object-track', 'object'), track('speech-track', 'speech')]))

    context.commands.onTrack(track('object-track', 'object'), 'up')

    expect(context.changeTimeline).not.toHaveBeenCalled()
  })

  it('reordena faixas dentro do mesmo grupo e bloqueia cruzamento entre grupos', () => {
    const videoTrack = track('video-track', 'video')
    const speechTrack = track('speech-track', 'speech')
    const actorTrack = track('hero-track', 'character', [], { characterId: 'hero' })
    const objectTrack = track('object-track', 'object')
    const context = setup(document([], [videoTrack, speechTrack, actorTrack, objectTrack]))

    context.commands.onTrack(videoTrack, 'down')
    expect(context.getDocument().timeline.tracks.map(({ id }) => id)).toEqual(['speech-track', 'video-track', 'hero-track', 'object-track'])

    context.commands.onTrack(actorTrack, 'up')
    expect(context.getDocument().timeline.tracks.map(({ id }) => id)).toEqual(['speech-track', 'video-track', 'hero-track', 'object-track'])
  })
})

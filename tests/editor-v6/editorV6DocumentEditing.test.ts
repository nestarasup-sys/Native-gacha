import { afterEach, describe, expect, it } from 'vitest'
import { createEditorV6Timeline, type EditorV6Document, type EditorV6Element } from '../../src/shared/editorV6'
import { splitEditorV6Block } from '../../src/shared/editorV6Timeline'
import { createEditorV6DocumentEditingCommands } from '../../src/renderer/src/features/editorV6/editorV6DocumentEditing'
import { useEditorV6Store } from '../../src/renderer/src/features/editorV6/editorV6Store'

function makeProject(): EditorV6Document {
  const character: EditorV6Element = { id: 'actor', kind: 'character', characterId: 'character-1', assetId: 'asset-1', text: 'Actor', x: 0, y: 0, width: 20, height: 30, rotation: 0, zIndex: 0 }
  const timeline = createEditorV6Timeline([character])
  const characterTrack = timeline.tracks.find((track) => track.kind === 'character')!
  const firstBlockId = characterTrack.blocks[0].id
  const separated = splitEditorV6Block(timeline, firstBlockId, 90)
  return {
    schemaVersion: 1, id: 'edit-project', title: 'Edit', color: '#abc', createdAt: 'created', updatedAt: 'before',
    backgroundColor: '#fff', backgroundAssetId: null, backgroundX: 0, backgroundY: 0,
    backgroundWidth: 100, backgroundHeight: 100, backgroundRotation: 0,
    assets: [{ id: 'asset-1', category: 'character', name: 'Actor', mimeType: 'image/png', dataUrl: 'data:actor' }],
    elements: [character], timeline: separated
  }
}

function harness(options: { project?: EditorV6Document | null; selectedElementId?: string | null; selectedTimelineBlockId?: string | null; frame?: number } = {}) {
  let current = options.project === undefined ? makeProject() : options.project
  const events: unknown[] = []
  const reference = { current: current?.id ?? null }
  const commands = createEditorV6DocumentEditingCommands({
    activeProject: current,
    activeProjectId: current?.id ?? null,
    activeProjectIdRef: reference,
    selectedElementId: options.selectedElementId === undefined ? 'actor' : options.selectedElementId,
    selectedTimelineBlockId: options.selectedTimelineBlockId === undefined ? null : options.selectedTimelineBlockId,
    updateActiveProject: (update) => { if (current) current = update(current); events.push(['updated']) },
    getFrame: () => options.frame ?? 120,
    markUnsaved: () => events.push(['unsaved']),
    setCanUndo: (value) => events.push(['can-undo', value]),
    setCanRedo: (value) => events.push(['can-redo', value]),
    bumpHistoryVersion: () => events.push(['history-version'])
  })
  return { commands, events, reference, getProject: () => current }
}

afterEach(() => { useEditorV6Store.getState().clear('edit-project') })

describe('edição do documento do Editor V6', () => {
  it('aplica patch ao bloco selecionado e mantém o snapshot do período anterior', () => {
    const initial = makeProject()
    const tracks = initial.timeline.tracks.map((track) => track.kind === 'character'
      ? { ...track, blocks: track.blocks.map((block, index) => index === 1 ? { ...block, id: 'selected-block' } : block) }
      : track)
    const project = { ...initial, timeline: { ...initial.timeline, tracks } }
    const { commands, getProject } = harness({ project, selectedTimelineBlockId: 'selected-block' })

    commands.patchDocument((document) => ({ ...document, elements: document.elements.map((element) => ({ ...element, poseSlot: 4 })) }))

    const updatedTrack = getProject()!.timeline.tracks.find((track) => track.kind === 'character')!
    expect(updatedTrack.blocks[0].state?.poseSlot).toBeUndefined()
    expect(updatedTrack.blocks[1].state?.poseSlot).toBe(4)
  })

  it('usa o clip no playhead quando a seleção de bloco não corresponde ao elemento', () => {
    const { commands, getProject } = harness({ selectedTimelineBlockId: 'stale-block' })
    commands.patchDocument((document) => ({ ...document, elements: document.elements.map((element) => ({ ...element, poseSlot: 6 })) }))
    const track = getProject()!.timeline.tracks.find((item) => item.kind === 'character')!
    expect(track.blocks[0].state?.poseSlot).toBeUndefined()
    expect(track.blocks[1].state?.poseSlot).toBe(6)
  })

  it('edita o documento base quando nenhum elemento está selecionado', () => {
    const { commands, getProject } = harness({ selectedElementId: null })
    commands.patchDocument((document) => ({ ...document, title: 'Título atualizado' }))
    expect(getProject()?.title).toBe('Título atualizado')
  })

  it('ignora prévia facial obsoleta e normaliza/publica a prévia da sessão ativa', () => {
    const { commands, events, getProject } = harness()
    commands.patchFacePreview('old-project', 'any-block', (document) => ({ ...document, title: 'Stale' }))
    expect(events).toEqual([])

    const activeBlock = getProject()!.timeline.tracks.find((track) => track.kind === 'character')!.blocks[0]
    commands.patchFacePreview('edit-project', activeBlock.id, (document) => ({ ...document, elements: document.elements.map((element) => ({ ...element, activeFaceMode: 'blink' })) }))
    expect(events).toEqual([['updated'], ['unsaved']])
    expect(getProject()!.timeline.tracks.find((track) => track.kind === 'character')!.blocks[0].state?.activeFaceMode).toBe('blink')
  })

  it('registra histórico e sincroniza as faixas ao alterar elementos da cena', () => {
    const { commands, events, getProject } = harness()
    commands.changeScene((document) => ({ ...document, elements: [...document.elements, { ...document.elements[0], id: 'actor-2', characterId: 'character-2' }] }))
    expect(events).toEqual([['can-undo', true], ['can-redo', false], ['history-version'], ['updated'], ['unsaved']])
    expect(getProject()!.timeline.tracks.some((track) => track.kind === 'character' && track.characterId === 'character-2')).toBe(true)
  })

  it('não inicia transação de cena sem projeto ativo', () => {
    const { commands, events } = harness({ project: null })
    commands.changeScene((document) => document)
    expect(events).toEqual([])
  })
})

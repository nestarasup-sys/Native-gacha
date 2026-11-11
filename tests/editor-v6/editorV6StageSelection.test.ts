import { describe, expect, it } from 'vitest'
import type { EditorV6Document, EditorV6Element, EditorV6TimelineBlock } from '../../src/shared/editorV6'
import { createEditorV6StageSelectionCommands } from '../../src/renderer/src/features/editorV6/editorV6StageSelection'

const actor = (id: string, characterId: string, positionLocked = false): EditorV6Element => ({
  id, characterId, kind: 'character', text: characterId, x: 0, y: 0, width: 10, height: 10, rotation: 0, zIndex: 0, positionLocked
})

function createCommands(overrides: Partial<Parameters<typeof createEditorV6StageSelectionCommands>[0]> = {}) {
  const events: unknown[] = []
  const project = {
    id: 'project-1', updatedAt: 'old', elements: [actor('actor-1', 'character-1'), actor('actor-2', 'character-2')],
    timeline: { fps: 30, durationFrames: 300, tracks: [{ id: 'track', kind: 'character', characterId: 'character-1', name: 'actor', muted: false, locked: false, blocks: [{ id: 'block-4', elementId: 'actor-1', label: 'Actor', startFrame: 0, durationFrames: 90, state: actor('actor-1', 'character-1') }] }] }
  } as EditorV6Document
  const commands = createEditorV6StageSelectionCommands({
    project,
    stageCharacters: project.elements,
    allPositionsLocked: false,
    currentFrame: () => 12,
    pausePlayback: () => events.push(['paused']),
    changeScene: (transform) => events.push(['changed', transform(project)]),
    now: () => 'now',
    setCastSelection: (ids) => events.push(['cast-selection', ids]),
    setCastPickerOpen: (open) => events.push(['cast-open', open]),
    setSelectedElementId: (id) => events.push(['element', id]),
    setSelectedTimelineBlockId: (id) => events.push(['block', id]),
    setActiveTool: (tool) => events.push(['tool', tool]),
    setInspectorOpen: (open) => events.push(['inspector', open]),
    setInspectorTab: (tab) => events.push(['tab', tab]),
    restoreCharacterInspectorView: () => events.push(['restore-character-view']),
    ...overrides
  })
  return { commands, events, project }
}

describe('comandos de seleção do palco do Editor V6', () => {
  it('abre o seletor do elenco com os personagens atuais do palco', () => {
    const { commands, events } = createCommands()
    commands.openCastPicker()
    expect(events).toEqual([['cast-selection', ['character-1', 'character-2']], ['cast-open', true]])
  })

  it('alterna o bloqueio de posição de todos os personagens e registra a edição', () => {
    const { commands, events, project } = createCommands()
    commands.toggleCharacterPositionLock()
    expect(events).toEqual([['changed', expect.objectContaining({ updatedAt: 'now', elements: project.elements.map((item) => ({ ...item, positionLocked: true })) })]])
  })

  it('seleciona o personagem e o bloco ativo antes de abrir o Inspector', () => {
    const { commands, events, project } = createCommands()
    commands.selectStageCharacter(project.elements[0])
    expect(events).toEqual([
      ['paused'], ['element', 'actor-1'], ['block', 'block-4'], ['tool', null], ['inspector', true], ['restore-character-view']
    ])
  })

  it('seleciona fundo da timeline e força a aba de edição', () => {
    const { commands, events } = createCommands()
    commands.selectTimelineBlock({ id: 'background-1', label: 'Fundo', startFrame: 0, durationFrames: 30, background: { backgroundColor: '#fff', backgroundAssetId: null, backgroundX: 0, backgroundY: 0, backgroundWidth: 100, backgroundHeight: 100, backgroundRotation: 0 } } as EditorV6TimelineBlock)
    expect(events).toEqual([
      ['block', 'background-1'], ['element', 'background'], ['tool', 'background'], ['inspector', true], ['tab', 'editor']
    ])
  })

  it('não altera o palco quando não há projeto ou personagem visível para bloquear', () => {
    const { commands, events } = createCommands({ project: null, stageCharacters: [] })
    commands.toggleCharacterPositionLock()
    expect(events).toEqual([])
  })
})

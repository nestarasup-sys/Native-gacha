import { describe, expect, it } from 'vitest'
import type { CustomizerCharacter } from '../../src/shared/customizer'
import type { EditorV6Document, EditorV6Element } from '../../src/shared/editorV6'
import { createEditorV6SceneViewModel } from '../../src/renderer/src/features/editorV6/editorV6SceneViewModel'

function element(id: string, overrides: Partial<EditorV6Element> = {}): EditorV6Element {
  return {
    id, kind: 'character', characterId: 'character-1', assetId: `asset-${id}`, text: id,
    x: 0, y: 0, width: 100, height: 100, rotation: 0, zIndex: 1, ...overrides
  }
}

function project(): EditorV6Document {
  const base = element('base')
  const first = element('frame-1', { text: 'Primeiro estado' })
  const second = element('frame-2', { text: 'Estado do playhead', activeFaceMode: 'talk' })
  return {
    id: 'project-1', schemaVersion: 1, title: 'Teste', color: '#000000', createdAt: '', updatedAt: '',
    backgroundColor: '#ffffff', backgroundAssetId: null, backgroundX: 0, backgroundY: 0,
    backgroundWidth: 100, backgroundHeight: 100, backgroundRotation: 0,
    assets: [], elements: [base], timeline: {
      fps: 30, durationFrames: 60, knownElementIds: [base.id],
      tracks: [{ id: 'character-track', kind: 'character', characterId: 'character-1', name: 'Personagem', muted: false, locked: false, blocks: [
        { id: 'clip-first', elementId: base.id, label: 'Primeiro', startFrame: 0, durationFrames: 20, state: first },
        { id: 'clip-second', elementId: base.id, label: 'Segundo', startFrame: 20, durationFrames: 20, state: second }
      ] }]
    }
  }
}

function character(): CustomizerCharacter {
  return {
    id: 'character-1', name: 'Personagem', hair: '', outfit: '', skin: '', createdAt: '', updatedAt: '',
    customization: {
      modelSlot: null,
      poseSlot: 5,
      partOverrides: {},
      layerOrder: [],
      faceAppearance: { modelSlot: 1, eyeState: 2 }
    }
  }
}

describe('view model de cena do Editor V6', () => {
  it('fornece uma prévia segura e uma seleção vazia quando não há projeto', () => {
    const model = createEditorV6SceneViewModel({
      project: null,
      availableCharacters: [],
      playheadFrame: 10,
      selectedTimelineBlockId: 'stale-block',
      selectedElementId: 'stale-element'
    })

    expect(model.previewScene).toBeNull()
    expect(model.previewBackground).toEqual({
      backgroundColor: '#d7b5cd', backgroundAssetId: null,
      backgroundX: 0, backgroundY: 0, backgroundWidth: 100, backgroundHeight: 100, backgroundRotation: 0
    })
    expect(model.visibleTimelineElements).toEqual([])
    expect(model.inspectorSelection.selectedElement).toBeNull()
    expect(model.selectedEditorV6Character).toBeNull()
    expect(model.selectedEditorV6CharacterModelSlot).toBeNull()
    expect(model.selectedEditorV6FaceMode).toBe('idle')
  })

  it('mantém o bloco selecionado como Inspector e usa os padrões do personagem', () => {
    const document = project()
    const available = character()
    const model = createEditorV6SceneViewModel({
      project: document,
      availableCharacters: [available],
      playheadFrame: 25,
      selectedTimelineBlockId: 'clip-first',
      selectedElementId: 'base'
    })

    expect(model.previewScene?.elements[0]?.text).toBe('Estado do playhead')
    expect(model.inspectorSelection.selectedElement?.text).toBe('Primeiro estado')
    expect(model.inspectorSelection.selectedCharacterElement?.text).toBe('Estado do playhead')
    expect(model.selectedEditorV6Character).toBe(available)
    expect(model.selectedEditorV6CharacterModelSlot).toBe(1)
    expect(model.selectedEditorV6PoseSlot).toBe(5)
    expect(model.selectedEditorV6FaceAppearance).toBe(available.customization.faceAppearance)
    expect(model.selectedEditorV6FaceMode).toBe('blink')
  })

  it('prioriza pose, aparência e modo facial explicitamente salvos no estado da cena', () => {
    const document = project()
    const selectedState = element('frame-1', {
      poseSlot: null,
      faceAppearance: { modelSlot: 2, eyeState: 0, mouthOpen: true },
      activeFaceMode: 'talk'
    })
    document.timeline.tracks[0]!.blocks[0]!.state = selectedState
    const available = character()

    const model = createEditorV6SceneViewModel({
      project: document,
      availableCharacters: [available],
      playheadFrame: 25,
      selectedTimelineBlockId: 'clip-first',
      selectedElementId: 'base'
    })

    expect(model.selectedEditorV6PoseSlot).toBeNull()
    expect(model.selectedEditorV6FaceAppearance).toBe(selectedState.faceAppearance)
    expect(model.selectedEditorV6FaceMode).toBe('talk')
  })
})

import { describe, expect, it, vi } from 'vitest'
import type { CustomizerCharacter, CustomizerFaceAppearance } from '../../src/shared/customizer'
import type { EditorV6Document, EditorV6Element, EditorV6FaceTransform } from '../../src/shared/editorV6'
import { createEditorV6FaceTransformCommands } from '../../src/renderer/src/features/editorV6/editorV6FaceTransformCommands'

const appearance = { modelSlot: 1, setId: 'face-1' } as CustomizerFaceAppearance
const defaultTransform: EditorV6FaceTransform = { x: 1, y: 2, width: 100, height: 100, rotation: 0 }

function character(): CustomizerCharacter {
  return { id: 'character-1', name: 'Hero', customization: { modelSlot: 1, poseSlot: 2, faceAppearance: appearance } } as CustomizerCharacter
}

function element(overrides: Partial<EditorV6Element> = {}): EditorV6Element {
  return {
    id: 'element-1', kind: 'character', characterId: 'character-1', assetId: 'asset-1', text: 'Hero',
    x: 0, y: 0, width: 100, height: 120, rotation: 0, zIndex: 1, poseSlot: 4,
    faceTransforms: { 'eyes:left': { x: 5, y: 6, width: 80, height: 90, rotation: 3 } },
    ...overrides
  }
}

function project(target = element()): EditorV6Document {
  return {
    id: 'project-1', schemaVersion: 1, title: 'Projeto', color: '#000000', createdAt: '', updatedAt: '',
    backgroundColor: '#000000', backgroundAssetId: null, backgroundX: 0, backgroundY: 0,
    backgroundWidth: 100, backgroundHeight: 100, backgroundRotation: 0,
    assets: [], elements: [target], timeline: {
      fps: 30, durationFrames: 60, knownElementIds: [target.id],
      tracks: [{ id: 'track-1', kind: 'character', characterId: target.characterId, name: 'Hero', muted: false, locked: false, blocks: [
        { id: 'clip-before', elementId: target.id, label: 'Antes', startFrame: 0, durationFrames: 20, state: target },
        { id: 'clip-at-playhead', elementId: target.id, label: 'Playhead', startFrame: 20, durationFrames: 20, state: target }
      ] }]
    }
  }
}

function commands(overrides: Partial<Parameters<typeof createEditorV6FaceTransformCommands>[0]> = {}) {
  const updateElement = vi.fn()
  const getFrame = vi.fn(() => 21)
  const schedulePreview = vi.fn()
  const flushPreview = vi.fn()
  const transformsRef = { current: {} as Record<string, NonNullable<EditorV6Element['faceTransforms']>> }
  const result = createEditorV6FaceTransformCommands({
    activeProject: project(), activeProjectId: 'project-1', selectedElement: element(), selectedCharacter: character(),
    selectedFaceAppearance: appearance, selectedTimelineBlockId: 'clip-before', transformsRef, defaultTransform,
    updateElement, getFrame, schedulePreview, flushPreview, ...overrides
  })
  return { ...result, updateElement, getFrame, schedulePreview, flushPreview, transformsRef }
}

describe('comandos de transformação facial do Editor V6', () => {
  it('mantém transforms em rascunho, grava a edição e agenda o preview do bloco selecionado', () => {
    const actor = element()
    const state = commands({ selectedElement: actor })

    state.update('eyes:left', { y: 25 }, true)

    expect(state.transformsRef.current[actor.id]['eyes:left']).toEqual({ x: 5, y: 25, width: 80, height: 90, rotation: 3 })
    expect(state.updateElement).toHaveBeenCalledWith(actor.id, { faceTransforms: state.transformsRef.current[actor.id] }, true)
    expect(state.schedulePreview).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'project-1', elementId: actor.id, assetId: 'asset-1', blockId: 'clip-before',
      poseSlot: 4, character: expect.objectContaining({ customization: expect.objectContaining({ poseSlot: 4, faceAppearance: appearance }) }),
      transforms: state.transformsRef.current[actor.id], previousState: expect.objectContaining({ faceTransforms: actor.faceTransforms })
    }))
    expect(state.getFrame).not.toHaveBeenCalled()

    state.finish('eyes:left')
    expect(state.flushPreview).toHaveBeenCalledOnce()
  })

  it('usa o bloco no playhead quando o bloco selecionado não pertence ao personagem', () => {
    const state = commands({ selectedTimelineBlockId: 'block-of-another-element' })

    state.update('nose', { x: 13 })

    expect(state.getFrame).toHaveBeenCalledOnce()
    expect(state.schedulePreview).toHaveBeenCalledWith(expect.objectContaining({ blockId: 'clip-at-playhead' }))
    expect(state.updateElement).toHaveBeenCalledWith('element-1', expect.anything(), false)
  })

  it('não agenda preview nem libera flush para elementos que não são personagens', () => {
    const state = commands({ selectedElement: element({ kind: 'image' }) })

    state.update('eyes:left', { x: 20 })
    state.finish('eyes:left')

    expect(state.updateElement).not.toHaveBeenCalled()
    expect(state.schedulePreview).not.toHaveBeenCalled()
    expect(state.flushPreview).not.toHaveBeenCalled()
  })
})

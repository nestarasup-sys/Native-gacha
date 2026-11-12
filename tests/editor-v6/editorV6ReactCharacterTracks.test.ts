import { describe, expect, it, vi } from 'vitest'
import type { CustomizerCharacter } from '../../src/shared/customizer'
import type { EditorV6Asset } from '../../src/shared/editorV6'
import type { EditorV6ReactImportPlan } from '../../src/shared/editorV6ReactImport'
import { compileEditorV6ReactCharacterTracks } from '../../src/renderer/src/features/editorV6/editorV6ReactCharacterTracks'

const actor = {
  characterId: 'character-1', name: 'Luka', modelSlot: 1, x: -12, y: 4, flipX: false
} as EditorV6ReactImportPlan['cast'][number]
const character = {
  id: 'character-1', name: 'Luka', updatedAt: 'source-revision',
  customization: { modelSlot: 1, faceAppearance: { modelSlot: 1, setId: 'face-1' } }
} as unknown as CustomizerCharacter

function renderedState(id: string) {
  return {
    base: { id } as EditorV6Asset,
    extras: [],
    faceModeAssetIds: { idle: id },
    width: 120,
    height: 180,
    characterCanvasWidth: 240,
    appearance: { modelSlot: 1, setId: 'face-1' },
    transforms: {},
    effects: undefined
  }
}

describe('compilação das faixas de personagens do importador React V6', () => {
  it('cria um estado por beat, conserva a pose até a próxima mudança e delimita os blocos', async () => {
    const renderState = vi.fn(async (_actor, poseSlot, expression, gaze) =>
      renderedState(`image-${poseSlot}-${expression ?? 'base'}-${gaze}`))
    let nextId = 0
    const result = await compileEditorV6ReactCharacterTracks({
      actors: [actor],
      beats: [
        { characterId: actor.characterId, startFrame: 0, poseSlot: 2, expression: 'happy', gaze: 'left' },
        { characterId: actor.characterId, startFrame: 40, expression: 'calm' }
      ],
      durationFrames: 100,
      characters: [character],
      poseRevisions: new Map([[actor.characterId, new Map([[2, 'pose-revision']])]]),
      renderState,
      createId: () => `id-${++nextId}`
    })

    expect(result.tracks).toHaveLength(1)
    expect(result.tracks[0]).toMatchObject({ kind: 'character', characterId: actor.characterId, name: 'Luka' })
    expect(result.tracks[0].blocks.map(({ startFrame, durationFrames }) => [startFrame, durationFrames]))
      .toEqual([[0, 40], [40, 60]])
    expect(result.tracks[0].blocks.map((block) => block.state?.assetId))
      .toEqual(['image-2-happy-left', 'image-2-calm-left'])
    expect(result.elements).toHaveLength(1)
    expect(result.elements[0]).toMatchObject({
      id: result.tracks[0].blocks[0].elementId,
      poseSlot: 2,
      poseSourceRevision: 'pose-revision',
      activeExpressionPresetId: 'happy',
      activeExpressionGaze: 'left',
      characterSourceUpdatedAt: 'source-revision'
    })
    expect(result.elements[0].expressionBase?.appearance).toEqual(character.customization.faceAppearance)
    expect(renderState).toHaveBeenNthCalledWith(2, actor, 2, 'calm', 'left')
  })

  it('rejeita elenco sem estado inicial e estados que não geram nenhum bloco visível', async () => {
    const common = {
      actors: [actor], durationFrames: 100, characters: [character], poseRevisions: new Map(),
      renderState: vi.fn(async () => renderedState('image')),
      createId: (() => { let id = 0; return () => `id-${++id}` })()
    }
    await expect(compileEditorV6ReactCharacterTracks({
      ...common, beats: [{ characterId: actor.characterId, startFrame: 1 }]
    })).rejects.toThrow('Personagem sem estado inicial: Luka')
    await expect(compileEditorV6ReactCharacterTracks({
      ...common, durationFrames: 0, beats: [{ characterId: actor.characterId, startFrame: 0 }]
    })).rejects.toThrow('Personagem sem imagens visuais: Luka')
  })
})

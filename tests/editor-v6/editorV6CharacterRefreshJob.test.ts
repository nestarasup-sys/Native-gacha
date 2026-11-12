import { describe, expect, it, vi } from 'vitest'
import type { CustomizerCharacter } from '../../src/shared/customizer'
import type { EditorV6Element } from '../../src/shared/editorV6'
import type { FaceExpressionPreset } from '../../src/shared/fabricator'
import type { EditorV6CharacterRefreshGroup } from '../../src/renderer/src/features/editorV6/editorV6CharacterRefreshTypes'
import { prepareEditorV6CharacterRefreshJob } from '../../src/renderer/src/features/editorV6/editorV6CharacterRefreshJob'

const appearance = { modelSlot: 2, setId: 'legacy-face' }
const character = {
  id: 'character-a', name: 'A', updatedAt: 'source-rev',
  customization: { modelSlot: 2, poseSlot: 1, faceAppearance: appearance }
} as unknown as CustomizerCharacter
const transforms = {
  neutral: { x: 1, y: 2, width: 100, height: 100, rotation: 0 },
  'expression:eye-left:catalog': { x: 3, y: 4, width: 100, height: 100, rotation: 0 },
  'expression-component:eye-left': { x: 5, y: 6, width: 100, height: 100, rotation: 0 }
} as EditorV6Element['faceTransforms']
const state = {
  id: 'element-a', kind: 'character', characterId: character.id, assetId: 'asset-old', text: 'A',
  poseSlot: 4, faceAppearance: appearance, faceTransforms: transforms, activeFaceMode: 'talk',
  activeExpressionPresetId: 'missing-preset'
} as EditorV6Element
const group: EditorV6CharacterRefreshGroup = {
  character, state, targets: [{ kind: 'element', id: state.id, state }],
  poseRevision: 'pose-rev', modelRevision: 'model-rev', wardrobeRevision: 'wardrobe-rev',
  hairRevision: 'hair-rev', headExtraRevision: 'head-rev', eyeRevision: 'eye-rev'
}

const noPresetDependencies = () => ({
  loadPreset: vi.fn(async () => null),
  loadFaceCatalogItem: vi.fn(async () => null),
  loadFaceComponentAsset: vi.fn(async () => null)
})

describe('preparação do job de atualização de snapshot facial', () => {
  it('preserva revisões e transforms de cena enquanto remove transforms antigos de expressão', async () => {
    const dependencies = noPresetDependencies()
    const job = await prepareEditorV6CharacterRefreshJob(group, dependencies)

    expect(job.characterCopy.customization.poseSlot).toBe(4)
    expect(job.characterCopy.customization.faceAppearance).toEqual(appearance)
    expect(job).toMatchObject({
      poseRevision: 'pose-rev', modelRevision: 'model-rev', wardrobeRevision: 'wardrobe-rev',
      hairRevision: 'hair-rev', headExtraRevision: 'head-rev', eyeRevision: 'eye-rev',
      faceMode: 'talk', preset: null
    })
    expect(job.expressionBase?.transforms).toEqual({ neutral: transforms?.neutral })
    expect(job.faceTransforms).toEqual({ neutral: transforms?.neutral })
    expect(JSON.parse(job.sourceKey)).toEqual([
      character.id, character.updatedAt, 2, 4, 'model-rev', 'pose-rev',
      'wardrobe-rev', 'hair-rev', 'head-rev', 'eye-rev'
    ])
    expect(JSON.parse(job.rendererKey)[0]).toBe(job.sourceKey)
    expect(dependencies.loadPreset).toHaveBeenCalledWith(2, 'missing-preset')
    expect(dependencies.loadFaceCatalogItem).not.toHaveBeenCalled()
    expect(dependencies.loadFaceComponentAsset).not.toHaveBeenCalled()
  })

  it('rebuilds preset transforms through the supplied component loader', async () => {
    const preset = {
      id: 'preset-a', modelSlot: 2, name: 'Preset', updatedAt: 'preset-rev',
      selections: { eyes: { left: 'source-eye', right: null }, pupils: { left: null, right: null }, eyebrows: { left: null, right: null }, nose: null, mouth: null },
      transforms: { eyeLeft: { x: 15, y: 20, scaleX: 1.1, scaleY: 1, rotation: 0 } }
    } as unknown as FaceExpressionPreset
    const sourceEye = {
      schemaVersion: 1, id: 'source-eye', modelSlot: 2, name: 'Source eye',
      width: 100, height: 60, kind: 'eye' as const,
      defaultTransform: { x: 10, y: 20, scaleX: 1, scaleY: 1, rotation: 0 },
      updatedAt: 'source-eye-rev', dataUrl: 'data:image/png;base64,AA=='
    }
    const targetEye = {
      ...sourceEye, id: 'target-eye', name: 'Target eye',
      defaultTransform: { x: 30, y: 40, scaleX: 1, scaleY: 1, rotation: 0 }
    }
    const targetAppearance = {
      ...appearance,
      components: { 'eye-left': { assetId: targetEye.id, transform: targetEye.defaultTransform } }
    }
    const dependencies = {
      loadPreset: vi.fn(async () => preset),
      loadFaceCatalogItem: vi.fn(async () => null),
      loadFaceComponentAsset: vi.fn(async (_modelSlot: number, id: string) => id === sourceEye.id ? sourceEye : id === targetEye.id ? targetEye : null)
    }
    const job = await prepareEditorV6CharacterRefreshJob({
      ...group,
      character: { ...character, customization: { ...character.customization, faceAppearance: targetAppearance } },
      state: { ...state, faceAppearance: targetAppearance, activeExpressionPresetId: preset.id }
    }, dependencies)

    expect(job.preset).toBe(preset)
    expect(job.appearance).toEqual(targetAppearance)
    expect(job.appearance).not.toBe(targetAppearance)
    expect(job.faceTransforms?.neutral).toEqual(transforms?.neutral)
    expect(dependencies.loadPreset).toHaveBeenCalledWith(2, preset.id)
    expect(dependencies.loadFaceComponentAsset).toHaveBeenCalledWith(2, sourceEye.id)
    expect(dependencies.loadFaceComponentAsset).toHaveBeenCalledWith(2, targetEye.id)
    expect(job.faceTransforms?.['expression-component:eye-left']?.sourceTransformOverride).toMatchObject({ x: 35, y: 40 })
    expect(dependencies.loadFaceCatalogItem).not.toHaveBeenCalled()
  })
})

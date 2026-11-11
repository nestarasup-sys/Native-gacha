import { describe, expect, it } from 'vitest'
import type { CustomizerCharacter } from '../../src/shared/customizer'
import type { EditorV6Element } from '../../src/shared/editorV6'
import type { EditorV6HairMotionTarget } from '../../src/renderer/src/features/editorV6/editorV6HairMotionTargets'
import { groupEditorV6HairMotionTargets } from '../../src/renderer/src/features/editorV6/editorV6HairMotionGroups'

function character(id: string, poseSlot: number, hasHair = true): CustomizerCharacter {
  return { id, name: id, customization: { poseSlot, ...(hasHair ? { hairAppearance: { modelSlot: 1, parts: [] } } : {}) } } as unknown as CustomizerCharacter
}

function target(characterId: string, assetId: string, poseSlot?: number | null): EditorV6HairMotionTarget {
  return { elementId: `${characterId}-actor`, assetId, faceMode: 'idle', state: { characterId, ...(poseSlot !== undefined ? { poseSlot } : {}) } as EditorV6Element }
}

describe('groupEditorV6HairMotionTargets', () => {
  it('uses the saved pose only when the scene state omits it and does not mutate the catalog character', () => {
    const saved = character('hero', 2)
    const inheritedPose = target('hero', 'inherited')
    const explicitSamePose = target('hero', 'explicit', 2)
    const explicitBasePose = target('hero', 'base', null)

    const groups = groupEditorV6HairMotionTargets([inheritedPose, explicitSamePose, explicitBasePose, target('missing', 'missing')], new Map([[saved.id, saved]]))

    expect([...groups.keys()]).toEqual(['hero:2', 'hero:base'])
    expect(groups.get('hero:2')?.targets).toEqual([inheritedPose, explicitSamePose])
    expect(groups.get('hero:2')?.character.customization.poseSlot).toBe(2)
    expect(groups.get('hero:base')?.character.customization.poseSlot).toBeNull()
    expect(groups.get('hero:2')?.character).not.toBe(saved)
    expect(groups.get('hero:2')?.character.customization).not.toBe(saved.customization)
    expect(saved.customization.poseSlot).toBe(2)
  })

  it('separates explicit poses and ignores catalog characters without a selected hairstyle', () => {
    const saved = character('hero', 2)
    const bald = character('bald', 1, false)
    const groups = groupEditorV6HairMotionTargets([
      target('hero', 'pose-two', 2), target('hero', 'pose-three', 3), target('bald', 'without-hair')
    ], new Map([[saved.id, saved], [bald.id, bald]]))

    expect([...groups.keys()]).toEqual(['hero:2', 'hero:3'])
    expect(groups.get('hero:2')?.targets.map(item => item.assetId)).toEqual(['pose-two'])
    expect(groups.get('hero:3')?.character.customization.poseSlot).toBe(3)
  })
})

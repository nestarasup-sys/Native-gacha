import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import type { CustomizerCharacter } from '../../src/shared/customizer'
import type { FabricatorProject } from '../../src/shared/fabricator'
import type { CharacterRenderAssetProvider } from '../../src/shared/characterRenderAssets'
import { resolveSavedCharacterSource } from '../../src/renderer/src/characters/characterSourceResolver'
import { EDITOR_V6_FACE_RENDER_VERSION } from '../../src/renderer/src/features/editorV6/faceModeAssets'
import { planEditorV6CharacterRefresh } from '../../src/renderer/src/features/editorV6/characterSnapshotRefresh'

describe('geometria corporal no refresh de snapshots do Editor V6', () => {
  it('aplica o ajuste de coxa uma vez, como no Customizador, ao atualizar o snapshot', async () => {
    const stamp = '2026-10-31T19:29:24.028Z'
    const source = {
      width: 100,
      height: 120,
      parts: [
        { id: 'torso', name: 'Tronco', x: 40, y: 25, width: 20, height: 45, rotation: 0, dataUrl: '' },
        { id: 'thigh', name: 'Coxa esquerda', x: 34, y: 62, width: 16, height: 38, rotation: 0, dataUrl: '' }
      ],
      joints: [{ id: 'hip', parentPartId: 'torso', childPartId: 'thigh', parentAnchor: { x: 48, y: 65 }, childAnchor: { x: 42, y: 62 } }],
      layerOrder: ['torso', 'thigh'],
      hiddenPartIds: []
    } as unknown as FabricatorProject
    const character = {
      id: 'yest-fixture',
      name: 'Yest fixture',
      createdAt: stamp,
      updatedAt: stamp,
      hair: '#000000',
      outfit: '#000000',
      skin: '#000000',
      customization: { modelSlot: 1, poseSlot: null, partOverrides: {}, layerOrder: [], bodyDimensions: { thighsWidth: 113 } }
    } as unknown as CustomizerCharacter
    const assetProvider = {} as CharacterRenderAssetProvider

    const previewSource = await resolveSavedCharacterSource(character, { source, artwork: source, assetProvider })
    const previewThighWidth = previewSource.artwork.parts.find((part) => part.id === 'thigh')!.width
    const thighToTorsoRatio = (artwork: typeof previewSource.artwork) =>
      artwork.parts.find((part) => part.id === 'thigh')!.width / artwork.parts.find((part) => part.id === 'torso')!.width
    const previewRatio = thighToTorsoRatio(previewSource.artwork)

    // Reproduce the old refresh behavior: feed the already-shaped preview art
    // back into the resolver, which used to enlarge the thigh a second time.
    const doubleShaped = await resolveSavedCharacterSource(character, { ...previewSource, artwork: previewSource.artwork })
    const doubleShapedThighWidth = doubleShaped.artwork.parts.find((part) => part.id === 'thigh')!.width
    const doubleShapedRatio = thighToTorsoRatio(doubleShaped.artwork)

    // The refresh must instead pass through the original pose/model artwork.
    const refreshed = await resolveSavedCharacterSource(character, { ...previewSource, artwork: previewSource.sourceArtwork })
    const refreshedThighWidth = refreshed.artwork.parts.find((part) => part.id === 'thigh')!.width

    expect(doubleShapedThighWidth).toBeGreaterThan(previewThighWidth)
    expect(doubleShapedRatio).not.toBe(previewRatio)
    expect(refreshedThighWidth).toBe(previewThighWidth)
    expect(thighToTorsoRatio(refreshed.artwork)).toBe(previewRatio)
    expect(refreshed.artwork.parts.find((part) => part.id === 'torso')!.width)
      .toBe(previewSource.artwork.parts.find((part) => part.id === 'torso')!.width)

    const refreshImplementation = await readFile('src/renderer/src/features/editorV6/characterSnapshotRefresh.ts', 'utf8')
    expect(refreshImplementation).toContain('artwork: source.sourceArtwork')

    const oldSnapshot = {
      id: 'snapshot-yest', kind: 'character', characterId: character.id, assetId: 'old-asset', text: character.name,
      poseSlot: null, characterSourceUpdatedAt: stamp, faceRendererVersion: EDITOR_V6_FACE_RENDER_VERSION - 1
    }
    const refreshPlan = planEditorV6CharacterRefresh(
      { id: 'project', elements: [oldSnapshot], timeline: { tracks: [] } } as never,
      [character], {}
    )
    expect(refreshPlan.groups).toHaveLength(1)
  })
})

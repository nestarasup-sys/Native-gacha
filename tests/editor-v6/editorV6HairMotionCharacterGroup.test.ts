import { describe, expect, it, vi } from 'vitest'
import type { CustomizerCharacter } from '../../src/shared/customizer'
import type { HairStyle } from '../../src/shared/fabricator'
import type { EditorV6HairMotionCharacterGroupDependencies } from '../../src/renderer/src/features/editorV6/editorV6HairMotionCharacterGroup'
import { prepareEditorV6HairMotionCharacterGroup } from '../../src/renderer/src/features/editorV6/editorV6HairMotionCharacterGroup'

const character = {
  id: 'character-a', name: 'Ayla', updatedAt: 'character-rev',
  customization: { modelSlot: 1, hairAppearance: { modelSlot: 1, parts: { backHair: 'style-a', rearHair: 'style-a' } }, partOverrides: {} }
} as unknown as CustomizerCharacter
const group = { character, targets: [] } as never
const resolved = {
  modelSlot: 1, source: { slot: 1, parts: [{ id: 'head', name: 'Cabeça', width: 100, height: 150 }] },
  sourceArtwork: { parts: [] }, artwork: { parts: [{ id: 'head', x: 1, y: 2, width: 100, height: 150, rotation: 0 }] }
} as never

function dependencies(overrides: Partial<EditorV6HairMotionCharacterGroupDependencies> = {}) {
  const renderer = { dispose: vi.fn() }
  const wardrobePair = { clear: vi.fn() }
  return {
    values: {
      resolveSource: vi.fn(async () => resolved),
      loadHairStyle: vi.fn(async () => ({ id: 'style-a' }) as HairStyle),
      prepareRenderer: vi.fn(async () => renderer),
      createWardrobePair: vi.fn(() => wardrobePair),
      assetProvider: {}, materialCache: new Map(), reportStage: vi.fn(), isCancelled: () => false,
      ...overrides
    } as unknown as EditorV6HairMotionCharacterGroupDependencies,
    renderer,
    wardrobePair
  }
}

describe('preparação de grupo de personagem para movimento de cabelo', () => {
  it('resolve estilos sem duplicar leituras e prepara renderers normal e sem cabelo com recursos compartilhados', async () => {
    const deps = dependencies()

    const prepared = await prepareEditorV6HairMotionCharacterGroup('character-a:2', group, deps.values)

    expect(prepared).toMatchObject({ groupKey: 'character-a:2', character, resolved, sourceHeadPart: { id: 'head' }, targetHeadPart: { id: 'head' } })
    expect(prepared?.references).toHaveLength(2)
    expect([...prepared!.styles.keys()]).toEqual(['style-a'])
    expect(deps.values.loadHairStyle).toHaveBeenCalledTimes(1)
    expect(deps.values.loadHairStyle).toHaveBeenCalledWith(1, 'style-a')
    expect(deps.values.prepareRenderer).toHaveBeenCalledTimes(2)
    const [normalCharacter, hairlessCharacter] = deps.values.prepareRenderer.mock.calls.map(([value]) => value as CustomizerCharacter)
    expect(normalCharacter.customization.hairAppearance).toEqual(character.customization.hairAppearance)
    expect(hairlessCharacter.customization.hairAppearance).toBeUndefined()
    expect(deps.values.prepareRenderer.mock.calls[0][1]).toMatchObject({
      source: resolved.source, artwork: resolved.sourceArtwork, assetProvider: deps.values.assetProvider,
      materialCache: deps.values.materialCache, wardrobePair: deps.wardrobePair
    })
    expect(deps.values.reportStage).toHaveBeenCalledWith('resolveSavedCharacterSource', expect.any(Number))
    expect(deps.values.reportStage).toHaveBeenCalledWith('loadHairStyles', expect.any(Number))
    expect(deps.values.reportStage).toHaveBeenCalledWith('prepareCharacterRenderers', expect.any(Number))
  })

  it('não prepara renderers quando o cabelo não pertence ao modelo resolvido', async () => {
    const deps = dependencies({ resolveSource: vi.fn(async () => ({ ...resolved, modelSlot: 2 }) as never) })

    await expect(prepareEditorV6HairMotionCharacterGroup('character-a:2', group, deps.values)).resolves.toBeNull()
    expect(deps.values.prepareRenderer).not.toHaveBeenCalled()
    expect(deps.values.createWardrobePair).not.toHaveBeenCalled()
  })

  it('descarta o renderer preparado e a pintura compartilhada se o segundo renderer falhar', async () => {
    const retainedRenderer = { dispose: vi.fn() }
    const failure = new Error('renderer failed')
    const deps = dependencies({
      prepareRenderer: vi.fn().mockResolvedValueOnce(retainedRenderer).mockRejectedValueOnce(failure)
    })

    await expect(prepareEditorV6HairMotionCharacterGroup('character-a:2', group, deps.values)).rejects.toBe(failure)
    expect(retainedRenderer.dispose).toHaveBeenCalledOnce()
    expect(deps.wardrobePair.clear).toHaveBeenCalledOnce()
  })
})

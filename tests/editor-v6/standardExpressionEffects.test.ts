import { describe, expect, it, vi } from 'vitest'
import type { CharacterRenderAssetProvider } from '../../src/shared/characterRenderAssets'
import type { FaceExpressionPreset, FaceExpressionPresetSummary } from '../../src/shared/fabricator'
import { loadStandardExpressionEffects, type StandardExpressionEffectsCache } from '../../src/renderer/src/characters/standardExpressionEffects'

const summary: FaceExpressionPresetSummary = {
  id: 'expression-preset-1', modelSlot: 1, name: 'Neutra', expressionIndex: 0, updatedAt: 'revision-1'
}
const preset: FaceExpressionPreset = {
  schemaVersion: 1, id: summary.id, modelSlot: 1, name: summary.name,
  expressionIndex: 0, selections: {} as FaceExpressionPreset['selections'],
  transforms: {} as FaceExpressionPreset['transforms'], noseOpacity: 1,
  effects: {}, updatedAt: summary.updatedAt
}

function createProvider(overrides: Partial<CharacterRenderAssetProvider> = {}) {
  return {
    listFaceExpressionPresets: vi.fn(async () => [summary]),
    loadFaceExpressionPreset: vi.fn(async () => preset),
    ...overrides
  } as unknown as CharacterRenderAssetProvider
}

describe('cache de presets faciais durante preparo de cabelo do Editor V6', () => {
  it('deduplica carregamentos concorrentes para o mesmo provedor e slot', async () => {
    const provider = createProvider()
    const cache: StandardExpressionEffectsCache = new WeakMap()

    const [normal, hairless] = await Promise.all([
      loadStandardExpressionEffects(1, provider, cache),
      loadStandardExpressionEffects(1, provider, cache)
    ])

    expect(normal).toBe(hairless)
    expect(provider.listFaceExpressionPresets).toHaveBeenCalledTimes(1)
    expect(provider.loadFaceExpressionPreset).toHaveBeenCalledTimes(1)
  })

  it('isola provedores e slots dentro da mesma cache', async () => {
    const provider = createProvider()
    const otherProvider = createProvider()
    const cache: StandardExpressionEffectsCache = new WeakMap()

    await Promise.all([
      loadStandardExpressionEffects(1, provider, cache),
      loadStandardExpressionEffects(2, provider, cache),
      loadStandardExpressionEffects(1, otherProvider, cache)
    ])

    expect(provider.listFaceExpressionPresets).toHaveBeenCalledTimes(2)
    expect(otherProvider.listFaceExpressionPresets).toHaveBeenCalledTimes(1)
  })

  it('remove uma promessa rejeitada e permite nova leitura', async () => {
    const failure = new Error('falha sintética ao carregar presets')
    const listFaceExpressionPresets = vi.fn()
      .mockRejectedValueOnce(failure)
      .mockResolvedValue([summary])
    const provider = createProvider({ listFaceExpressionPresets })
    const cache: StandardExpressionEffectsCache = new WeakMap()

    await expect(loadStandardExpressionEffects(1, provider, cache)).rejects.toBe(failure)
    await expect(loadStandardExpressionEffects(1, provider, cache)).resolves.toBeDefined()

    expect(listFaceExpressionPresets).toHaveBeenCalledTimes(2)
    expect(provider.loadFaceExpressionPreset).toHaveBeenCalledTimes(1)
  })
})

import { describe, expect, it, vi } from 'vitest'
import type { CustomizerCharacter } from '../../src/shared/customizer'
import type { HairStyle } from '../../src/shared/fabricator'
import { hairAppearanceStyleIds } from '../../src/shared/hairCategories'
import { prepareEditorV6HairMotionLayers } from '../../src/renderer/src/features/editorV6/editorV6HairMotionLayers'

function style(id: string, side: 'front' | 'back'): HairStyle {
  const transform = { x: 25, y: 50, scaleX: 1, scaleY: 1, rotation: 5, flipX: true }
  return {
    id, modelSlot: 1, schemaVersion: 1, name: id,
    front: side === 'front' ? { dataUrl: `source:${id}`, width: 20, height: 30 } : null,
    back: side === 'back' ? { dataUrl: `source:${id}`, width: 20, height: 30 } : null,
    transforms: { front: transform, back: transform }, createdAt: '', updatedAt: ''
  }
}

describe('camadas de cabelo para movimento do Editor V6', () => {
  it('preserves part order while applying visibility, transform scaling, recoloring, and texture IDs', async () => {
    const character = {
      id: 'character-1', name: 'Ayla',
      customization: {
        hairAppearance: { modelSlot: 1, parts: { backHair: 'back', rearHair: 'rear', ponytail: 'tail' } },
        partOverrides: {
          'head:backHair': { hidden: true },
          'head:rearHair': { x: 5, y: -2, scaleX: 2, scaleY: 0.5, rotation: 10 }
        }
      }
    } as unknown as CustomizerCharacter
    const references = hairAppearanceStyleIds(character.customization.hairAppearance)
    const prepareTexture = vi.fn(async ({ dataUrl }: { dataUrl: string }) => `tinted:${dataUrl}`)
    const resolveColors = vi.fn(() => ({ detail: '#8C7BFF' }))
    const addTexture = vi.fn((key: string, dataUrl: string) => `${key}|${dataUrl}`)

    const layers = await prepareEditorV6HairMotionLayers({
      character,
      references,
      styles: new Map([['back', style('back', 'back')], ['rear', style('rear', 'front')], ['tail', style('tail', 'back')]]),
      sourceHead: { width: 100, height: 200 },
      targetHead: { width: 200, height: 100 },
      resolveColors, prepareTexture, addTexture
    })

    expect(layers).toHaveLength(2)
    expect(layers.map(layer => layer.id)).toEqual(['rearHair:1', 'ponytail:2'])
    expect(layers[0]).toMatchObject({
      x: -40, y: -26, scaleX: 4, scaleY: 0.25, rotation: 15, flipX: true,
      phase: 2.4, width: 20, height: 30, textureId: 'character-1:rear:front:rearHair|tinted:source:rear'
    })
    expect(layers[1]).toMatchObject({ x: -50, y: -25, phase: 2.4, flipX: true })
    expect(resolveColors).toHaveBeenCalledTimes(2)
    expect(prepareTexture).toHaveBeenCalledWith(expect.objectContaining({ modelSlot: 1, styleId: 'rear', part: 'rearHair', colors: { detail: '#8C7BFF' } }))
    expect(addTexture).toHaveBeenCalledTimes(2)
  })

  it('prepares two hair textures concurrently, bounds the queue, and registers assets in original order', async () => {
    const character = {
      id: 'character-1', name: 'Ayla',
      customization: { hairAppearance: { modelSlot: 1 }, partOverrides: {} }
    } as unknown as CustomizerCharacter
    const references = [
      { id: 'first', part: 'backHair', side: 'back' },
      { id: 'second', part: 'rearHair', side: 'front' },
      { id: 'third', part: 'ponytail', side: 'back' }
    ] as const
    const pending = new Map<string, (dataUrl: string) => void>()
    let thirdStarted!: () => void
    const thirdReady = new Promise<void>(resolve => { thirdStarted = resolve })
    let active = 0, peak = 0
    const prepareTexture = vi.fn(({ styleId }: { styleId: string }) => new Promise<string>(resolve => {
      active++
      peak = Math.max(peak, active)
      pending.set(styleId, value => { active--; resolve(value) })
      if (styleId === 'third') thirdStarted()
    }))
    const addTexture = vi.fn((key: string, dataUrl: string) => `${key}:${dataUrl}`)
    const preparing = prepareEditorV6HairMotionLayers({
      character, references,
      styles: new Map(references.map(ref => [ref.id, style(ref.id, ref.side)])),
      sourceHead: { width: 100, height: 100 }, targetHead: { width: 100, height: 100 },
      resolveColors: () => ({}), prepareTexture, addTexture
    })

    expect([...pending.keys()]).toEqual(['first', 'second'])
    expect(addTexture).not.toHaveBeenCalled()
    pending.get('second')!('done-second')
    await thirdReady
    expect([...pending.keys()]).toEqual(['first', 'second', 'third'])
    expect(peak).toBe(2)
    expect(addTexture).not.toHaveBeenCalled()
    pending.get('third')!('done-third')
    pending.get('first')!('done-first')
    const result = await preparing

    expect(result.map(layer => layer.id)).toEqual(['backHair:0', 'rearHair:1', 'ponytail:2'])
    expect(addTexture.mock.calls.map(([key]) => key)).toEqual([
      'character-1:first:back:backHair',
      'character-1:second:front:rearHair',
      'character-1:third:back:ponytail'
    ])
    expect(result.map(layer => layer.textureId.split(':').at(-1))).toEqual(['done-first', 'done-second', 'done-third'])
  })

  it('reports a missing referenced style piece with the existing user-facing error', async () => {
    const character = {
      id: 'character-1', name: 'Ayla', customization: { hairAppearance: { modelSlot: 1 }, partOverrides: {} }
    } as unknown as CustomizerCharacter
    await expect(prepareEditorV6HairMotionLayers({
      character,
      references: [{ id: 'missing', part: 'rearHair', side: 'front' }],
      styles: new Map(), sourceHead: { width: 100, height: 100 }, targetHead: { width: 100, height: 100 },
      resolveColors: () => ({}), prepareTexture: async ({ dataUrl }) => dataUrl, addTexture: key => key
    })).rejects.toThrow('Não foi possível carregar a peça rearHair do cabelo de Ayla.')
  })
})

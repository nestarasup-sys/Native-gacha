import { describe, expect, it } from 'vitest'
import type { CustomizerCharacter } from '../../src/shared/customizer'
import type { EditorV6Asset, EditorV6Element } from '../../src/shared/editorV6'
import { planEditorV6CastSelection, retainEditorV6CastAssets } from '../../src/renderer/src/features/editorV6/editorV6CastSelection'

function element(id: string, kind: EditorV6Element['kind'], assetId?: string, characterId?: string): EditorV6Element {
  return { id, kind, assetId, characterId, text: id, x: 0, y: 0, width: 20, height: 30, rotation: 0, zIndex: 0 }
}

function asset(id: string, category: EditorV6Asset['category'] = 'character'): EditorV6Asset {
  return { id, category, name: id, mimeType: 'image/png', dataUrl: `data:image/png;base64,${id}` }
}

function character(id: string): CustomizerCharacter {
  return { id } as unknown as CustomizerCharacter
}

describe('Editor V6 cast selection plan', () => {
  it('retains non-character and legacy elements, and adds only selected characters not already on stage', () => {
    const current = [
      element('actor-a', 'character', 'asset-a', 'a'),
      element('legacy-actor', 'character', 'legacy-asset'),
      element('prop', 'image', 'prop-asset'),
      element('actor-b', 'character', 'asset-b', 'b')
    ]

    const plan = planEditorV6CastSelection(current, [character('a'), character('b'), character('c')], ['a', 'c', 'missing'])

    expect(plan.retainedElements.map(({ id }) => id)).toEqual(['actor-a', 'legacy-actor', 'prop'])
    expect(plan.charactersToAdd).toEqual([character('c')])
    expect([...plan.removedCharacterAssetIds]).toEqual(['asset-b'])
    expect([...plan.retainedElementAssetIds]).toEqual(['asset-a', 'legacy-asset', 'prop-asset'])
  })

  it('removes assets owned only by removed characters but preserves shared and unrelated assets', () => {
    const plan = planEditorV6CastSelection([
      element('removed-shared', 'character', 'shared-asset', 'a'),
      element('removed-exclusive', 'character', 'exclusive-asset', 'b'),
      element('prop', 'image', 'shared-asset'),
      element('legacy-actor', 'character', 'legacy-asset')
    ], [], [])

    const retained = retainEditorV6CastAssets([
      asset('shared-asset'),
      asset('exclusive-asset'),
      asset('legacy-asset'),
      asset('unrelated-asset', 'object'),
      asset('added-while-rendering', 'object')
    ], plan)

    expect(plan.retainedElements.map(({ id }) => id)).toEqual(['prop', 'legacy-actor'])
    expect(retained.map(({ id }) => id)).toEqual(['shared-asset', 'legacy-asset', 'unrelated-asset', 'added-while-rendering'])
  })
})

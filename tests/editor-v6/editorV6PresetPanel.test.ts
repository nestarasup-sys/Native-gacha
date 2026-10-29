import { describe, expect, it } from 'vitest'
import type { FaceExpressionPresetSummary } from '../../src/shared/fabricator'
import { editorV6ExpressionPresetsForCollection } from '../../src/renderer/src/features/editorV6/EditorV6PresetPanel'

const preset = (id: string, collectionId: string, expressionIndex: number | undefined): FaceExpressionPresetSummary => ({
  id,
  modelSlot: 1,
  name: id,
  updatedAt: '2026-10-29T12:00:00.000Z',
  collectionId,
  expressionIndex
})

describe('Editor V6 preset panel selectors', () => {
  it('filters presets by collection and sorts them without mutating the source list', () => {
    const source = [preset('three', 'standard', 2), preset('other', 'custom', 0), preset('one', 'standard', 0), preset('invalid', 'standard', undefined), preset('two', 'standard', 1)]

    expect(editorV6ExpressionPresetsForCollection(source, 'standard').map((item) => item.id)).toEqual(['one', 'two', 'three'])
    expect(source.map((item) => item.id)).toEqual(['three', 'other', 'one', 'invalid', 'two'])
  })
})

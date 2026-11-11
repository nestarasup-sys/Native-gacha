import { describe, expect, it } from 'vitest'
import { getEditorV6InspectorSide } from '../../src/renderer/src/features/editorV6/editorV6InspectorPlacement'

describe('getEditorV6InspectorSide', () => {
  it('moves the inspector left when the selection reaches the right edge', () => {
    expect(getEditorV6InspectorSide({ left: 75, right: 105 }, 28)).toBe('left')
  })

  it('keeps the inspector right for selections away from both edges', () => {
    expect(getEditorV6InspectorSide({ left: 30, right: 70 }, 28)).toBe('right')
  })

  it('keeps the inspector right when the selection reaches the left edge', () => {
    expect(getEditorV6InspectorSide({ left: 5, right: 30 }, 28)).toBe('right')
  })

  it('keeps the default side with no selected bounds', () => {
    expect(getEditorV6InspectorSide(null, 28)).toBe('right')
  })
})

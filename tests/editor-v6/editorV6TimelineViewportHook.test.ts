import { describe, expect, it } from 'vitest'
import { readEditorV6TimelineViewport } from '../../src/renderer/src/features/editorV6/useEditorV6TimelineViewport'

describe('medição do viewport da timeline do Editor V6', () => {
  it('mapeia scroll e largura do elemento para o estado da timeline', () => {
    expect(readEditorV6TimelineViewport({ scrollLeft: 245, clientWidth: 960 })).toEqual({ left: 245, width: 960 })
  })
})

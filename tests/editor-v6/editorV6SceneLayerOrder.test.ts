import { describe, expect, it } from 'vitest'
import type { EditorV6SceneElement } from '../../src/shared/editorV6'
import { editorV6ElementsWithBalloonsOnTop } from '../../src/renderer/src/features/editorV6/editorV6SceneLayerOrder'

const element = (id: string, kind: EditorV6SceneElement['kind']): EditorV6SceneElement => ({
  id, kind, text: id, x: 0, y: 0, width: 20, height: 20, rotation: 0, zIndex: 0
})

describe('ordem das camadas do Editor V6', () => {
  it('mantém fala e pensamento acima de personagens e objetos em qualquer ordem de entrada', () => {
    const input = [
      element('speech-back', 'speech'),
      element('object', 'image'),
      element('thought-back', 'thought'),
      element('character', 'character'),
      element('speech-front', 'speech')
    ]

    expect(editorV6ElementsWithBalloonsOnTop(input).map((item) => item.id)).toEqual([
      'object', 'character', 'speech-back', 'thought-back', 'speech-front'
    ])
  })
})

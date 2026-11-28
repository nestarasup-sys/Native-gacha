import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { EditorV6SceneElement } from '../../src/shared/editorV6'
import { SceneTextContent } from '../../src/renderer/src/features/editorV6/SceneTextContent'

function markup(overrides: Partial<EditorV6SceneElement> = {}) {
  const element: EditorV6SceneElement = {
    id: 'line-1', kind: 'speech', text: 'Hello scene', x: 0, y: 0, width: 30, height: 20, rotation: 0, zIndex: 0,
    ...overrides
  }
  return renderToStaticMarkup(createElement('svg', null, createElement(SceneTextContent, { element, width: 300, height: 200 })))
}

describe('conteúdo vetorial da cena', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('separa forma e conteúdo e usa o nome do personagem como título tipográfico', () => {
    vi.stubGlobal('document', undefined)
    const html = markup({ speakerName: 'A very long speaker name that does not fit in the title area', speakerColor: '#123456', text: 'Hello scene' })
    expect(html).toContain('data-balloon-shape="true"')
    expect(html).toContain('data-balloon-content="true"')
    expect(html).toContain('data-balloon-speaker="true"')
    expect(html).toContain('font-family="Georgia, serif"')
    expect(html).toContain('stroke="#123456"')
    expect(html).toContain('clipPath id="v6-text-line-1"')
    expect(html).toContain('…')
    expect(html).toContain('Hello scene')
  })

  it('desenha pensamento como oval de contorno único com bolinhas e mantém narrador sem nome', () => {
    vi.stubGlobal('document', undefined)
    const thought = markup({ kind: 'thought', text: 'Thinking' })
    expect(thought.match(/<path\b/g)).toHaveLength(1)
    expect(thought.match(/<circle\b/g)).toHaveLength(3)
    expect(thought).toContain('data-balloon-shape="true"')

    const narrator = markup({ kind: 'narrator', text: 'Narration', speakerName: 'ignored speaker' })
    expect(narrator).toContain('<rect')
    expect(narrator).not.toContain('data-balloon-speaker')
    expect(narrator).not.toContain('ignored speaker')
    expect(narrator).toContain('Narration')
  })

  it('recorta o texto dentro da área segura quando a cauda aponta para cada direção', () => {
    vi.stubGlobal('document', undefined)
    for (const [speakerAnchorX, speakerAnchorY] of [[0, -100], [100, 0], [0, 100], [-100, 0]]) {
      const html = markup({ speakerAnchorX, speakerAnchorY, text: 'A long message that must stay inside the speech balloon.' })
      expect(html).toContain('data-balloon-content="true"')
      expect(html).toContain('<clipPath id="v6-text-line-1"><rect')
      expect(html).not.toMatch(/NaN|Infinity/)
    }
  })

  it('mantém a fonte calculada para cada painel de fala bilíngue compactada', () => {
    vi.stubGlobal('document', undefined)
    const html = markup({
      text: 'Paciência, Laura... talvez isso seja interessante.',
      englishText: 'Patience, Laura... This might be interesting.',
      balloonAutoFitEnglishFontSize: 18,
      balloonAutoFitPortugueseFontSize: 16
    })

    expect(html).toContain('font-size="18"')
    expect(html).toContain('font-size="16"')
    expect(html).toContain('Patience, Laura... This')
    expect(html).toContain('might be interesting.')
    expect(html).toContain('Paciência, Laura... talvez')
    expect(html).toContain('isso seja interessante.')
  })
})

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

describe('conteúdo de texto vetorial da cena', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('renders speech balloon geometry, speaker label, clip path and wrapped text', () => {
    vi.stubGlobal('document', undefined)
    const html = markup({ speakerName: 'A very long speaker name', speakerColor: '#123456', text: 'Hello scene' })
    expect(html).toContain('<path d=')
    expect(html).toContain('stroke="#123456"')
    expect(html).toContain('clipPath id="v6-text-line-1"')
    expect(html).toContain('A very long …')
    expect(html).toContain('Hello scene')
  })

  it('renders thought outline and sketch while narrator text uses its simple rectangle', () => {
    vi.stubGlobal('document', undefined)
    const thought = markup({ kind: 'thought', text: 'Thinking' })
    expect(thought.match(/<path\b/g)).toHaveLength(2)
    expect(thought).toContain('opacity="0.9"')

    const narrator = markup({ kind: 'narrator', text: 'Narration', speakerName: 'ignored speaker' })
    expect(narrator).toContain('<rect')
    expect(narrator).not.toContain('ignored speaker')
    expect(narrator).toContain('Narration')
  })
})

import { createElement, type ComponentProps } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { EditorV6Inspector } from '../../src/renderer/src/features/editorV6/EditorV6Inspector'

function renderInspector(overrides: Partial<ComponentProps<typeof EditorV6Inspector>> = {}) {
  return renderToStaticMarkup(createElement(EditorV6Inspector, {
    side: 'right',
    tab: 'editor',
    customView: 'face',
    editorPanel: createElement('div', null, 'Painel do editor'),
    facePanel: createElement('div', null, 'Painel de aparência'),
    presetsPanel: createElement('div', null, 'Painel de presets'),
    onSelectEditor: vi.fn(),
    onSelectCustom: vi.fn(),
    onSelectPresets: vi.fn(),
    onClose: vi.fn(),
    ...overrides
  }))
}

describe('inspector do Editor V6', () => {
  it('preserva o lado escolhido e mostra o painel da aba Editor', () => {
    const html = renderInspector({ side: 'left' })

    expect(html).toContain('studio-inspector-left')
    expect(html).toContain('Painel do editor')
    expect(html).not.toContain('Painel de aparência')
    expect(html).toContain('class="active" type="button">Editor</button>')
  })

  it('mostra aparência ou presets segundo a subaba selecionada', () => {
    const face = renderInspector({ tab: 'custom', customView: 'face' })
    expect(face).toContain('Painel de aparência')
    expect(face).toContain('class="active" type="button">Custom</button>')
    expect(face).not.toContain('class="studio-inspector-presets active"')

    const presets = renderInspector({ tab: 'custom', customView: 'presets' })
    expect(presets).toContain('Painel de presets')
    expect(presets).toContain('class="studio-inspector-presets active"')
    expect(presets).not.toContain('Painel de aparência')
  })

  it('mantém os controles de fechamento e as três opções do inspector', () => {
    const html = renderInspector()

    expect(html).toContain('aria-label="Inspector da cena"')
    expect(html).toContain('aria-label="Fechar inspector"')
    expect(html).toContain('>Editor</button>')
    expect(html).toContain('>Custom</button>')
    expect(html).toContain('>Presets</button>')
  })
})

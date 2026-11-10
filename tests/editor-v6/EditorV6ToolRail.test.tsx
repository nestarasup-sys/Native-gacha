import { createElement, type ComponentProps } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { EditorV6ToolRail } from '../../src/renderer/src/features/editorV6/EditorV6ToolRail'

function renderRail(overrides: Partial<ComponentProps<typeof EditorV6ToolRail>> = {}) {
  return renderToStaticMarkup(createElement(EditorV6ToolRail, {
    visible: true,
    activeTool: 'background',
    canUndo: true,
    canRedo: true,
    saved: true,
    faceAssetRefreshRequired: false,
    characterSourceRefreshRequired: false,
    selectedCharacterLabel: null,
    error: null,
    notice: null,
    onBack: vi.fn(),
    onSave: vi.fn(),
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    onSelectTool: vi.fn(),
    onAddText: vi.fn(),
    onImportTimelineMedia: vi.fn(),
    onExport: vi.fn(),
    onPrint: vi.fn(),
    onOpenPrints: vi.fn(),
    onEnterFullView: vi.fn(),
    ...overrides
  }))
}

describe('barra lateral de ferramentas do Editor V6', () => {
  it('some na visualização cheia', () => {
    expect(renderRail({ visible: false })).toBe('')
  })

  it('mantém ações de projeto, ferramentas, avisos e item ativo', () => {
    const html = renderRail({
      saved: false,
      faceAssetRefreshRequired: true,
      characterSourceRefreshRequired: true,
      error: 'Falha sintética',
      notice: 'Aviso sintético'
    })

    expect(html).toContain('aria-label="Ferramentas do Editor V6"')
    expect(html).toContain('class="studio-tool-button active"')
    expect(html).toContain('Salvando alterações…')
    expect(html).toContain('Atualizando as aparências salvas')
    expect(html).toContain('Falha sintética')
    expect(html).toContain('Aviso sintético')
    expect(html).toContain('Atualizando personagem…')
    expect(html).toContain('Selecionar vídeo')
    expect(html).toContain('Selecionar áudio')
    expect(renderRail()).toContain('Exportar MP4')
  })

  it('exige personagem para fala/pensamento e habilita essas ações com seleção', () => {
    const empty = renderRail()
    expect(empty).toContain('Selecione um personagem na cena')
    expect(empty).toContain('disabled=""')

    const selected = renderRail({ selectedCharacterLabel: 'Nina' })
    expect(selected).toContain('Adicionar fala a Nina')
    expect(selected).toContain('Adicionar pensamento a Nina')
    expect(selected).not.toContain('disabled=""')
  })
})

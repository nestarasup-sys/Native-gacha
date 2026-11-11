import { createElement, type ComponentProps } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { EditorV6Element } from '../../src/shared/editorV6'
import { EditorV6FaceInspectorPanel } from '../../src/renderer/src/features/editorV6/EditorV6FaceInspectorPanel'

function renderFacePanel(overrides: Partial<ComponentProps<typeof EditorV6FaceInspectorPanel>> = {}) {
  const element = { id: 'actor-1', kind: 'character', faceTransforms: { 'eyes:eyes-1': { x: 12, y: -4, width: 80, height: 90, rotation: 7 } } } as unknown as EditorV6Element
  return renderToStaticMarkup(createElement(EditorV6FaceInspectorPanel, {
    modelSlot: 2,
    category: 'eyes',
    sheetKind: 'eyes',
    selectedItemId: 'eyes-1',
    items: [{ id: 'eyes-1', modelSlot: 2, category: 'eyes', name: 'Olhos azuis', updatedAt: 'now', pieceCount: 2 }],
    details: { '2:eyes-1': { pieces: [{ id: 'left', index: 0, dataUrl: 'data:image/png;base64,AA==' }, { id: 'right', index: 0, dataUrl: 'data:image/png;base64,AA==' }] } as any },
    appearance: { modelSlot: 2, eyeCatalogId: 'eyes-1', eyeState: 0, eyebrows: true, noseIndex: 0, expressionIndex: 0, mouthOpen: false },
    faceMode: 'idle',
    faceBusy: false,
    expressionBusy: false,
    catalogLoading: false,
    detailsLoading: false,
    talkAvailable: true,
    element,
    onCategoryChange: vi.fn(),
    onFaceModeChange: vi.fn(),
    onSheetSelect: vi.fn(),
    onAppearanceChange: vi.fn(),
    onUpdateTransform: vi.fn(),
    onFinishTransform: vi.fn(),
    onRecordHistory: vi.fn(),
    ...overrides
  }))
}

describe('painel facial do inspector do Editor V6', () => {
  it('exibe a folha selecionada, suas variantes e os transforms persistidos do ator', () => {
    const html = renderFacePanel()

    expect(html).toContain('Folha de olhos')
    expect(html).toContain('Olhos azuis')
    expect(html).toContain('>Direita</b>')
    expect(html).toContain('aria-label="Rotação"')
    expect(html).toContain('value="12"')
    expect(html).toContain('value="-4"')
    expect(html).toContain('value="80"')
    expect(html).toContain('value="90"')
    expect(html).toContain('value="7"')
  })

  it('mantém controles desabilitados durante a atualização facial e mostra carregamento de catálogo', () => {
    const html = renderFacePanel({ faceBusy: true, catalogLoading: true, detailsLoading: true })

    expect(html).toContain('Carregando catálogo facial…')
    expect(html).toContain('Carregando imagens da folha facial selecionada…')
    expect(html).toContain('Atualizando personagem…')
    expect(html).toContain('disabled=""')
  })
})

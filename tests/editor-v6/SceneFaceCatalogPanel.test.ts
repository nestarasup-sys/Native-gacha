import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { SceneFaceCatalogPanel } from '../../src/renderer/src/characters/SceneFaceCatalogPanel'
import type { FaceCatalogItem } from '../../src/shared/fabricator'

const piece = (id: string, index: number) => ({
  id, sheet: 'eyes' as const, index, crop: { x: 0, y: 0, width: 1, height: 1 },
  width: 1, height: 1, dataUrl: `data:image/png;base64,${id}`
})

describe('painel compartilhado de folhas faciais', () => {
  it('mantém as três variantes e marca olhos fechados quando o modo é blink', () => {
    const html = renderToStaticMarkup(createElement(SceneFaceCatalogPanel, {
      category: 'eyes', sheetKind: 'eyes', selectedItemId: 'eyes-main',
      catalogItems: [{ id: 'eyes-main', modelSlot: 1, category: 'eyes', name: 'Olhos', pieceCount: 3, updatedAt: 'now' }],
      activeItem: {
        schemaVersion: 1, id: 'eyes-main', modelSlot: 1, category: 'eyes', name: 'Olhos',
        sheet: {} as never, pieces: [piece('open-right', 0), piece('open-left', 0), piece('closed-right', 2)],
        transforms: {}, eyeLinked: false, browLinked: false, selectedNose: 0, selectedExpression: 0, updatedAt: 'now'
      } as FaceCatalogItem,
      appearance: { modelSlot: 1, eyeState: 0, eyebrows: true, noseIndex: 0, expressionIndex: 0, mouthOpen: false },
      faceMode: 'blink', faceBusy: false, expressionBusy: false, catalogLoading: false,
      talkAvailable: false, emptyEyesMessage: 'Escolha uma folha.',
      onCategoryChange: () => {}, onFaceModeChange: () => {}, onSheetSelect: () => {}, onAppearanceChange: () => {}
    }))

    expect(html).toContain('aria-label="Categorias do rosto"')
    expect(html).toContain('>Olhos</button>')
    expect(html).toContain('>Direita</b>')
    expect(html).toContain('>Esquerda</b>')
    expect(html).toContain('class="selected"')
    expect(html).toContain('>Fechados</b>')
  })
})

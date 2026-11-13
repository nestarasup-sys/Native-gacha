import { describe, expect, it } from 'vitest'
import {
  isEditorV6FaceCatalogRequestCurrent,
  shouldLoadEditorV6FaceCatalog,
  shouldLoadEditorV6PresetCatalog
} from '../../src/renderer/src/features/editorV6/editorV6FaceCatalogModel'

describe('ativação do catálogo facial do Editor V6', () => {
  it('carrega folhas somente com o Inspector aberto em uma vista personalizada', () => {
    expect(shouldLoadEditorV6FaceCatalog(false, 'custom')).toBe(false)
    expect(shouldLoadEditorV6FaceCatalog(true, 'editor')).toBe(false)
    expect(shouldLoadEditorV6FaceCatalog(true, 'custom')).toBe(true)
  })

  it('renderiza poses e consulta expressões somente na vista de Presets', () => {
    expect(shouldLoadEditorV6PresetCatalog(false, 'custom', 'presets')).toBe(false)
    expect(shouldLoadEditorV6PresetCatalog(true, 'editor', 'presets')).toBe(false)
    expect(shouldLoadEditorV6PresetCatalog(true, 'custom', 'face')).toBe(false)
    expect(shouldLoadEditorV6PresetCatalog(true, 'custom', 'presets')).toBe(true)
  })

  it('descarta respostas faciais que chegam depois da troca de modelo ou da saída do projeto', () => {
    expect(isEditorV6FaceCatalogRequestCurrent(4, 4)).toBe(true)
    expect(isEditorV6FaceCatalogRequestCurrent(4, 5)).toBe(false)
    expect(isEditorV6FaceCatalogRequestCurrent(4, null)).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import { shouldLoadEditorV6FaceCatalog } from '../../src/renderer/src/features/editorV6/editorV6FaceCatalogModel'

describe('ativação do catálogo facial do Editor V6', () => {
  it('carrega folhas somente com o Inspector aberto em uma vista personalizada', () => {
    expect(shouldLoadEditorV6FaceCatalog(false, 'custom')).toBe(false)
    expect(shouldLoadEditorV6FaceCatalog(true, 'editor')).toBe(false)
    expect(shouldLoadEditorV6FaceCatalog(true, 'custom')).toBe(true)
  })
})

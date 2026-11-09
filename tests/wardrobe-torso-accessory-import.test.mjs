import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createWardrobeComponentsFromProcessedSheet } from '../src/renderer/src/features/fabricator/wardrobe/wardrobeSheetImport.ts'

test('importação dedicada cria componentes na categoria cinto e sugere o osso do quadril', () => {
  const model = {
    width: 1000,
    height: 1000,
    parts: [{ id: 'hip', name: 'quadril', x: 400, y: 450, width: 200, height: 100, rotation: 0, dataUrl: 'data:image/png;base64,AA==' }]
  }
  const components = createWardrobeComponentsFromProcessedSheet([
    { id: 'piece-1', name: 'Recorte 1', x: 20, y: 30, width: 24, height: 10, png: new Uint8Array([1, 2, 3]).buffer },
    { id: 'piece-2', name: 'Recorte 2', x: 70, y: 30, width: 24, height: 10, png: new Uint8Array([4, 5, 6]).buffer }
  ], 120, 70, model, 'cinto')

  assert.equal(components.length, 2)
  for (const component of components) {
    assert.equal(component.category, 'cinto')
    assert.equal(component.name, 'Cinto e acessório')
    assert.equal(component.attachedPartId, 'hip')
  }
})

test('Roupas Dev oferece o importador e o Customizador conecta a categoria ao cartão Acessórios', async () => {
  const [fabricator, customizer, catalogWorkspace, navigation] = await Promise.all([
    readFile('src/renderer/src/features/fabricator/wardrobe/WardrobeWorkspace.tsx', 'utf8'),
    readFile('src/renderer/src/features/customizer/CustomizerPage.tsx', 'utf8'),
    readFile('src/renderer/src/features/customizer/CustomizerWardrobeCatalogWorkspace.tsx', 'utf8'),
    readFile('src/renderer/src/features/customizer/customizerNavigation.tsx', 'utf8')
  ])

  assert.match(fabricator, /Acessórios de tronco · Cinto e acessório/)
  assert.match(fabricator, /importSheet\(event\.target\.files\?\.\[0\], 'cinto'\)/)
  assert.match(customizer, /clothesPanelTab === 'accessories' \|\| clothesPanelTab === 'upper' \|\| clothesPanelTab === 'lower'.*CustomizerWardrobeCatalogWorkspace/s)
  assert.match(catalogWorkspace, /torso-accessory-only/)
  assert.match(navigation, /if \(tab === 'accessories'\) return clothingCategories\.Superior\.filter\(\(item\) => item\.id === 'cinto'\)/)
})

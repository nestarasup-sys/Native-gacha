import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  resolveAdjustedCustomizerClothingSelection,
  resolveDefaultCustomizerClothingSelection
} from '../src/renderer/src/features/customizer/customizerClothingSelectionModel.ts'

const categoryDefinitions = [{ id: 'camisa', source: ['camisa'] }]
const group = (overrides = {}) => ({
  modelSlot: 1,
  setId: 'set-1',
  category: 'camisa',
  componentId: 'shirt-1',
  offsetX: 0,
  offsetY: 0,
  scaleX: 1,
  scaleY: 1,
  rotation: 0,
  ...overrides
})
const component = (id, category = 'camisa') => ({ id, category })
const details = (components) => ({ '1:set-1': { components } })

test('seleção padrão respeita o componente persistido do primeiro grupo', () => {
  assert.deepEqual(resolveDefaultCustomizerClothingSelection({
    hasCharacter: true,
    activeModule: 'Roupas',
    clothesPanelTab: 'upper',
    selectedClothing: null,
    wardrobeGroups: [group()],
    wardrobeDetails: details([component('shirt-1'), component('shirt-2')]),
    categoryDefinitions
  }), { modelSlot: 1, setId: 'set-1', category: 'camisa', componentId: 'shirt-1' })
})

test('seleção padrão encontra componente de grupo legado pela categoria da peça', () => {
  assert.deepEqual(resolveDefaultCustomizerClothingSelection({
    hasCharacter: true,
    activeModule: 'Roupas',
    clothesPanelTab: 'upper',
    selectedClothing: null,
    wardrobeGroups: [group({ componentId: undefined })],
    wardrobeDetails: details([component('other', 'jaqueta'), component('legacy-shirt')]),
    categoryDefinitions
  }), { modelSlot: 1, setId: 'set-1', category: 'camisa', componentId: 'legacy-shirt' })
})

test('seleção padrão não apaga seleção atual e não disputa a seleção da aba Ajustar', () => {
  const input = {
    hasCharacter: true,
    activeModule: 'Roupas',
    clothesPanelTab: 'upper',
    selectedClothing: { modelSlot: 1, setId: 'set-1', category: 'camisa', componentId: 'shirt-2' },
    wardrobeGroups: [group()],
    wardrobeDetails: details([component('shirt-1')]),
    categoryDefinitions
  }

  assert.equal(resolveDefaultCustomizerClothingSelection(input), undefined)
  assert.equal(resolveDefaultCustomizerClothingSelection({ ...input, selectedClothing: null, clothesPanelTab: 'adjust' }), undefined)
  assert.equal(resolveDefaultCustomizerClothingSelection({ ...input, hasCharacter: false, selectedClothing: null }), undefined)
})

test('seleção Ajustar limita grupos à categoria e mantém seleção válida', () => {
  const groups = [group({ category: 'jaqueta', componentId: 'jacket-1' }), group()]
  const input = {
    hasCharacter: true,
    isAdjustmentView: true,
    wardrobeGroups: groups,
    selectedClothing: null,
    wardrobeDetails: details([component('shirt-1')]),
    categoryDefinitions
  }

  assert.deepEqual(resolveAdjustedCustomizerClothingSelection(input), {
    modelSlot: 1, setId: 'set-1', category: 'camisa', componentId: 'shirt-1'
  })
  assert.equal(resolveAdjustedCustomizerClothingSelection({
    ...input,
    selectedClothing: { modelSlot: 1, setId: 'set-1', category: 'camisa', componentId: 'shirt-1' }
  }), undefined)
  assert.equal(resolveAdjustedCustomizerClothingSelection({ ...input, isAdjustmentView: false }), undefined)
})

test('seleção Ajustar limpa categoria vazia e hidrata grupo legado pelo componente', () => {
  const emptyResult = resolveAdjustedCustomizerClothingSelection({
    hasCharacter: true,
    isAdjustmentView: true,
    wardrobeGroups: [group({ category: 'jaqueta' })],
    selectedClothing: null,
    wardrobeDetails: {},
    categoryDefinitions
  })
  assert.equal(emptyResult, null)

  const legacy = group({ componentId: undefined })
  assert.deepEqual(resolveAdjustedCustomizerClothingSelection({
    hasCharacter: true,
    isAdjustmentView: true,
    wardrobeGroups: [legacy],
    selectedClothing: null,
    wardrobeDetails: details([component('legacy-shirt')]),
    categoryDefinitions
  }), { modelSlot: 1, setId: 'set-1', category: 'camisa', componentId: 'legacy-shirt' })
})

test('seleção Ajustar mantém ID explícito mesmo antes de carregar seu conjunto', () => {
  assert.deepEqual(resolveAdjustedCustomizerClothingSelection({
    hasCharacter: true,
    isAdjustmentView: true,
    wardrobeGroups: [group()],
    selectedClothing: null,
    wardrobeDetails: {},
    categoryDefinitions
  }), { modelSlot: 1, setId: 'set-1', category: 'camisa', componentId: 'shirt-1' })
})

test('CustomizerPage delega sincronização da peça ao hook da feature', async () => {
  const [page, hook] = await Promise.all([
    readFile(new URL('../src/renderer/src/features/customizer/CustomizerPage.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/renderer/src/features/customizer/useCustomizerClothingSelection.ts', import.meta.url), 'utf8')
  ])

  assert.match(page, /useCustomizerClothingSelection\(/)
  assert.doesNotMatch(page, /currentSelectionStillInScope|firstDefinition =/)
  assert.match(hook, /resolveDefaultCustomizerClothingSelection/)
  assert.match(hook, /resolveAdjustedCustomizerClothingSelection/)
})

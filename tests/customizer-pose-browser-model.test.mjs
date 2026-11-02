import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  adjacentCustomizerPoseCategory,
  adjacentCustomizerPosePage,
  buildCustomizerPoseBrowserModel
} from '../src/renderer/src/features/customizer/customizerPoseBrowserModel.ts'

const pose = (slot, category, sourceModelSlot = 1) => ({
  slot,
  sourceModelSlot,
  name: `Pose ${slot}`,
  category,
  sourceModelName: `Modelo ${sourceModelSlot}`,
  partCount: 12,
  updatedAt: '2026-01-01T00:00:00.000Z'
})

const model = (slot, recoveryRequired = false) => ({
  slot,
  name: `Modelo ${slot}`,
  sourceName: 'base.png',
  partCount: 12,
  updatedAt: '2026-01-01T00:00:00.000Z',
  recoveryRequired
})

test('filtra poses do modelo e slots em recuperação e ordena pela posição', () => {
  const result = buildCustomizerPoseBrowserModel({
    catalogModels: [model(1), model(2, true)],
    catalogPoses: [pose(4, 'Deitado'), pose(1, 'Parado'), null, pose(2, 'Sentado'), pose(1, 'Omitir', 2)],
    selectedModelSlot: 1,
    selectedCategory: 'Deitado',
    selectedPage: 0
  })

  assert.deepEqual(result.availablePoses.map((item) => item.slot), [1, 2, 4])
  assert.deepEqual(result.categories, ['Parado', 'Sentado', 'Deitado'])
  assert.deepEqual(result.visiblePoses.map((item) => item.slot), [4])
})

test('mantém categorias fixas primeiro e inclui uma única ocorrência de categorias extras', () => {
  const result = buildCustomizerPoseBrowserModel({
    catalogModels: [model(1)],
    catalogPoses: [pose(5, 'Parado'), pose(4, 'Parado'), pose(3, 'Sentado'), pose(2, 'Outro'), pose(1, 'Outro')],
    selectedModelSlot: 1,
    selectedCategory: 'Parado',
    selectedPage: 0
  })

  assert.deepEqual(result.categories, ['Parado', 'Sentado', 'Outro'])
})

test('paginação exibe cinco poses e limita a página ao último grupo disponível', () => {
  const poses = Array.from({ length: 12 }, (_, index) => pose(index + 1, 'Em pé'))
  const first = buildCustomizerPoseBrowserModel({ catalogModels: [model(1)], catalogPoses: poses, selectedModelSlot: 1, selectedCategory: 'Em pé', selectedPage: 0 })
  const last = buildCustomizerPoseBrowserModel({ catalogModels: [model(1)], catalogPoses: poses, selectedModelSlot: 1, selectedCategory: 'Em pé', selectedPage: 99 })

  assert.equal(first.pageCount, 3)
  assert.deepEqual(first.visiblePoses.map((item) => item.slot), [1, 2, 3, 4, 5])
  assert.equal(last.activePage, 2)
  assert.deepEqual(last.visiblePoses.map((item) => item.slot), [11, 12])
})

test('categoria sem poses mantém uma página vazia sem remover as categorias base', () => {
  const result = buildCustomizerPoseBrowserModel({
    catalogModels: [model(1)],
    catalogPoses: [],
    selectedModelSlot: 1,
    selectedCategory: 'Parado',
    selectedPage: 7
  })

  assert.deepEqual(result.categories, ['Parado', 'Sentado'])
  assert.equal(result.pageCount, 1)
  assert.equal(result.activePage, 0)
  assert.deepEqual(result.visiblePoses, [])
})

test('navegação de categorias dá a volta e páginas ficam dentro dos limites', () => {
  const categories = ['Parado', 'Sentado', 'Em pé']

  assert.equal(adjacentCustomizerPoseCategory(categories, 'Parado', -1), 'Em pé')
  assert.equal(adjacentCustomizerPoseCategory(categories, 'Em pé', 1), 'Parado')
  assert.equal(adjacentCustomizerPosePage(0, 3, -1), 0)
  assert.equal(adjacentCustomizerPosePage(1, 3, 1), 2)
  assert.equal(adjacentCustomizerPosePage(2, 3, 1), 2)
})

test('CustomizerPage delega a projeção do catálogo e as mudanças de página ao modelo puro', async () => {
  const page = await readFile(new URL('../src/renderer/src/features/customizer/CustomizerPage.tsx', import.meta.url), 'utf8')

  assert.match(page, /buildCustomizerPoseBrowserModel\(/)
  assert.match(page, /adjacentCustomizerPoseCategory\(poseCategories, selectedPoseCategory, direction\)/)
  assert.match(page, /adjacentCustomizerPosePage\(current, posePageCount, direction\)/)
  assert.doesNotMatch(page, /catalogPoses\.filter\(\(pose\): pose is NonNullable/)
})

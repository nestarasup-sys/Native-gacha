import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  HAIR_WORKSPACE_CATALOG_PAGE_SIZE,
  getHairWorkspaceCatalogPage,
  hairStyleDetailMatchesSummary,
  hairStyleSummary,
  loadHairWorkspaceCatalogPage,
  retainHairWorkspaceStyleDetails
} from '../src/renderer/src/features/fabricator/hairWorkspaceCatalog.ts'

const summary = (id, updatedAt = '2026-10-29T00:00:00.000Z') => ({
  schemaVersion: 1,
  id,
  modelSlot: 1,
  name: id,
  front: { width: 20, height: 30 },
  back: null,
  fringe: null,
  transforms: { front: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 }, back: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 } },
  createdAt: updatedAt,
  updatedAt
})

test('página do catálogo mantém ordem, tamanho e limites', () => {
  const summaries = Array.from({ length: 29 }, (_, index) => summary(`hair-${index}`))
  const page = getHairWorkspaceCatalogPage(summaries, 1)
  assert.equal(HAIR_WORKSPACE_CATALOG_PAGE_SIZE, 12)
  assert.equal(page.pageCount, 3)
  assert.equal(page.page, 1)
  assert.deepEqual(page.visibleStyles.map((item) => item.id), Array.from({ length: 12 }, (_, index) => `hair-${index + 12}`))
  assert.equal(getHairWorkspaceCatalogPage(summaries, 99).page, 2)
  assert.equal(getHairWorkspaceCatalogPage([], 4).pageCount, 1)
  assert.deepEqual(getHairWorkspaceCatalogPage([], 4).visibleStyles, [])
})

test('carrega apenas os detalhes ausentes da página e mantém concorrência limitada', async () => {
  const visible = Array.from({ length: 12 }, (_, index) => summary(`hair-${index}`))
  const loaded = []
  let active = 0
  let maximumActive = 0
  const details = await loadHairWorkspaceCatalogPage(
    visible,
    () => false,
    (item) => item.id === 'hair-3',
    async (id) => {
      loaded.push(id)
      active += 1
      maximumActive = Math.max(maximumActive, active)
      await new Promise((resolve) => setTimeout(resolve, 1))
      active -= 1
      return id === 'hair-7' ? null : { ...summary(id), front: { ...summary(id).front, dataUrl: `data:${id}` } }
    }
  )

  assert.equal(maximumActive, 3)
  assert.equal(loaded.length, 11)
  assert.equal(loaded.includes('hair-3'), false)
  assert.deepEqual(details.map((item) => item.id), ['hair-0', 'hair-1', 'hair-2', 'hair-4', 'hair-5', 'hair-6', 'hair-8', 'hair-9', 'hair-10', 'hair-11'])
})

test('resumo descarta todos os PNGs e a folha original da estrutura em memória', () => {
  const style = {
    ...summary('selected'),
    front: { ...summary('selected').front, dataUrl: 'data:front' },
    sourceImageSaved: true,
    sourceImageDataUrl: 'data:original'
  }
  const projected = hairStyleSummary(style)
  assert.equal(projected.front.dataUrl, undefined)
  assert.equal(projected.sourceImageDataUrl, undefined)
  assert.equal(projected.sourceImageSaved, true)
  assert.deepEqual(projected.front, { width: 20, height: 30 })
})

test('detalhe em cache só é reutilizado quando versão, peças e dimensões correspondem ao resumo', () => {
  const item = summary('hair')
  const detail = { ...item, front: { ...item.front, dataUrl: 'data:front' } }
  assert.equal(hairStyleDetailMatchesSummary(item, detail), true)
  assert.equal(hairStyleDetailMatchesSummary({ ...item, updatedAt: 'newer' }, detail), false)
  assert.equal(hairStyleDetailMatchesSummary({ ...item, front: { width: 21, height: 30 } }, detail), false)
  assert.equal(hairStyleDetailMatchesSummary(item, { ...detail, front: { ...detail.front, dataUrl: '' } }), false)
})

test('cache conserva a página visível e o conjunto ativo, removendo outros slots e páginas', () => {
  const details = {
    '1:active': { id: 'active' },
    '1:page-1': { id: 'page-1' },
    '1:old-page': { id: 'old-page' },
    '2:other-model': { id: 'other-model' }
  }
  assert.deepEqual(retainHairWorkspaceStyleDetails(details, 1, new Set(['active', 'page-1'])), {
    '1:active': { id: 'active' },
    '1:page-1': { id: 'page-1' }
  })
})

test('Cabelos Dev carrega a página sem folha original e só busca source ao abrir um conjunto', async () => {
  const [workspace, catalog] = await Promise.all([
    readFile('src/renderer/src/features/fabricator/HairWorkspace.tsx', 'utf8'),
    readFile('src/renderer/src/features/fabricator/hairWorkspaceCatalog.ts', 'utf8')
  ])
  assert.match(workspace, /listHairStyles\(modelSlot\)/)
  assert.match(workspace, /loadHairWorkspaceCatalogPage\(/)
  assert.match(workspace, /loadHairStyle\(modelSlot, id\)/)
  assert.match(workspace, /loadHairStyle\(requestedModelSlot, summary\.id, includeSource\)/)
  assert.match(workspace, /const includeSource = Boolean\(summary\.sourceImageSaved\)/)
  assert.match(workspace, /hairStyleDetailMatchesSummary\(summary, cached\)/)
  assert.match(workspace, /hairCatalogPageView\.visibleStyles\.map/)
  assert.doesNotMatch(workspace, /Promise\.all\(summaries\.map\(\(summary\) => window\.desktop\.fabricator\.loadHairStyle/)
  assert.match(catalog, /concurrency = 3/)
  assert.match(catalog, /HAIR_WORKSPACE_CATALOG_PAGE_SIZE = 12/)
})

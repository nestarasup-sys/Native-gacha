import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { studioFaceCatalogSelectionIds } from '../src/renderer/src/features/studio/studioFaceCatalogSelection.ts'
import { mergeStudioFaceDetails, STUDIO_FACE_DETAIL_CACHE_CAPACITY } from '../src/renderer/src/features/studio/studioFaceDetailCache.ts'

const appearance = (patch = {}) => ({
  modelSlot: 1,
  eyeState: 0,
  eyebrows: true,
  noseIndex: 0,
  expressionIndex: 0,
  mouthOpen: false,
  ...patch
})

test('sem personagem selecionado não carrega folhas faciais', () => {
  assert.deepEqual(studioFaceCatalogSelectionIds(undefined, 'default-mouth'), [])
})

test('retorna somente folhas da aparência atual e remove IDs repetidos', () => {
  assert.deepEqual(studioFaceCatalogSelectionIds(appearance({
    eyeCatalogId: 'eyes',
    eyebrowCatalogId: 'brows',
    noseCatalogId: 'nose',
    mouthClosedCatalogId: 'mouth-closed',
    mouthOpenCatalogId: 'mouth-open',
    eyeLeftCatalogId: 'legacy-left-eye'
  }), 'fallback-mouth'), ['eyes', 'brows', 'nose', 'mouth-closed', 'mouth-open'])

  assert.deepEqual(studioFaceCatalogSelectionIds(appearance({
    eyeCatalogId: 'shared',
    eyebrowCatalogId: 'shared',
    mouthClosedCatalogId: 'shared'
  }), 'shared'), ['shared'])
})

test('usa a boca aberta padrão somente quando a aparência não tem uma salva', () => {
  assert.deepEqual(studioFaceCatalogSelectionIds(appearance({ mouthClosedCatalogId: 'closed' }), 'default-open'), ['closed', 'default-open'])
  assert.deepEqual(studioFaceCatalogSelectionIds(appearance({ mouthOpenCatalogId: 'saved-open' }), 'default-open'), ['saved-open'])
})

test('Studio mantém a lista de opções leve e carrega detalhes das folhas selecionadas', async () => {
  const page = await readFile('src/renderer/src/features/studio/StudioPage.tsx', 'utf8')
  assert.match(page, /setStudioFaceItems\(summaries\)/)
  assert.match(page, /studioFaceCatalogSelectionIds\(selectedStudioFaceAppearance, selectedStudioOpenMouthId\)/)
  assert.match(page, /loadFaceCatalogItem\(modelSlot, id\)/)
  assert.match(page, /mergeStudioFaceDetails/)
  assert.match(page, /studioFaceDetailsModelSlotRef\.current === modelSlot/)
  assert.match(page, /detailsLoading=\{studioFaceDetailsLoading\}/)
  assert.doesNotMatch(page, /mapConcurrentItems\(\s*summaries/)
  assert.doesNotMatch(page, /Promise\.all\(summaries\.map\(async \(summary\).*loadFaceCatalogItem/)
})

test('cache facial mantém as folhas ativas e expulsa os detalhes mais antigos após 12 itens', () => {
  const current = Object.fromEntries(Array.from({ length: STUDIO_FACE_DETAIL_CACHE_CAPACITY }, (_, index) => [`sheet-${index}`, { id: `sheet-${index}` }]))
  const next = mergeStudioFaceDetails(current, { 'sheet-new': { id: 'sheet-new' } }, ['sheet-0'])

  assert.equal(Object.keys(next).length, STUDIO_FACE_DETAIL_CACHE_CAPACITY)
  assert.ok(next['sheet-0'])
  assert.ok(next['sheet-new'])
  assert.equal(next['sheet-1'], undefined)
  assert.ok(current['sheet-1'])
})

test('reutilizar detalhe renova sua ordem de remoção', () => {
  const current = Object.fromEntries(Array.from({ length: STUDIO_FACE_DETAIL_CACHE_CAPACITY }, (_, index) => [`sheet-${index}`, { id: `sheet-${index}` }]))
  const next = mergeStudioFaceDetails(current, { 'sheet-0': current['sheet-0'], 'sheet-new': { id: 'sheet-new' } }, [])

  assert.ok(next['sheet-0'])
  assert.ok(next['sheet-new'])
  assert.equal(next['sheet-1'], undefined)
  assert.equal(Object.keys(next).length, STUDIO_FACE_DETAIL_CACHE_CAPACITY)
})

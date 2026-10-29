import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { loadCustomizerWardrobeCatalog } from '../src/renderer/src/features/customizer/customizerWardrobeCatalog.ts'
import { getCustomizerHairLibraryPage, loadCustomizerHairDetails, loadCustomizerHairLibraryPageDetails, retainCustomizerHairDetailsForModel } from '../src/renderer/src/features/customizer/customizerHairCatalog.ts'
import {
  upperWardrobePanels,
  upperWardrobePageTwoPanels,
  accessoryWardrobePanels,
  lowerWardrobePanels,
  lowerWardrobePageTwoPanels,
  createWardrobePanelCandidateIndex,
  wardrobePanelCandidates
} from '../src/renderer/src/features/customizer/wardrobePanelModel.ts'

const summary = (id) => ({ id, modelSlot: 1, modelName: 'Modelo', name: id, updatedAt: '2026-10-29T00:00:00.000Z', edition: 2, componentCount: 1 })
const set = (id, category) => ({
  id,
  modelSlot: 1,
  modelName: 'Modelo',
  name: id,
  width: 10,
  height: 10,
  components: [{ id: `${id}-component`, name: id, category, attachedPartId: 'body', x: 0, y: 0, width: 10, height: 10, rotation: 0, dataUrl: 'data:image/png;base64,AA==' }],
  updatedAt: '2026-10-29T00:00:00.000Z'
})

test('carrega todos os conjuntos com concorrência limitada e publica os detalhes progressivamente', async () => {
  const summaries = Array.from({ length: 9 }, (_, index) => summary(`set-${index}`))
  const loaded = []
  let active = 0
  let maximumActive = 0

  await loadCustomizerWardrobeCatalog({
    summaries,
    categories: [],
    concurrency: 3,
    loadSet: async (item) => {
      active += 1
      maximumActive = Math.max(maximumActive, active)
      await new Promise((resolve) => setTimeout(resolve, 1))
      active -= 1
      return set(item.id, 'camisa')
    },
    hasThumbnail: () => false,
    renderThumbnail: async () => null,
    isCancelled: () => false,
    onSetLoaded: (item) => loaded.push(item.id),
    onThumbnailLoaded: () => assert.fail('não há categorias de miniatura neste caso'),
    onError: (reason) => assert.fail(String(reason))
  })

  assert.equal(maximumActive, 3)
  assert.deepEqual(loaded.sort(), summaries.map((item) => item.id))
})

test('gera apenas miniaturas faltantes cujas categorias existem no conjunto', async () => {
  const summaries = [summary('shirt'), summary('pants')]
  const thumbnails = []
  const rendered = []
  await loadCustomizerWardrobeCatalog({
    summaries,
    categories: [
      { id: 'upper', source: ['camisa'] },
      { id: 'lower', source: ['calca-coxa'] }
    ],
    loadSet: async (item) => set(item.id, item.id === 'shirt' ? 'camisa' : 'calca-coxa'),
    hasThumbnail: (key) => key === '1:shirt:upper',
    renderThumbnail: async (_wardrobeSet, categories) => {
      rendered.push(categories)
      return 'data:image/png;base64,AA=='
    },
    isCancelled: () => false,
    onSetLoaded: () => {},
    onThumbnailLoaded: (key, thumbnail) => thumbnails.push({ key, thumbnail }),
    onError: (reason) => assert.fail(String(reason))
  })

  assert.deepEqual(rendered, [['calca-coxa']])
  assert.deepEqual(thumbnails, [{ key: '1:pants:lower', thumbnail: 'data:image/png;base64,AA==' }])
})

test('índice de candidatos preserva filtros, ordem e agrupamento de cada painel', () => {
  const component = (id, name, category, attachedPartId = 'body') => ({
    id, name, category, attachedPartId, x: 0, y: 0, width: 10, height: 10, rotation: 0,
    dataUrl: 'data:image/png;base64,AA=='
  })
  const createSet = (id, modelSlot, components) => ({
    schemaVersion: 1,
    edition: 2,
    id,
    modelSlot,
    modelName: `Modelo ${modelSlot}`,
    name: id,
    width: 20,
    height: 20,
    components,
    updatedAt: '2026-10-29T00:00:00.000Z'
  })
  const panels = [
    ...upperWardrobePanels,
    ...upperWardrobePageTwoPanels,
    ...accessoryWardrobePanels,
    ...lowerWardrobePanels,
    ...lowerWardrobePageTwoPanels
  ]
  const mainSet = createSet('main', 1, [
    component('shirt', 'Camisa', 'camisa'),
    component('jacket', 'Jaqueta', 'jaqueta'),
    component('upper-left', 'Manga esquerda', 'manga-superior', 'braço esquerdo'),
    component('upper-right', 'Manga direita', 'manga-superior', 'braço direito'),
    component('lower-left', 'Manga inferior esquerda', 'manga-inferior', 'antebraço esquerdo'),
    component('lower-right', 'Manga inferior direita', 'manga-inferior', 'antebraço direito'),
    component('pants-thigh', 'Calça coxa', 'calca-coxa'),
    component('pants-shin', 'Calça canela', 'calca-canela'),
    component('shorts', 'Bermuda', 'shorts'),
    component('glass-cloth', 'Óculos de roupa', 'oculos')
  ])
  const otherSlotSet = createSet('other-slot', 2, [component('other-shirt', 'Camisa', 'camisa')])
  const summaries = [
    { ...summary(mainSet.id), componentCount: mainSet.components.length },
    { ...summary(otherSlotSet.id), modelSlot: 2, componentCount: otherSlotSet.components.length }
  ]
  const faceSummary = {
    id: 'glasses-extra', modelSlot: 1, kind: 'head-extra', name: 'Óculos extra', width: 12, height: 8,
    updatedAt: '2026-10-29T00:00:00.000Z'
  }
  const faceAsset = {
    schemaVersion: 1, ...faceSummary,
    defaultTransform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
    dataUrl: 'data:image/png;base64,AA=='
  }
  const wardrobeDetails = { '1:main': mainSet, '2:other-slot': otherSlotSet }
  const faceComponentDetails = { [faceAsset.id]: faceAsset }
  const index = createWardrobePanelCandidateIndex({
    panels,
    selectedModelSlot: 1,
    wardrobeSets: summaries,
    wardrobeDetails,
    faceComponentAssets: [faceSummary],
    faceComponentDetails
  })

  assert.equal(index.size, panels.length)
  assert.equal(new Set(panels.map((panel) => panel.id)).size, panels.length)
  for (const panel of panels) {
    assert.deepEqual(
      index.get(panel.id),
      wardrobePanelCandidates(panel, 1, summaries, wardrobeDetails, [faceSummary], faceComponentDetails)
    )
  }
  assert.deepEqual(index.get('pants-left')?.[0]?.components.map(({ id }) => id), ['pants-thigh', 'pants-shin'])
  assert.equal(index.get('pants-left')?.[0]?.component.id, 'pants-thigh')
  assert.equal(index.get('glasses')?.[0]?.headExtraAsset?.id, faceAsset.id)
  assert.equal(index.get('shirt')?.some((candidate) => candidate.summary.modelSlot === 2), false)
})

test('cancelamento impede publicar detalhes depois de trocar de área', async () => {
  let cancel = false
  let resolveSet
  let markStarted
  const started = new Promise((resolve) => { markStarted = resolve })
  const pendingSet = new Promise((resolve) => { resolveSet = resolve })
  const loaded = []
  const task = loadCustomizerWardrobeCatalog({
    summaries: [summary('slow')],
    categories: [],
    loadSet: async () => { markStarted(); return pendingSet },
    hasThumbnail: () => false,
    renderThumbnail: async () => null,
    isCancelled: () => cancel,
    onSetLoaded: () => loaded.push('set'),
    onThumbnailLoaded: () => loaded.push('thumbnail'),
    onError: (reason) => assert.fail(String(reason))
  })
  await started
  cancel = true
  resolveSet(set('slow', 'camisa'))
  await task

  assert.deepEqual(loaded, [])
})

test('falha de um conjunto é reportada e não bloqueia os demais', async () => {
  const loaded = []
  const errors = []
  await loadCustomizerWardrobeCatalog({
    summaries: [summary('broken'), summary('healthy')],
    categories: [],
    concurrency: 1,
    loadSet: async (item) => {
      if (item.id === 'broken') throw new Error('manifesto ilegível')
      return set(item.id, 'camisa')
    },
    hasThumbnail: () => false,
    renderThumbnail: async () => null,
    isCancelled: () => false,
    onSetLoaded: (item) => loaded.push(item.id),
    onThumbnailLoaded: () => {},
    onError: (reason) => errors.push(reason.message)
  })

  assert.deepEqual(errors, ['manifesto ilegível'])
  assert.deepEqual(loaded, ['healthy'])
})

test('página do Customizador delega a carga de detalhes e miniaturas ao hook da feature', async () => {
  const [page, hook, loader] = await Promise.all([
    readFile('src/renderer/src/features/customizer/CustomizerPage.tsx', 'utf8'),
    readFile('src/renderer/src/features/customizer/useCustomizerWardrobeCatalog.ts', 'utf8'),
    readFile('src/renderer/src/features/customizer/customizerWardrobeCatalog.ts', 'utf8')
  ])
  assert.match(page, /useCustomizerWardrobeCatalog\(/)
  assert.doesNotMatch(page, /listWardrobeSets\(|loadWardrobeSet\(|renderWardrobeThumbnail\(/)
  assert.match(hook, /listWardrobeSets\(selectedModelSlot\)/)
  assert.match(hook, /loadCustomizerWardrobeCatalog\(/)
  assert.match(loader, /concurrency = 3/)
  assert.match(loader, /mapConcurrentItems\(/)
})

test('detalhes dos cabelos têm concorrência limitada, ordem estável e cancelamento', async () => {
  const summaries = Array.from({ length: 10 }, (_, index) => ({ id: `hair-${index}` }))
  let active = 0
  let maximumActive = 0
  const details = await loadCustomizerHairDetails(summaries, () => false, async (id) => {
    active += 1
    maximumActive = Math.max(maximumActive, active)
    await new Promise((resolve) => setTimeout(resolve, 2))
    active -= 1
    return id === 'hair-4' ? null : { id }
  })

  assert.equal(maximumActive, 3)
  assert.deepEqual(details.map((style) => style.id), ['hair-0', 'hair-1', 'hair-2', 'hair-3', 'hair-5', 'hair-6', 'hair-7', 'hair-8', 'hair-9'])

  let cancelled = false
  const started = []
  const releases = []
  const task = loadCustomizerHairDetails(summaries, () => cancelled, async (id) => {
    started.push(id)
    await new Promise((resolve) => releases.push(resolve))
    return { id }
  })
  assert.deepEqual(started, ['hair-0', 'hair-1', 'hair-2'])
  cancelled = true
  releases.forEach((release) => release())
  assert.deepEqual(await task, [])
  assert.deepEqual(started, ['hair-0', 'hair-1', 'hair-2'])
})

test('Customizador delega o catálogo de cabelos ao hook e ao carregador limitado', async () => {
  const [page, catalogHook, libraryHook, loader] = await Promise.all([
    readFile('src/renderer/src/features/customizer/CustomizerPage.tsx', 'utf8'),
    readFile('src/renderer/src/features/customizer/useCustomizerHairCatalog.ts', 'utf8'),
    readFile('src/renderer/src/features/customizer/useCustomizerHairLibraryPage.ts', 'utf8'),
    readFile('src/renderer/src/features/customizer/customizerHairCatalog.ts', 'utf8')
  ])
  assert.match(page, /useCustomizerHairCatalog\(/)
  assert.doesNotMatch(page, /Promise\.all\(summaries\.map\(\(summary\) => window\.desktop\.fabricator\.loadHairStyle/)
  assert.match(catalogHook, /listHairStyles\(selectedModelSlot\)/)
  assert.match(page, /useCustomizerHairLibraryPage\(/)
  assert.match(libraryHook, /loadCustomizerHairLibraryPageDetails\(/)
  assert.match(loader, /concurrency = 3/)
  assert.match(loader, /mapConcurrentItems\(/)
})

test('CustomizerPage memoiza candidatos de roupas e não refaz a busca dentro de cada painel', async () => {
  const page = await readFile('src/renderer/src/features/customizer/CustomizerPage.tsx', 'utf8')
  assert.match(page, /createWardrobePanelCandidateIndex\(/)
  assert.match(page, /const wardrobePanelCandidateIndex = useMemo\(/)
  assert.match(page, /wardrobePanelCandidateIndex\.get\(panel\.id\)/)
  assert.doesNotMatch(page, /wardrobePanelCandidates\(/)
})

test('biblioteca de cabelos carrega só as miniaturas da página visível', async () => {
  const summaries = Array.from({ length: 45 }, (_, index) => ({
    ...summary(`hair-${index}`),
    category: 'rearHair',
    front: { width: 10, height: 10 }, back: null, fringe: null
  }))
  const page = getCustomizerHairLibraryPage(summaries, 'rearHair', 1)
  const loaded = []
  const details = await loadCustomizerHairLibraryPageDetails(
    page.visibleStyles,
    () => false,
    (item) => item.id === 'hair-20',
    async (id) => {
      loaded.push(id)
      return { id, modelSlot: 1, updatedAt: '2026-10-29T00:00:00.000Z' }
    }
  )

  assert.equal(page.page, 1)
  assert.equal(page.pageCount, 3)
  assert.deepEqual(page.visibleStyles.map((item) => item.id), Array.from({ length: 20 }, (_, index) => `hair-${index + 19}`))
  assert.equal(loaded.length, 19)
  assert.equal(loaded.includes('hair-20'), false)
  assert.equal(details.length, 19)
})

test('cache de cabelos mantém apenas assets do modelo selecionado', async () => {
  const details = {
    '1:front-a': { id: 'front-a' },
    '2:front-b': { id: 'front-b' },
    '20:front-c': { id: 'front-c' }
  }
  const selectedModel = retainCustomizerHairDetailsForModel(details, 2)
  assert.deepEqual(selectedModel, { '2:front-b': { id: 'front-b' } })
  assert.strictEqual(retainCustomizerHairDetailsForModel(selectedModel, 2), selectedModel)
  assert.deepEqual(retainCustomizerHairDetailsForModel(selectedModel, null), {})

  const page = await readFile('src/renderer/src/features/customizer/CustomizerPage.tsx', 'utf8')
  assert.match(page, /setActiveHairDetails/)
  assert.match(page, /const modelSlot = activeHairModelSlotRef\.current/)
  assert.match(page, /retainCustomizerHairDetailsForModel\(\s*current,\s*activeHairModelSlotRef\.current,\s*activeHairStyleIdsRef\.current/)
  assert.equal((page.match(/setHairDetails: setActiveHairDetails/g) ?? []).length, 2)
})

test('cache de cabelos mantém estilos selecionados e página atual, removendo páginas antigas', () => {
  const details = {
    '2:selected': { id: 'selected' },
    '2:visible-a': { id: 'visible-a' },
    '2:previous-page': { id: 'previous-page' },
    '1:other-model': { id: 'other-model' }
  }
  const retained = retainCustomizerHairDetailsForModel(details, 2, new Set(['selected', 'visible-a']))
  assert.deepEqual(retained, {
    '2:selected': { id: 'selected' },
    '2:visible-a': { id: 'visible-a' }
  })
})

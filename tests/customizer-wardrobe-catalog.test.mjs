import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { loadCustomizerWardrobeCatalog } from '../src/renderer/src/features/customizer/customizerWardrobeCatalog.ts'

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
  assert.match(loader, /while \(!isCancelled\(\)\)/)
})

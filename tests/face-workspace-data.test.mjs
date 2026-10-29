import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { listFaceCatalogWorkspaceSummaries, loadFaceCatalogWorkspaceData, loadFaceCatalogWorkspaceDetails, loadFaceComponentWorkspaceData } from '../src/renderer/src/features/fabricator/face/faceWorkspaceData.ts'
import {
  alignFaceCatalogMouthPreviewTransform,
  faceCatalogImagesForImport,
  faceCatalogImagesForSave,
  faceCatalogItemForSave,
  planFaceCatalogOpacityEdit,
  planFaceCatalogTransformEdits,
  planFaceCatalogVariantEdit
} from '../src/renderer/src/features/fabricator/face/faceCatalogEdits.ts'

function deferred() {
  let resolve
  let reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

function componentSummary(id, kind = 'eye') {
  return { id, modelSlot: 2, kind, name: id, width: 20, height: 12, updatedAt: 'now' }
}

function componentDetail(summary) {
  return { ...summary, defaultTransform: { x: 10, y: 6, scaleX: 1, scaleY: 1, rotation: 0 }, dataUrl: `data:${summary.id}` }
}

function catalogItem(id, category, transform, modelSlot = 2) {
  const element = category === 'nose' ? 'nose' : 'mouth'
  return {
    schemaVersion: 1,
    id,
    modelSlot,
    category,
    name: id,
    sheet: { kind: category, name: `${id}.png`, width: 32, height: 24, tolerance: 42, dataUrl: `data:sheet:${id}` },
    pieces: [{ id: `${id}-piece`, index: 0, width: 8, height: 6, dataUrl: `data:piece:${id}` }],
    transforms: { [element]: transform },
    eyeLinked: true,
    browLinked: true,
    selectedNose: 0,
    selectedExpression: 0,
    updatedAt: 'before'
  }
}

function createComponentApi({ summaries = [], loadAsset = async (summary) => componentDetail(summary) } = {}) {
  const calls = []
  return {
    calls,
    api: {
      loadFabricatorSlot: async (slot) => { calls.push(['load-model', slot]); return { slot, parts: [] } },
      listFaceComponentAssets: async (slot, kind) => {
        calls.push(['list-components', slot, kind])
        return summaries.filter((summary) => summary.kind === kind)
      },
      loadFaceComponentAsset: async (slot, id) => {
        calls.push(['load-component', slot, id])
        return loadAsset(summaries.find((summary) => summary.id === id))
      },
      listFaceCatalog: async () => [],
      loadFaceCatalogItem: async () => null
    }
  }
}

test('face component loader retains list order while limiting PNG-bearing IPC requests to four', async () => {
  const summaries = Array.from({ length: 17 }, (_, index) => componentSummary(`asset-${index}`, index % 2 ? 'eye' : 'pupil'))
  let active = 0
  let maximumActive = 0
  const state = createComponentApi({
    summaries,
    loadAsset: async (summary) => {
      active += 1
      maximumActive = Math.max(maximumActive, active)
      await new Promise((resolve) => setTimeout(resolve, 1))
      active -= 1
      return summary.id === 'asset-8' ? null : componentDetail(summary)
    }
  })

  const result = await loadFaceComponentWorkspaceData(state.api, 2, ['eye', 'pupil'], () => false)
  const listedSummaries = ['eye', 'pupil'].flatMap((kind) => summaries.filter((item) => item.kind === kind))
  assert.deepEqual(state.calls.slice(0, 3), [
    ['load-model', 2],
    ['list-components', 2, 'eye'],
    ['list-components', 2, 'pupil']
  ])
  assert.equal(maximumActive, 4)
  assert.deepEqual(result.assets.map((item) => item.id), listedSummaries.map((item) => item.id))
  assert.deepEqual(Object.keys(result.details), listedSummaries.filter((item) => item.id !== 'asset-8').map((item) => item.id))
})

test('component images and nose/mouth catalog images share one four-request limit', async () => {
  const componentSummaries = Array.from({ length: 9 }, (_, index) => componentSummary(`component-${index}`))
  const catalogSummaries = Array.from({ length: 9 }, (_, index) => ({ id: `mouth-${index}`, category: 'mouth-closed', name: `Boca ${index}` }))
  let active = 0
  let maximumActive = 0
  const readImage = async (item) => {
    active += 1
    maximumActive = Math.max(maximumActive, active)
    await new Promise((resolve) => setTimeout(resolve, 1))
    active -= 1
    return { ...item, pieces: [], dataUrl: `data:${item.id}` }
  }
  const componentApi = createComponentApi({ summaries: componentSummaries, loadAsset: readImage }).api
  const catalogApi = {
    listFaceCatalog: async () => catalogSummaries,
    loadFaceCatalogItem: async (_slot, id) => readImage(catalogSummaries.find((item) => item.id === id))
  }

  await Promise.all([
    loadFaceComponentWorkspaceData(componentApi, 2, ['eye'], () => false),
    loadFaceCatalogWorkspaceData(catalogApi, 2, () => false)
  ])
  assert.equal(maximumActive, 4)
})

test('component loading cancellation stops scheduling queued assets after the active reads finish', async () => {
  const summaries = Array.from({ length: 12 }, (_, index) => componentSummary(`asset-${index}`))
  const gates = new Map()
  const state = createComponentApi({
    summaries,
    loadAsset: (summary) => {
      const gate = deferred()
      gates.set(summary.id, gate)
      return gate.promise
    }
  })
  let cancelled = false
  const loading = loadFaceComponentWorkspaceData(state.api, 2, ['eye'], () => cancelled)
  while (gates.size < 4) await Promise.resolve()
  cancelled = true
  for (const [id, gate] of gates) gate.resolve(componentDetail(summaries.find((summary) => summary.id === id)))

  assert.equal(await loading, null)
  assert.equal(gates.size, 4)
  assert.equal(state.calls.filter(([kind]) => kind === 'load-component').length, 4)
})

test('component loading stops queuing after a failure and waits for already-started reads', async () => {
  const summaries = Array.from({ length: 9 }, (_, index) => componentSummary(`asset-${index}`))
  const gates = new Map()
  const state = createComponentApi({
    summaries,
    loadAsset: (summary) => {
      if (summary.id === 'asset-0') return Promise.reject(new Error('falha IPC'))
      const gate = deferred()
      gates.set(summary.id, gate)
      return gate.promise
    }
  })
  const loading = loadFaceComponentWorkspaceData(state.api, 2, ['eye'], () => false)
  while (gates.size < 3) await Promise.resolve()
  for (const [id, gate] of gates) gate.resolve(componentDetail(summaries.find((summary) => summary.id === id)))

  await assert.rejects(loading, /falha IPC/)
  assert.deepEqual(state.calls.filter(([kind]) => kind === 'load-component').map(([, , id]) => id), ['asset-0', 'asset-1', 'asset-2', 'asset-3'])
})

test('catalog loader loads only nose and mouth entries and separates details by their owner', async () => {
  const summaries = [
    { id: 'nose-1', category: 'nose', name: 'Nariz' },
    { id: 'mouth-1', category: 'mouth-closed', name: 'Fechada' },
    { id: 'mouth-2', category: 'mouth-open', name: 'Aberta' },
    { id: 'legacy-other', category: 'not-a-workspace-category', name: 'Outro' }
  ]
  const loadedIds = []
  const api = {
    listFaceCatalog: async () => summaries,
    loadFaceCatalogItem: async (_slot, id) => {
      loadedIds.push(id)
      const summary = summaries.find((item) => item.id === id)
      return { ...summary, pieces: [], transforms: {} }
    }
  }

  const result = await loadFaceCatalogWorkspaceData(api, 2, () => false)
  assert.deepEqual(loadedIds, ['nose-1', 'mouth-1', 'mouth-2'])
  assert.deepEqual(result.noseCatalog.map((item) => item.id), ['nose-1'])
  assert.deepEqual(Object.keys(result.noseDetails), ['nose-1'])
  assert.deepEqual(result.mouthCatalog.map((item) => item.id), ['mouth-1', 'mouth-2'])
  assert.deepEqual(Object.keys(result.mouthDetails), ['mouth-1', 'mouth-2'])
})

test('catalog summaries are listed without reading PNG details', async () => {
  const summaries = [
    { id: 'nose-1', category: 'nose', name: 'Nariz' },
    { id: 'eye-sheet', category: 'eyes', name: 'Olhos' }
  ]
  let detailReads = 0
  const api = {
    listFaceCatalog: async () => summaries,
    loadFaceCatalogItem: async () => { detailReads += 1; return null }
  }

  const result = await listFaceCatalogWorkspaceSummaries(api, 2, () => false)

  assert.deepEqual(result, { mouthCatalog: [], noseCatalog: [summaries[0]] })
  assert.equal(detailReads, 0)
})

test('catalog loader hydrates the active category and only the other selected face assets', async () => {
  const summaries = [
    { id: 'nose-1', category: 'nose', name: 'Nariz 1' },
    { id: 'closed-1', category: 'mouth-closed', name: 'Fechada 1' },
    { id: 'closed-2', category: 'mouth-closed', name: 'Fechada 2' },
    { id: 'open-1', category: 'mouth-open', name: 'Aberta 1' },
    { id: 'nose-2', category: 'nose', name: 'Nariz 2' },
    { id: 'other', category: 'eyes', name: 'Não usado aqui' }
  ]
  const loadedIds = []
  const api = {
    listFaceCatalog: async () => summaries,
    loadFaceCatalogItem: async (_slot, id) => {
      loadedIds.push(id)
      const summary = summaries.find((item) => item.id === id)
      return { ...summary, pieces: [], transforms: {} }
    }
  }

  const result = await loadFaceCatalogWorkspaceData(api, 2, () => false, {
    activeCategory: 'nose',
    mouthKind: 'mouth-open',
    selectedMouthId: 'open-1',
    selectedNoseId: 'nose-2'
  })

  assert.deepEqual(new Set(loadedIds), new Set(['nose-1', 'nose-2', 'open-1', 'closed-1']))
  assert.deepEqual(result.noseCatalog.map((item) => item.id), ['nose-1', 'nose-2'])
  assert.deepEqual(result.mouthCatalog.map((item) => item.id), ['closed-1', 'closed-2', 'open-1'])
  assert.deepEqual(Object.keys(result.mouthDetails).sort(), ['closed-1', 'open-1'])
  assert.deepEqual(Object.keys(result.noseDetails).sort(), ['nose-1', 'nose-2'])
})

test('mouth editing loads all mouth variants so shared transforms stay synchronized', async () => {
  const summaries = [
    { id: 'nose-1', category: 'nose', name: 'Nariz 1' },
    { id: 'closed-1', category: 'mouth-closed', name: 'Fechada 1' },
    { id: 'closed-2', category: 'mouth-closed', name: 'Fechada 2' },
    { id: 'open-1', category: 'mouth-open', name: 'Aberta 1' },
    { id: 'nose-2', category: 'nose', name: 'Nariz 2' }
  ]
  const loadedIds = []
  const api = {
    listFaceCatalog: async () => summaries,
    loadFaceCatalogItem: async (_slot, id) => {
      loadedIds.push(id)
      const summary = summaries.find((item) => item.id === id)
      return { ...summary, pieces: [], transforms: {} }
    }
  }

  await loadFaceCatalogWorkspaceData(api, 2, () => false, {
    activeCategory: 'mouth',
    mouthKind: 'mouth-closed',
    selectedMouthId: 'closed-2',
    selectedNoseId: 'nose-2'
  })

  assert.deepEqual(new Set(loadedIds), new Set(['nose-2', 'closed-1', 'closed-2', 'open-1']))
})

test('detail loading reuses summaries without listing catalog metadata again', async () => {
  const summaries = {
    mouthCatalog: [
      { id: 'closed-1', category: 'mouth-closed', name: 'Fechada 1' },
      { id: 'open-1', category: 'mouth-open', name: 'Aberta 1' }
    ],
    noseCatalog: [{ id: 'nose-1', category: 'nose', name: 'Nariz 1' }]
  }
  let summaryReads = 0
  const detailReads = []
  const api = {
    listFaceCatalog: async () => { summaryReads += 1; return [] },
    loadFaceCatalogItem: async (_slot, id) => {
      detailReads.push(id)
      const summary = [...summaries.noseCatalog, ...summaries.mouthCatalog].find((item) => item.id === id)
      return { ...summary, pieces: [], transforms: {} }
    }
  }

  const result = await loadFaceCatalogWorkspaceDetails(api, 2, summaries, {
    activeCategory: 'nose',
    mouthKind: 'mouth-closed',
    selectedMouthId: 'closed-1',
    selectedNoseId: 'nose-1'
  }, () => false)

  assert.deepEqual(new Set(detailReads), new Set(['nose-1', 'closed-1']))
  assert.equal(summaryReads, 0)
  assert.deepEqual(Object.keys(result.mouthDetails), ['closed-1'])
})

test('workspace data loaders stop before starting image requests if the view was cancelled during listing', async () => {
  let cancelled = false
  let componentRequests = 0
  const state = createComponentApi({ summaries: [componentSummary('asset-1')] })
  const api = {
    ...state.api,
    loadFaceComponentAsset: async (...args) => { componentRequests += 1; return state.api.loadFaceComponentAsset(...args) }
  }
  const pending = loadFaceComponentWorkspaceData(api, 2, ['eye'], () => cancelled)
  cancelled = true

  assert.equal(await pending, null)
  assert.equal(componentRequests, 0)
})

test('FaceComponentsWorkspace delegates data loading and keeps catalog editing actions in the page', async () => {
  const page = await readFile('src/renderer/src/features/fabricator/face/FaceComponentsWorkspace.tsx', 'utf8')
  const hook = await readFile('src/renderer/src/features/fabricator/face/useFaceCatalogWorkspace.ts', 'utf8')
  assert.match(page, /loadFaceComponentWorkspaceData\(window\.desktop\.fabricator, modelSlot, visibleKinds, \(\) => !active\)/)
  assert.match(page, /useFaceCatalogWorkspace\(/)
  assert.match(hook, /listFaceCatalogWorkspaceSummaries\(api, modelSlot/)
  assert.match(hook, /loadFaceCatalogWorkspaceDetails\(api, modelSlot,/)
  assert.match(page, /isCatalogDeleteOpen \? 'all'/)
  assert.doesNotMatch(page, /Promise\.all\((?:visibleList|relevant)\.map\(/)
  assert.match(page, /registerPendingWriteFlusher\(flushAllSaves\)/)
  assert.match(page, /const savedSelection = mode === 'eyes' \? readComponentSelections\(\(\) => window\.localStorage\)\[modelSlot\] : undefined/)
})

test('face workspace reuses the shared ordered worker while preserving one global image limit', async () => {
  const source = await readFile('src/renderer/src/features/fabricator/face/faceWorkspaceData.ts', 'utf8')
  assert.match(source, /import \{ mapConcurrentItems \} from '\.\.\/\.\.\/\.\.\/ui\/mapConcurrentItems\.ts'/)
  assert.match(source, /import \{ createConcurrencyLimiter \} from '\.\.\/\.\.\/\.\.\/ui\/concurrencyLimiter\.ts'/)
  assert.match(source, /return mapConcurrentItems\(/)
  assert.match(source, /scheduleFaceImageLoad\(\(\) => loadDetail\(summary\), isCancelled\)/)
  assert.match(source, /createConcurrencyLimiter\(FACE_IMAGE_LOAD_CONCURRENCY\)/)
  assert.doesNotMatch(source, /const workerCount = Math\.min\(FACE_IMAGE_LOAD_CONCURRENCY/)
})

test('mouth transform edits preserve each open catalog variant scale relative to the closed mouth', () => {
  const closed = catalogItem('closed', 'mouth-closed', { x: 20, y: 30, scaleX: 1, scaleY: 1, rotation: 0 })
  const open = catalogItem('open', 'mouth-open', { x: 25, y: 34, scaleX: 1.4, scaleY: .75, rotation: .2 })
  const otherModel = catalogItem('other-model', 'mouth-open', { x: 10, y: 11, scaleX: 3, scaleY: 2, rotation: 0 }, 3)
  const patch = { x: 24, y: 32, scaleX: 1.2, scaleY: 1.1, rotation: .4 }

  const updates = planFaceCatalogTransformEdits([open, closed, otherModel], closed, patch, 'after')

  assert.deepEqual(updates.map((item) => item.id), ['open', 'closed'])
  assert.deepEqual(updates.find((item) => item.id === 'closed').transforms.mouth, patch)
  const openTransform = updates.find((item) => item.id === 'open').transforms.mouth
  assert.deepEqual({ ...openTransform, scaleX: 0, scaleY: 0 }, { ...patch, scaleX: 0, scaleY: 0 })
  assert.ok(Math.abs(openTransform.scaleX - 1.68) < 1e-10)
  assert.ok(Math.abs(openTransform.scaleY - .825) < 1e-10)
  assert.equal(updates.every((item) => item.updatedAt === 'after'), true)
  assert.equal(otherModel.transforms.mouth.scaleX, 3)
})

test('editing an open mouth still uses the closed mouth as the shared transform reference', () => {
  const closed = catalogItem('closed', 'mouth-closed', { x: 5, y: 6, scaleX: 2, scaleY: 4, rotation: 0 })
  const open = catalogItem('open', 'mouth-open', { x: 8, y: 9, scaleX: 3, scaleY: 2, rotation: 0 })

  const updates = planFaceCatalogTransformEdits([closed, open], open, { scaleX: 4, scaleY: 2 }, 'after')

  assert.deepEqual(updates.find((item) => item.id === 'closed').transforms.mouth, {
    x: 5, y: 6, scaleX: 4, scaleY: 2, rotation: 0
  })
  assert.deepEqual(updates.find((item) => item.id === 'open').transforms.mouth, {
    x: 5, y: 6, scaleX: 6, scaleY: 1, rotation: 0
  })
})

test('catalog transform edit updates a nose alone and skips catalog entries without its transform', () => {
  const nose = catalogItem('nose', 'nose', { x: 14, y: 20, scaleX: .5, scaleY: .6, rotation: 0 })
  const mouth = catalogItem('mouth', 'mouth-open', { x: 1, y: 2, scaleX: 1, scaleY: 1, rotation: 0 })
  const malformedNose = { ...nose, id: 'missing-transform', transforms: {} }

  const updates = planFaceCatalogTransformEdits([nose, mouth], nose, { x: 18 }, 'after')

  assert.equal(updates.length, 1)
  assert.deepEqual(updates[0].transforms.nose, { x: 18, y: 20, scaleX: .5, scaleY: .6, rotation: 0 })
  assert.deepEqual(planFaceCatalogTransformEdits([malformedNose], malformedNose, { x: 18 }, 'after'), [])
})

test('catalog variant and opacity edits keep category rules and clamp opacity', () => {
  const nose = catalogItem('nose', 'nose', { x: 1, y: 2, scaleX: 1, scaleY: 1, rotation: 0 })
  const mouth = catalogItem('mouth', 'mouth-open', { x: 1, y: 2, scaleX: 1, scaleY: 1, rotation: 0 })

  assert.equal(planFaceCatalogVariantEdit(nose, 4, 'after').selectedNose, 4)
  assert.equal(planFaceCatalogVariantEdit(mouth, 3, 'after').selectedExpression, 3)
  assert.equal(planFaceCatalogOpacityEdit(nose, 2, 'after').opacity, 1)
  assert.equal(planFaceCatalogOpacityEdit(nose, -1, 'after').opacity, 0)
  assert.equal(planFaceCatalogOpacityEdit(mouth, .4, 'after'), null)
})

test('mouth preview keeps transform alignment and catalog saves separate image payloads', () => {
  const closed = catalogItem('closed', 'mouth-closed', { x: 20, y: 30, scaleX: 2, scaleY: 4, rotation: 0 })
  const open = catalogItem('open', 'mouth-open', { x: 20, y: 30, scaleX: 3, scaleY: 2, rotation: 0 })
  const base = { x: 12, y: 15, scaleX: .5, scaleY: .25, rotation: .1 }
  const preview = alignFaceCatalogMouthPreviewTransform(base, closed, open)

  assert.deepEqual(preview, { ...base, scaleX: .75, scaleY: .125 })
  assert.equal(faceCatalogImagesForSave(closed).length, 0)
  assert.equal(faceCatalogImagesForSave({ ...closed, id: 'legacy_old' }).length, 2)
  assert.equal(faceCatalogImagesForImport(closed).length, 2)
  const saved = faceCatalogItemForSave(closed)
  assert.equal('dataUrl' in saved.sheet, false)
  assert.equal('dataUrl' in saved.pieces[0], false)
})

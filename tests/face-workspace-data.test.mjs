import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { loadFaceCatalogWorkspaceData, loadFaceComponentWorkspaceData } from '../src/renderer/src/features/fabricator/face/faceWorkspaceData.ts'

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

test('FaceComponentsWorkspace delegates library reads while keeping selection and save queue in the page', async () => {
  const page = await readFile('src/renderer/src/features/fabricator/face/FaceComponentsWorkspace.tsx', 'utf8')
  assert.match(page, /loadFaceComponentWorkspaceData\(window\.desktop\.fabricator, modelSlot, visibleKinds, \(\) => !active\)/)
  assert.match(page, /loadFaceCatalogWorkspaceData\(window\.desktop\.fabricator, modelSlot, \(\) => !active\)/)
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

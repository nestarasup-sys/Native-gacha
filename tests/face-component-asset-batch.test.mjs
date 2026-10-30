import test from 'node:test'
import assert from 'node:assert/strict'
import { assertFaceComponentImportActive, saveFaceComponentAssetBatch } from '../src/renderer/src/features/fabricator/face/faceComponentAssetBatch.ts'
import { createFaceComponentImportCommands } from '../src/renderer/src/features/fabricator/face/faceComponentImportCommands.ts'

function entry(id) {
  return { asset: { id, modelSlot: 2 }, dataUrl: `data:${id}` }
}

function writer({ failId, afterSave } = {}) {
  const calls = []
  return {
    calls,
    api: {
      saveFaceComponentAsset: async (slot, asset, dataUrl) => {
        calls.push(['save', slot, asset.id, dataUrl])
        await afterSave?.(asset.id)
        if (asset.id === failId) throw new Error(`falha ${asset.id}`)
      },
      deleteFaceComponentAsset: async (slot, id) => { calls.push(['delete', slot, id]) }
    }
  }
}

function importCommandsHarness(overrides = {}) {
  const calls = []
  const state = {
    busy: false,
    error: '',
    notice: '',
    details: {},
    assets: [],
    selectedAssets: {},
    selectedPart: null,
    libraryCategory: null,
    noseCatalog: [],
    noseDetails: {},
    selectedNoseId: null,
    mouthCatalog: [],
    mouthDetails: {},
    selectedMouthId: null,
    mouthKind: null,
    modal: 'import'
  }
  const setState = (key) => (value) => {
    state[key] = typeof value === 'function' ? value(state[key]) : value
    calls.push([`state:${key}`, state[key]])
  }
  let id = 0
  let contextCurrent = true
  const api = {
    saveFaceComponentAsset: async (slot, asset, dataUrl) => calls.push(['save-asset', slot, asset.id, dataUrl]),
    deleteFaceComponentAsset: async (slot, assetId) => calls.push(['delete-asset', slot, assetId]),
    saveFaceCatalogItem: async (slot, item, images) => calls.push(['save-catalog', slot, item.id, images.length])
  }
  const dependencies = {
    api,
    modelSlot: 2,
    head: { width: 100, height: 200 },
    anchors: undefined,
    faceDetailLabel: (kind) => kind,
    isContextCurrent: () => contextCurrent,
    isMounted: () => true,
    eyeSheetImportController: { current: null },
    eyeSheetImportContextCancelled: { current: false },
    setBusy: setState('busy'),
    setError: setState('error'),
    setNotice: setState('notice'),
    setOpenModal: setState('modal'),
    setDetails: setState('details'),
    setAssets: setState('assets'),
    setSelectedAssets: setState('selectedAssets'),
    setSelectedPart: setState('selectedPart'),
    setLibraryCategory: setState('libraryCategory'),
    selectFaceDetail: (kind, assetId) => calls.push(['select-detail', kind, assetId]),
    setNoseCatalog: setState('noseCatalog'),
    setNoseDetails: setState('noseDetails'),
    setSelectedNoseId: setState('selectedNoseId'),
    setMouthCatalog: setState('mouthCatalog'),
    setMouthDetails: setState('mouthDetails'),
    setSelectedMouthId: setState('selectedMouthId'),
    setMouthKind: setState('mouthKind'),
    normalizeImage: async () => ({ width: 12, height: 8, dataUrl: 'data:normalized' }),
    splitEyeSheet: async () => [{ kind: 'eye', width: 12, height: 8, dataUrl: 'data:eye' }],
    processFaceSheet: async (kind) => ({ width: 30, height: 20, sheetPng: 'data:sheet', pieces: [{ id: 'piece-1', index: 0, width: 10, height: 8, dataUrl: 'data:piece', kind }] }),
    createEyeSheetImportPlan: () => ({ entries: [], assets: [], assigned: {} }),
    createEyebrowImportPlan: ({ modelSlot }) => ({
      entries: [
        { asset: { id: 'brow-left', modelSlot }, dataUrl: 'data:left' },
        { asset: { id: 'brow-right', modelSlot }, dataUrl: 'data:right' }
      ],
      leftId: 'brow-left',
      rightId: 'brow-right'
    }),
    createFaceDetailImportEntry: ({ kind, modelSlot }) => ({ asset: { id: `${kind}-asset`, kind, name: kind, modelSlot }, dataUrl: 'data:detail' }),
    assertImportActive: assertFaceComponentImportActive,
    saveAssetBatch: async (writerApi, slot, entries, signal) => {
      calls.push(['save-batch', slot, entries.map((item) => item.asset.id), signal?.aborted ?? false])
      for (const item of entries) await writerApi.saveFaceComponentAsset(slot, item.asset, item.dataUrl)
    },
    faceCatalogItemForSave: (item) => item,
    faceCatalogImagesForImport: (item) => [{ id: `sheet-${item.category}`, dataUrl: item.sheet.dataUrl }],
    initialCatalogTransform: () => ({ x: 50, y: 100, scaleX: 1, scaleY: 1, rotation: 0 }),
    createId: () => `catalog-${++id}`,
    now: () => '2026-10-29T00:00:00.000Z',
    ...overrides
  }
  return {
    calls,
    state,
    commands: createFaceComponentImportCommands(dependencies),
    setContextCurrent: (value) => { contextCurrent = value }
  }
}

test('asset batch saves entries in order and keeps them when the whole batch succeeds', async () => {
  const state = writer()
  await saveFaceComponentAssetBatch(state.api, 2, [entry('first'), entry('second')])

  assert.deepEqual(state.calls, [
    ['save', 2, 'first', 'data:first'],
    ['save', 2, 'second', 'data:second']
  ])
})

test('asset batch rolls back every attempted generated ID when a write fails', async () => {
  const state = writer({ failId: 'second' })

  await assert.rejects(saveFaceComponentAssetBatch(state.api, 2, [entry('first'), entry('second'), entry('third')]), /falha second/)
  assert.deepEqual(state.calls, [
    ['save', 2, 'first', 'data:first'],
    ['save', 2, 'second', 'data:second'],
    ['delete', 2, 'first'],
    ['delete', 2, 'second']
  ])
})

test('aborting between writes stops the batch and removes the completed write', async () => {
  const controller = new AbortController()
  const state = writer({ afterSave: async (id) => { if (id === 'first') controller.abort() } })

  await assert.rejects(saveFaceComponentAssetBatch(state.api, 2, [entry('first'), entry('second')], controller.signal), { name: 'AbortError' })
  assert.deepEqual(state.calls, [
    ['save', 2, 'first', 'data:first'],
    ['delete', 2, 'first']
  ])
})

test('an already aborted import is rejected before any asset operation', async () => {
  const controller = new AbortController()
  controller.abort()
  const state = writer()

  assert.throws(() => assertFaceComponentImportActive(controller.signal), { name: 'AbortError' })
  await assert.rejects(saveFaceComponentAssetBatch(state.api, 2, [entry('first')], controller.signal), { name: 'AbortError' })
  assert.deepEqual(state.calls, [])
})

test('import commands persist a mirrored eyebrow pair before selecting it', async () => {
  const { calls, state, commands } = importCommandsHarness()
  const event = { target: { files: [{ name: 'franja.png' }], value: 'selected' } }

  await commands.importEyebrow(event)

  assert.equal(event.target.value, '')
  assert.deepEqual(calls.filter(([name]) => name === 'save-batch' || name === 'save-asset'), [
    ['save-batch', 2, ['brow-left', 'brow-right'], false],
    ['save-asset', 2, 'brow-left', 'data:left'],
    ['save-asset', 2, 'brow-right', 'data:right']
  ])
  assert.equal(state.assets.length, 2)
  assert.deepEqual(state.selectedAssets, { 'brow-left': 'brow-left', 'brow-right': 'brow-right' })
  assert.equal(state.selectedPart, 'brow-left')
  assert.equal(state.libraryCategory, 'eyebrow')
  assert.equal(state.modal, null)
  assert.equal(state.busy, false)
})

test('eye sheet import registers all generated eye assets only after the batch completes', async () => {
  const { calls, state, commands } = importCommandsHarness({
    createEyeSheetImportPlan: ({ modelSlot }) => ({
      entries: [{ asset: { id: 'eye-left', modelSlot }, dataUrl: 'data:eye' }],
      assets: [{ id: 'eye-left', modelSlot, kind: 'eye', dataUrl: 'data:eye' }],
      assigned: { 'eye-left': 'eye-left' }
    })
  })
  const event = { target: { files: [{ name: 'olhos.png' }], value: 'selected' } }

  await commands.importEyeSheet(event)

  assert.equal(event.target.value, '')
  assert.equal(calls.some(([name]) => name === 'save-batch'), true)
  assert.deepEqual(state.selectedAssets, { 'eye-left': 'eye-left' })
  assert.equal(state.selectedPart, 'eye-left')
  assert.equal(state.libraryCategory, 'eye')
  assert.equal(state.modal, null)
  assert.equal(state.busy, false)
})

test('face detail import updates library and selection after the model slot accepts the asset', async () => {
  const { calls, state, commands } = importCommandsHarness()
  const event = { target: { files: [{ name: 'bochecha.png' }], value: 'selected' } }

  await commands.importFaceDetail('blush', event)

  assert.equal(calls.some(([name, slot, id]) => name === 'save-asset' && slot === 2 && id === 'blush-asset'), true)
  assert.equal(state.assets[0].id, 'blush-asset')
  assert.equal(state.details['blush-asset'].dataUrl, 'data:detail')
  assert.equal(calls.some(([name, kind, id]) => name === 'select-detail' && kind === 'blush' && id === 'blush-asset'), true)
  assert.equal(state.libraryCategory, 'blush')
  assert.equal(state.modal, null)
  assert.equal(state.busy, false)
})

test('late face import finishes its original slot save without leaking into the newly selected model', async () => {
  let finishSave
  const { calls, state, commands, setContextCurrent } = importCommandsHarness({
    api: {
      saveFaceComponentAsset: async (...args) => {
        calls.push(['save-asset', ...args.slice(0, 2).map((value) => typeof value === 'object' ? value.id : value), args[2]])
        await new Promise((resolve) => { finishSave = resolve })
      },
      deleteFaceComponentAsset: async () => {},
      saveFaceCatalogItem: async () => {}
    }
  })
  const event = { target: { files: [{ name: 'blush.png' }], value: 'selected' } }
  const pending = commands.importFaceDetail('blush', event)
  await new Promise((resolve) => setImmediate(resolve))
  setContextCurrent(false)
  finishSave()
  await pending

  assert.ok(calls.some((call) => call[0] === 'save-asset' && call[1] === 2))
  assert.deepEqual(state.assets, [])
  assert.deepEqual(state.details, {})
  assert.equal(state.libraryCategory, null)
  assert.equal(state.busy, false)
})

test('catalog import saves the normalized catalog and selects its saved slot item', async () => {
  const { calls, state, commands } = importCommandsHarness()
  const event = { target: { files: [{ name: 'nariz.png' }], value: 'selected' } }

  await commands.importCatalogSheet('nose', event)

  const saved = calls.find(([name]) => name === 'save-catalog')
  assert.deepEqual(saved, ['save-catalog', 2, 'catalog-1', 1])
  assert.equal(state.noseCatalog[0].id, 'catalog-1')
  assert.equal(state.noseDetails['catalog-1'].sheet.dataUrl, 'data:sheet')
  assert.equal(state.selectedNoseId, 'catalog-1')
  assert.equal(state.libraryCategory, 'nose')
  assert.equal(state.modal, null)
  assert.equal(state.busy, false)
})

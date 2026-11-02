import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { publishModelSourceResult } from '../src/renderer/src/features/fabricator/models/publishModelSourceResult.ts'

const current = {
  slot: 3,
  name: 'Modelo',
  sourceName: 'original.png',
  sourceAssetName: 'source-old',
  sourceDataUrl: 'data:old-source',
  modelSkinTone: 'light',
  modelOutlineColor: '#653333',
  width: 100,
  height: 150,
  tolerance: 74,
  chromaBaseTolerance: 74,
  chromaVersion: 1,
  parts: [{ id: 'old-part', dataUrl: 'data:old-part' }],
  joints: [],
  layerOrder: ['old-part'],
  updatedAt: '2026-10-01T00:00:00.000Z'
}

const result = {
  sourceDataUrl: 'data:new-source',
  previewDataUrl: 'data:preview',
  tolerance: 82,
  modelSkinTone: 'medium',
  modelOutlineColor: '#754444',
  parts: [
    { id: 'part-with-base', dataUrl: 'data:part-a', chromaBaseDataUrl: 'data:base-a' },
    { id: 'part-no-base', dataUrl: 'data:part-b' }
  ],
  joints: [{ id: 'joint-1' }],
  layerOrder: ['part-with-base', 'part-no-base'],
  hiddenPartIds: ['part-no-base']
}

function createHarness(overrides = {}) {
  const calls = []
  const dependencies = {
    current,
    canPublish: true,
    result,
    setPublishing: (value) => calls.push(['publishing', value]),
    setSaveState: (value) => calls.push(['saveState', value]),
    cancelScheduledSave: () => calls.push(['cancelSave']),
    persistProject: async (project) => calls.push(['persist', project.slot]),
    serializeProject: (project) => { calls.push(['serialize', project]); return { slot: project.slot, parts: project.parts.map(({ id }) => ({ id })) } },
    publish: async (project, sourceDataUrl, changedAssets) => { calls.push(['publish', project, sourceDataUrl, changedAssets]); return 'source-published' },
    clearHistory: () => calls.push(['clearHistory']),
    clearDirtyAssets: () => calls.push(['clearDirtyAssets']),
    clearDirtyChromaBases: () => calls.push(['clearDirtyChromaBases']),
    clearSeamSurfaces: () => calls.push(['clearSeamSurfaces']),
    setProject: (project) => calls.push(['setProject', project]),
    setChromaValue: (value) => calls.push(['chroma', value]),
    closeEditor: () => calls.push(['closeEditor']),
    broadcastModelSourceUpdate: (update) => calls.push(['modelSourceUpdated', update]),
    broadcastAssetsUpdated: () => calls.push(['assetsUpdated']),
    now: () => '2026-11-01T12:00:00.000Z',
    ...overrides
  }
  return { calls, dependencies }
}

test('persiste antes de publicar e só então atualiza a sessão e invalida caches', async () => {
  const { calls, dependencies } = createHarness()

  await publishModelSourceResult(dependencies)

  assert.deepEqual(calls.map(([kind]) => kind), [
    'publishing', 'saveState', 'cancelSave', 'persist', 'serialize', 'publish',
    'clearHistory', 'clearDirtyAssets', 'clearDirtyChromaBases', 'clearSeamSurfaces',
    'setProject', 'chroma', 'saveState', 'closeEditor', 'modelSourceUpdated', 'assetsUpdated', 'publishing'
  ])
  const serialized = calls.find(([kind]) => kind === 'serialize')[1]
  assert.equal(serialized.sourceDataUrl, 'data:new-source')
  assert.equal(serialized.chromaBaseTolerance, 0)
  assert.equal(serialized.chromaVersion, 2)
  assert.equal(serialized.updatedAt, '2026-11-01T12:00:00.000Z')
  const [publishCall] = calls.filter(([kind]) => kind === 'publish')
  assert.deepEqual(publishCall[3], [
    { id: 'part-with-base', dataUrl: 'data:part-a', chromaBaseDataUrl: 'data:base-a' },
    { id: 'part-no-base', dataUrl: 'data:part-b' }
  ])
  const published = calls.find(([kind]) => kind === 'setProject')[1]
  assert.equal(published.sourceAssetName, 'source-published')
  assert.deepEqual(calls.find(([kind]) => kind === 'modelSourceUpdated')[1], { slot: 3, sourceAssetName: 'source-published' })
})

test('recusa publicação sem projeto disponível antes de modificar estado', async () => {
  const { calls, dependencies } = createHarness({ current: null })

  await assert.rejects(publishModelSourceResult(dependencies), /O modelo não está disponível para edição/)

  assert.deepEqual(calls, [])
})

test('recusa publicação durante processamento e preserva o estado de sessão', async () => {
  const { calls, dependencies } = createHarness({ canPublish: false })

  await assert.rejects(publishModelSourceResult(dependencies), /O modelo não está disponível para edição/)

  assert.deepEqual(calls, [])
})

test('falha ao persistir interrompe publicação e deixa erro/busy coerentes', async () => {
  const failure = new Error('save indisponível')
  const { calls, dependencies } = createHarness({ persistProject: async () => { calls.push(['persist']); throw failure } })

  await assert.rejects(publishModelSourceResult(dependencies), failure)

  assert.equal(calls.some(([kind]) => kind === 'publish'), false)
  assert.equal(calls.some(([kind]) => kind === 'setProject'), false)
  assert.deepEqual(calls.slice(-3), [['persist'], ['saveState', 'error'], ['publishing', false]])
})

test('falha do catálogo propagada sem publicar estado localmente', async () => {
  const failure = new Error('atomic publish falhou')
  const { calls, dependencies } = createHarness({ publish: async () => { calls.push(['publish']); throw failure } })

  await assert.rejects(publishModelSourceResult(dependencies), failure)

  assert.equal(calls.some(([kind]) => kind === 'setProject'), false)
  assert.equal(calls.some(([kind]) => kind === 'clearHistory'), false)
  assert.deepEqual(calls.slice(-2), [['saveState', 'error'], ['publishing', false]])
})

test('FabricatorPage passa o projeto mais recente e delega a publicação ao serviço dono', async () => {
  const page = await readFile(new URL('../src/renderer/src/features/fabricator/FabricatorPage.tsx', import.meta.url), 'utf8')

  assert.match(page, /return publishModelSourceResult\(/)
  assert.match(page, /current: projectRef\.current/)
  assert.match(page, /window\.desktop\.fabricator\.publishFabricatorModelSource\(serialized, sourceDataUrl, changedAssets\)/)
})

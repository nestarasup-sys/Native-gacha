import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { startCustomizerSourceCatalogLoad } from '../src/renderer/src/features/customizer/useCustomizerSourceCatalog.ts'

const pageUrl = new URL('../src/renderer/src/features/customizer/CustomizerPage.tsx', import.meta.url)
const hookUrl = new URL('../src/renderer/src/features/customizer/useCustomizerSourceCatalog.ts', import.meta.url)

function deferred() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

function makeHarness({ listModels = async () => [], listPoses = async () => [] } = {}) {
  const events = []
  const state = { models: [], poses: [], loading: true, error: '', previewLoading: true }
  const requestRef = { current: 8 }
  const task = startCustomizerSourceCatalogLoad({
    requestRef,
    listModels: () => { events.push(['list-models']); return listModels() },
    listPoses: () => { events.push(['list-poses']); return listPoses() },
    setModels: (models) => { events.push(['models', models]); state.models = models },
    setPoses: (poses) => { events.push(['poses', poses]); state.poses = poses },
    setLoading: (loading) => { events.push(['loading', loading]); state.loading = loading },
    setError: (error) => { events.push(['error', error]); state.error = error },
    setPreviewLoading: (loading) => { events.push(['preview-loading', loading]); state.previewLoading = loading }
  })
  return { ...task, events, requestRef, state }
}

test('carrega modelos e poses em paralelo e publica ambas as listas antes de encerrar loading', async () => {
  const model = { slot: 1, name: 'Modelo 01' }
  const pose = { slot: 1, sourceModelSlot: 1, name: 'Em pé', sourceModelName: 'Modelo 01', partCount: 8, updatedAt: 'today' }
  const modelsPending = deferred()
  const posesPending = deferred()
  const harness = makeHarness({ listModels: () => modelsPending.promise, listPoses: () => posesPending.promise })

  assert.deepEqual(harness.events, [['list-models'], ['list-poses']])
  modelsPending.resolve([model])
  posesPending.resolve([pose])
  await harness.completion

  assert.deepEqual(harness.state.models, [model])
  assert.deepEqual(harness.state.poses, [pose])
  assert.equal(harness.state.loading, false)
  assert.deepEqual(harness.events.slice(-3), [['models', [model]], ['poses', [pose]], ['loading', false]])
})

test('falha de qualquer leitura informa erro, interrompe preview e encerra loading', async () => {
  const harness = makeHarness({ listModels: async () => { throw new Error('catálogo bloqueado') } })

  await harness.completion

  assert.equal(harness.state.error, 'catálogo bloqueado')
  assert.equal(harness.state.previewLoading, false)
  assert.equal(harness.state.loading, false)
  assert.deepEqual(harness.state.models, [])
  assert.deepEqual(harness.state.poses, [])
})

test('falha não Error usa mensagem de fallback do catálogo', async () => {
  const harness = makeHarness({ listPoses: async () => { throw 'falha sem Error' } })

  await harness.completion

  assert.equal(harness.state.error, 'Não foi possível carregar o catálogo.')
  assert.equal(harness.state.previewLoading, false)
  assert.equal(harness.state.loading, false)
})

test('cancelamento ao desmontar invalida preview e ignora respostas tardias', async () => {
  const modelsPending = deferred()
  const posesPending = deferred()
  const harness = makeHarness({ listModels: () => modelsPending.promise, listPoses: () => posesPending.promise })
  harness.cancel()
  modelsPending.resolve([{ slot: 1, name: 'Modelo antigo' }])
  posesPending.resolve([{ slot: 1, sourceModelSlot: 1, name: 'Pose', sourceModelName: 'Base', partCount: 5, updatedAt: 'today' }])
  await harness.completion

  assert.equal(harness.requestRef.current, 9)
  assert.deepEqual(harness.state.models, [])
  assert.deepEqual(harness.state.poses, [])
  assert.equal(harness.state.loading, true)
  assert.equal(harness.state.previewLoading, true)
  assert.deepEqual(harness.events, [['list-models'], ['list-poses']])
})

test('CustomizerPage delega a carga inicial ao hook sem duplicar a leitura do catálogo', async () => {
  const page = await readFile(pageUrl, 'utf8')
  const hook = await readFile(hookUrl, 'utf8')

  assert.match(page, /useCustomizerSourceCatalog\(\{[\s\S]*?requestRef: previewLoadRequest,[\s\S]*?setModels: setCatalogModels,[\s\S]*?setPoses: setCatalogPoses,[\s\S]*?setLoading: setCatalogLoading/)
  assert.doesNotMatch(page, /Promise\.all\(\[window\.desktop\.fabricator\.listFabricatorSlots\(\)/)
  assert.match(hook, /listModels: \(\) => window\.desktop\.fabricator\.listFabricatorSlots\(\)/)
  assert.match(hook, /listPoses: \(\) => window\.desktop\.fabricator\.listFabricatorPoseSlots\(\)/)
  assert.match(hook, /return task\.cancel/)
})

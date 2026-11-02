import test from 'node:test'
import assert from 'node:assert/strict'
import { saveCustomizerCharacter } from '../src/renderer/src/features/customizer/customizerCharacterSaveCommand.ts'

const character = (id, version = 0) => ({
  id,
  name: 'Personagem',
  customization: { version },
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z'
})

function deferred() {
  let resolve
  let reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

function createHarness({ initial = [character('one')], persistCharacter, loadCharacters } = {}) {
  const calls = []
  const state = { characters: initial, error: 'erro anterior', saveState: 'saved', notifications: 0 }
  const charactersRef = { current: initial }
  const saveQueue = { current: new Map() }
  const deletionsInProgress = new Set()
  const dependencies = {
    charactersRef,
    saveQueue,
    deletionsInProgress,
    setCharacters: (characters) => { calls.push(['characters', characters]); state.characters = characters },
    setCharactersError: (message) => { calls.push(['error', message]); state.error = message },
    setCharacterSaveState: (value) => { calls.push(['save-state', value]); state.saveState = value },
    persistCharacter: persistCharacter ?? (async (value) => calls.push(['persist', value.customization.version])),
    loadCharacters: loadCharacters ?? (async () => { calls.push(['load-latest']); return initial }),
    notifyCharactersUpdated: () => { calls.push(['notify']); state.notifications += 1 }
  }
  return {
    calls, state, charactersRef, saveQueue, deletionsInProgress,
    save: (value) => saveCustomizerCharacter(value, dependencies)
  }
}

test('atualiza a cópia local otimisticamente e notifica somente após persistir', async () => {
  const first = character('one')
  const next = character('one', 1)
  const { calls, state, charactersRef, saveQueue, save } = createHarness({ initial: [first] })

  await save(next)

  assert.equal(charactersRef.current[0], next)
  assert.equal(state.characters[0], next)
  assert.equal(state.error, '')
  assert.equal(state.saveState, 'saved')
  assert.equal(state.notifications, 1)
  assert.equal(saveQueue.current.has('one'), false)
  assert.deepEqual(calls.map(([name]) => name), ['error', 'save-state', 'characters', 'persist', 'save-state', 'error', 'notify'])
})

test('falha persiste o erro e recupera o roster mais recente do serviço', async () => {
  const serverSnapshot = [character('one', 2), character('two')]
  const { calls, state, charactersRef, save, saveQueue } = createHarness({
    persistCharacter: async () => { throw new Error('disco indisponível') },
    loadCharacters: async () => { calls.push(['load-latest']); return serverSnapshot }
  })

  await save(character('one', 1))

  assert.equal(state.error, 'disco indisponível')
  assert.equal(state.saveState, 'error')
  assert.equal(state.characters, serverSnapshot)
  assert.equal(charactersRef.current, serverSnapshot)
  assert.equal(saveQueue.current.has('one'), false)
  assert.equal(state.notifications, 0)
  assert.deepEqual(calls.map(([name]) => name), ['error', 'save-state', 'characters', 'save-state', 'error', 'load-latest', 'characters'])
})

test('falha ao recarregar roster mantém o estado otimista e não mascara erro do save', async () => {
  const next = character('one', 1)
  const { state, charactersRef, save } = createHarness({
    persistCharacter: async () => { throw new Error('save falhou') },
    loadCharacters: async () => { throw new Error('reload falhou') }
  })

  await save(next)

  assert.equal(state.error, 'save falhou')
  assert.equal(state.characters[0], next)
  assert.equal(charactersRef.current[0], next)
})

test('gravações do mesmo personagem serializam por ID e a última escrita preserva a fila', async () => {
  const first = deferred()
  const started = []
  const { save, saveQueue, state } = createHarness({ persistCharacter: async (value) => {
    started.push(value.customization.version)
    if (value.customization.version === 1) await first.promise
  } })

  const older = save(character('one', 1))
  const newer = save(character('one', 2))
  await new Promise((resolve) => setImmediate(resolve))
  assert.deepEqual(started, [1])
  assert.equal(saveQueue.current.has('one'), true)

  first.resolve()
  await Promise.all([older, newer])

  assert.deepEqual(started, [1, 2])
  assert.equal(saveQueue.current.has('one'), false)
  assert.equal(state.characters[0].customization.version, 2)
})

test('falha antiga não bloqueia a escrita seguinte do mesmo personagem', async () => {
  const started = []
  const { save, state, saveQueue } = createHarness({ persistCharacter: async (value) => {
    started.push(value.customization.version)
    if (value.customization.version === 1) throw new Error('falha antiga')
  } })

  await Promise.all([save(character('one', 1)), save(character('one', 2))])

  assert.deepEqual(started, [1, 2])
  assert.equal(state.error, '')
  assert.equal(state.saveState, 'saved')
  assert.equal(saveQueue.current.has('one'), false)
})

test('não salva nem publica alterações enquanto o personagem está sendo excluído', async () => {
  const { calls, deletionsInProgress, state, saveQueue, save } = createHarness()
  deletionsInProgress.add('one')

  await save(character('one', 1))

  assert.equal(calls.length, 0)
  assert.equal(state.characters[0].customization.version, 0)
  assert.equal(saveQueue.current.has('one'), false)
})

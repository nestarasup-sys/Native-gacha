import test from 'node:test'
import assert from 'node:assert/strict'
import { createCustomizerCharacterRosterCommands } from '../src/renderer/src/features/customizer/customizerCharacterRosterCommands.ts'

const character = (id, name = id) => ({ id, name, customization: {}, createdAt: 'now', updatedAt: 'now' })

function createState(initial = []) {
  const state = {
    characters: initial,
    selectedId: initial[0]?.id ?? '',
    activeModule: 'Cabelos',
    error: 'erro antigo',
    notifications: 0,
    deletionsInProgress: new Set()
  }
  const charactersRef = { current: initial }
  const saveQueue = { current: new Map() }
  const api = {
    createCustomizerCharacter: async (name) => character('created', name),
    deleteCustomizerCharacter: async () => {}
  }
  const commands = createCustomizerCharacterRosterCommands({
    api,
    charactersRef,
    saveQueue,
    deletionsInProgress: { current: state.deletionsInProgress },
    deletionOperations: { current: new Map() },
    setCharacters: (value) => { state.characters = value },
    setSelectedCharacterId: (value) => { state.selectedId = value },
    setActiveModule: (value) => { state.activeModule = value },
    setCharactersError: (value) => { state.error = value },
    notifyCharactersUpdated: () => { state.notifications += 1 }
  })
  return { state, charactersRef, saveQueue, api, commands }
}

function deferred() {
  let resolve
  let reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

test('criar personagem publica o roster, seleciona o novo personagem e notifica o Studio', async () => {
  const { state, charactersRef, commands } = createState([character('existing')])

  const created = await commands.createCharacter('Nina')

  assert.equal(created.id, 'created')
  assert.deepEqual(state.characters.map((item) => item.id), ['existing', 'created'])
  assert.equal(charactersRef.current, state.characters)
  assert.equal(state.selectedId, 'created')
  assert.equal(state.activeModule, null)
  assert.equal(state.error, '')
  assert.equal(state.notifications, 1)
})

test('excluir aguarda o salvamento pendente antes do IPC e atualiza o roster depois', async () => {
  const first = character('first')
  const next = character('next')
  const { state, charactersRef, saveQueue, api, commands } = createState([first, next])
  const pendingSave = deferred()
  const calls = []
  saveQueue.current.set(first.id, pendingSave.promise)
  api.deleteCustomizerCharacter = async (id) => { calls.push(['delete', id]) }

  const deletion = commands.deleteCharacter(first.id)
  assert.deepEqual(calls, [])
  assert.equal(state.deletionsInProgress.has(first.id), true)
  pendingSave.resolve()
  await deletion

  assert.deepEqual(calls, [['delete', first.id]])
  assert.deepEqual(state.characters, [next])
  assert.equal(charactersRef.current, state.characters)
  assert.equal(state.selectedId, next.id)
  assert.equal(state.activeModule, null)
  assert.equal(state.error, '')
  assert.equal(state.notifications, 1)
  assert.equal(state.deletionsInProgress.has(first.id), false)
})

test('falha de exclusão preserva o personagem e libera novas operações', async () => {
  const first = character('first')
  const { state, charactersRef, api, commands } = createState([first])
  api.deleteCustomizerCharacter = async () => { throw new Error('falha de exclusão') }

  await assert.rejects(commands.deleteCharacter(first.id), /falha de exclusão/)
  assert.deepEqual(state.characters, [first])
  assert.equal(charactersRef.current[0], first)
  assert.equal(state.notifications, 0)
  assert.equal(state.deletionsInProgress.has(first.id), false)
})

test('exclusões concorrentes do mesmo personagem compartilham uma única operação', async () => {
  const first = character('first')
  const { saveQueue, state, api, commands } = createState([first])
  const pendingSave = deferred()
  const pendingDelete = deferred()
  const deleteStarted = deferred()
  const calls = []
  saveQueue.current.set(first.id, pendingSave.promise)
  api.deleteCustomizerCharacter = async (id) => { calls.push(id); deleteStarted.resolve(); await pendingDelete.promise }

  const firstDelete = commands.deleteCharacter(first.id)
  const secondDelete = commands.deleteCharacter(first.id)
  assert.equal(secondDelete, firstDelete)
  assert.deepEqual(calls, [])
  pendingSave.resolve()
  await deleteStarted.promise
  assert.deepEqual(calls, [first.id])
  pendingDelete.resolve()
  await firstDelete

  assert.equal(state.notifications, 1)
})

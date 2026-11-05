import test from 'node:test'
import assert from 'node:assert/strict'
import { isCharacterSheet, createCharacterSheetsService } from '../electron/domains/roteiros/characterSheetsService.ts'
import { registerCharacterSheetsHandlers } from '../electron/domains/roteiros/characterSheetsIpc.ts'

const validSheet = () => ({ characterId: 'customizer-id', characterName: 'Íris', personality: '', backstory: '', fynRelationship: '', speakingStyle: '', relationships: [], additionalRules: '', updatedAt: '' })

test('ficha aceita campos vazios, valida relações e rejeita valores fora dos limites', () => {
  assert.equal(isCharacterSheet(validSheet()), true)
  assert.equal(isCharacterSheet({ ...validSheet(), relationships: [{ id: 'r1', targetCharacterId: 'c2', description: '' }] }), true)
  assert.equal(isCharacterSheet({ ...validSheet(), personality: 'x'.repeat(12001) }), false)
  assert.equal(isCharacterSheet({ ...validSheet(), relationships: [{ id: '', targetCharacterId: '', description: '' }] }), false)
})

test('serviço grava no catálogo por fila e atualiza o nome atual do personagem', async () => {
  const saved = []
  const calls = []
  const database = { prepare: () => ({ run: (...args) => { saved.push(args) } }) }
  const service = createCharacterSheetsService({
    getDatabase: () => database, waitForPendingWrites: async () => {},
    enqueueWrite: async (operation) => { calls.push('queued'); return operation() }
  })
  await service.save(validSheet())
  assert.equal(saved.length, 1)
  assert.equal(calls.length, 1)
  assert.equal(saved[0][0], 'customizer-id')
  assert.equal(saved[0][1], 'Íris')
  assert.match(saved[0][8], /^\d{4}-\d\d-/)
})

test('IPC de fichas verifica a origem antes de listar ou salvar', async () => {
  const handlers = new Map()
  let trusted = false
  registerCharacterSheetsHandlers({ ipcMain: { handle: (name, handler) => handlers.set(name, handler) }, assertTrustedSender: () => { if (!trusted) throw new Error('untrusted') }, service: { list: async () => [], save: async () => {} } })
  await assert.rejects(handlers.get('roteiros:character-sheets:list')({}), /untrusted/)
  await assert.rejects(handlers.get('roteiros:character-sheets:save')({}, validSheet()), /untrusted/)
  trusted = true
  assert.deepEqual(await handlers.get('roteiros:character-sheets:list')({}), [])
  await handlers.get('roteiros:character-sheets:save')({}, validSheet())
})

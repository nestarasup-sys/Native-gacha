import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createOptionsBackupCommands } from '../src/renderer/src/features/options/optionsBackupCommands.ts'

const backup = { id: 'backup-1', createdAt: '2026-11-01T00:00:00.000Z', fileCount: 2, byteLength: 1024, verifiedAt: null }

function createHarness(overrides = {}) {
  const calls = []
  const dependencies = {
    createBackup: async () => { calls.push(['create']); return { ...backup, valid: true } },
    verifyBackup: async (id) => { calls.push(['verify', id]); return { ...backup, valid: true } },
    restoreBackup: async (id) => { calls.push(['restore', id]); return { cancelled: false } },
    deleteBackup: async (id) => { calls.push(['delete', id]); return { deleted: true } },
    refreshBackups: async () => { calls.push(['refresh']) },
    setBusy: (value) => calls.push(['busy', value]),
    setMessage: (value) => calls.push(['message', value]),
    setError: (value) => calls.push(['error', value]),
    ...overrides
  }
  return { calls, commands: createOptionsBackupCommands(dependencies) }
}

test('cria backup verificado, informa a contagem e atualiza a lista', async () => {
  const { calls, commands } = createHarness()

  await commands.create()

  assert.deepEqual(calls, [
    ['busy', true], ['error', null], ['message', null], ['create'],
    ['message', 'Backup criado e verificado · 2 arquivos · 1 KB.'], ['refresh'], ['busy', false]
  ])
})

test('verifica integridade e atualiza a lista do mesmo backup', async () => {
  const { calls, commands } = createHarness()

  await commands.verify(backup)

  assert.deepEqual(calls, [
    ['busy', true], ['error', null], ['message', null], ['verify', 'backup-1'],
    ['message', 'Backup íntegro: 2 arquivos e catálogo SQLite verificados.'], ['refresh'], ['busy', false]
  ])
})

test('backup inválido informa falha de validação sem deixar de atualizar a lista', async () => {
  const { calls, commands } = createHarness({ verifyBackup: async () => ({ ...backup, valid: false }) })

  await commands.verify(backup)

  assert.equal(calls.some(([kind, message]) => kind === 'message' && message === 'O backup não passou na validação.'), true)
  assert.equal(calls.some(([kind]) => kind === 'refresh'), true)
})

test('restauração cancelada informa que os dados atuais ficaram intactos e não recarrega a lista', async () => {
  let restoredId = null
  const { calls, commands } = createHarness({ restoreBackup: async (id) => { restoredId = id; return { cancelled: true } } })

  await commands.restore(backup)

  assert.equal(restoredId, 'backup-1')
  assert.deepEqual(calls, [
    ['busy', true], ['error', null], ['message', null],
    ['message', 'Restauração cancelada; os dados atuais não foram alterados.'], ['busy', false]
  ])
})

test('restauração preparada avisa que o aplicativo reiniciará', async () => {
  const { calls, commands } = createHarness()

  await commands.restore(backup)

  assert.equal(calls.some(([kind, message]) => kind === 'message' && message === 'Backup preparado. O aplicativo vai reiniciar para aplicar e verificar a restauração.'), true)
  assert.equal(calls.some(([kind]) => kind === 'refresh'), false)
})

test('exclusão cancelada mantém a lista atualizada e informa o resultado', async () => {
  const { calls, commands } = createHarness({ deleteBackup: async () => ({ deleted: false }) })

  await commands.remove(backup)

  assert.equal(calls.some(([kind, message]) => kind === 'message' && message === 'Exclusão cancelada.'), true)
  assert.equal(calls.some(([kind]) => kind === 'refresh'), true)
})

test('erro de serviço libera busy e apresenta a mensagem sem atualizar a lista', async () => {
  const { calls, commands } = createHarness({ createBackup: async () => { throw new Error('espaço insuficiente') } })

  await commands.create()

  assert.deepEqual(calls.slice(-2), [['error', 'espaço insuficiente'], ['busy', false]])
  assert.equal(calls.some(([kind]) => kind === 'refresh'), false)
})

test('OptionsPage delega todas as ações de backup ao comando da feature', async () => {
  const page = await readFile(new URL('../src/renderer/src/features/options/OptionsPage.tsx', import.meta.url), 'utf8')

  assert.match(page, /createOptionsBackupCommands\(/)
  assert.match(page, /const createBackup = backupCommands\.create/)
  assert.match(page, /const verifyBackup = backupCommands\.verify/)
  assert.match(page, /const restoreBackup = backupCommands\.restore/)
  assert.match(page, /const deleteBackup = backupCommands\.remove/)
})

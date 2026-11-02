import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createOptionsMigrationCommands } from '../src/renderer/src/features/options/optionsMigrationCommands.ts'

function createHarness(overrides = {}) {
  const calls = []
  const dependencies = {
    runMigration: async () => { calls.push(['run']) },
    pauseMigration: async () => { calls.push(['pause']) },
    restartAfterMigration: async () => { calls.push(['restart']) },
    refreshMigration: async () => { calls.push(['refresh']) },
    setBusy: (value) => calls.push(['busy', value]),
    setPauseRequested: (value) => calls.push(['pauseRequested', value]),
    setProgress: (value) => calls.push(['progress', value]),
    setError: (value) => calls.push(['error', value]),
    ...overrides
  }
  return { calls, commands: createOptionsMigrationCommands(dependencies) }
}

test('inicia migração, atualiza resumo e limpa estado transitório na ordem existente', async () => {
  const { calls, commands } = createHarness()

  await commands.run()

  assert.deepEqual(calls, [
    ['busy', true], ['pauseRequested', false], ['error', null], ['progress', null],
    ['run'], ['refresh'], ['busy', false], ['pauseRequested', false], ['progress', null]
  ])
})

test('falha da migração informa a causa e sempre encerra estado transitório', async () => {
  const { calls, commands } = createHarness({ runMigration: async () => { throw new Error('falha do domínio') } })

  await commands.run()

  assert.equal(calls.some(([kind, value]) => kind === 'error' && value === 'falha do domínio'), true)
  assert.equal(calls.some(([kind]) => kind === 'refresh'), false)
  assert.deepEqual(calls.slice(-3), [['busy', false], ['pauseRequested', false], ['progress', null]])
})

test('falha sem objeto Error preserva a mensagem de recuperação segura', async () => {
  const { calls, commands } = createHarness({ runMigration: async () => { throw 'offline' } })

  await commands.run()

  assert.equal(calls.some(([kind, value]) => kind === 'error' && value === 'A migração foi interrompida; os dados de origem foram preservados.'), true)
})

test('solicita pausa sem limpar a solicitação antes do evento de progresso', async () => {
  const { calls, commands } = createHarness()

  await commands.pause()

  assert.deepEqual(calls, [['pauseRequested', true], ['pause']])
})

test('erro ao solicitar pausa mantém a sinalização e exibe a falha', async () => {
  const { calls, commands } = createHarness({ pauseMigration: async () => { throw new Error('não foi possível pausar') } })

  await commands.pause()

  assert.deepEqual(calls, [['pauseRequested', true], ['error', 'não foi possível pausar']])
})

test('reiniciar limpa erro anterior e delega a reinicialização', async () => {
  const { calls, commands } = createHarness()

  await commands.restart()

  assert.deepEqual(calls, [['error', null], ['restart']])
})

test('falha ao reiniciar apresenta a mensagem específica', async () => {
  const { calls, commands } = createHarness({ restartAfterMigration: async () => { throw new Error('reinício recusado') } })

  await commands.restart()

  assert.deepEqual(calls, [['error', null], ['error', 'reinício recusado']])
})

test('OptionsPage delega as ações da migração ao módulo da feature', async () => {
  const page = await readFile(new URL('../src/renderer/src/features/options/OptionsPage.tsx', import.meta.url), 'utf8')

  assert.match(page, /createOptionsMigrationCommands\(/)
  assert.match(page, /const runMigration = migrationCommands\.run/)
  assert.match(page, /const requestPause = migrationCommands\.pause/)
  assert.match(page, /const restart = migrationCommands\.restart/)
})

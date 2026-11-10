import test from 'node:test'
import assert from 'node:assert/strict'
import { createEditorV6ProjectExitCommand } from '../src/renderer/src/features/editorV6/editorV6ProjectExit.ts'

function createHarness(overrides = {}) {
  const events = []
  const command = createEditorV6ProjectExitCommand({
    flushWrites: async () => { events.push('flush') },
    pausePlayback: () => events.push('pause'),
    clearActiveProject: () => events.push('clear-project'),
    clearActiveTool: () => events.push('clear-tool'),
    clearSelection: () => events.push('clear-selection'),
    exitFullView: () => events.push('exit-full-view'),
    setError: (message) => events.push(['error', message]),
    ...overrides
  })
  return { command, events }
}

test('só encerra o editor depois que todas as gravações pendentes forem drenadas', async () => {
  const { command, events } = createHarness()

  await command()

  assert.deepEqual(events, ['flush', 'pause', 'clear-project', 'clear-tool', 'clear-selection', 'exit-full-view'])
})

test('falha ao drenar gravações mantém o editor ativo e mostra a causa', async () => {
  const { command, events } = createHarness({
    flushWrites: async () => { events.push('flush'); throw new Error('fila não concluiu') }
  })

  await command()

  assert.deepEqual(events, ['flush', ['error', 'Não foi possível sair do projeto porque o salvamento falhou: fila não concluiu']])
})

test('falha não textual mantém a mensagem de recuperação padrão', async () => {
  const { command, events } = createHarness({
    flushWrites: async () => { throw 'falha desconhecida' }
  })

  await command()

  assert.deepEqual(events, [['error', 'Não foi possível sair do projeto porque o salvamento falhou.']])
})

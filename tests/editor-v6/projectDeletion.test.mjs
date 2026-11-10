import assert from 'node:assert/strict'
import test from 'node:test'
import { createEditorV6ProjectDeletionCommand } from '../../src/renderer/src/features/editorV6/editorV6ProjectDeletion.ts'

function makeHarness(overrides = {}) {
  const events = []
  let selectedProjectId = 'project-active'
  const dependencies = {
    activeProjectId: 'project-active',
    activeProjectIdRef: { current: 'project-active' },
    flushDocumentWrites: async () => { events.push('flush') },
    deleteProject: async (id) => { events.push(['delete', id]) },
    removeSummary: (id) => events.push(['remove-summary', id]),
    setSelectedProject: (update) => { selectedProjectId = update(selectedProjectId); events.push(['selected', selectedProjectId]) },
    pausePlayback: () => events.push('pause'),
    setActiveProjectId: (id) => events.push(['active-project', id]),
    setSaved: (saved) => events.push(['saved', saved]),
    setError: (message) => events.push(['error', message]),
    trackOperation: (operation) => {
      events.push('operation-start')
      return Promise.resolve().then(operation).finally(() => events.push('operation-end'))
    },
    ...overrides
  }
  return { command: createEditorV6ProjectDeletionCommand(dependencies), dependencies, events, getSelectedProjectId: () => selectedProjectId }
}

test('faz flush do projeto ativo antes de apagar e só então limpa o estado da tela', async () => {
  const { command, events } = makeHarness()

  await command({ id: 'project-active', title: 'Editor V6 01' })

  assert.deepEqual(events, [
    'operation-start', 'flush', ['delete', 'project-active'], ['remove-summary', 'project-active'],
    ['selected', null], 'pause', ['active-project', null], ['saved', true], ['error', null], 'operation-end'
  ])
})

test('não faz flush nem encerra o projeto ativo ao apagar outro projeto', async () => {
  const { command, events, getSelectedProjectId } = makeHarness()

  await command({ id: 'project-other', title: 'Editor V6 02' })

  assert.equal(events.includes('flush'), false)
  assert.equal(events.includes('pause'), false)
  assert.equal(getSelectedProjectId(), 'project-active')
  assert.deepEqual(events.filter((event) => Array.isArray(event)), [
    ['delete', 'project-other'], ['remove-summary', 'project-other'], ['selected', 'project-active'], ['saved', true], ['error', null]
  ])
})

test('mantém projeto e resumo se o flush do projeto ativo falhar', async () => {
  const failure = new Error('falha sintética ao salvar')
  const { command, events, getSelectedProjectId } = makeHarness({ flushDocumentWrites: async () => { events.push('flush'); throw failure } })

  await command({ id: 'project-active', title: 'Editor V6 01' })

  assert.equal(events.some((event) => Array.isArray(event) && event[0] === 'delete'), false)
  assert.equal(events.some((event) => Array.isArray(event) && event[0] === 'remove-summary'), false)
  assert.equal(getSelectedProjectId(), 'project-active')
  assert.ok(events.some((event) => Array.isArray(event) && event[0] === 'error' && event[1] === failure.message))
})

test('não agenda operação para uma seleção ausente', async () => {
  const { command, events } = makeHarness()

  await command(null)

  assert.deepEqual(events, [])
})

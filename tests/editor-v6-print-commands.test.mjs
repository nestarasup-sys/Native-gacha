import test from 'node:test'
import assert from 'node:assert/strict'
import { createEditorV6PrintCommands } from '../src/renderer/src/features/editorV6/editorV6PrintCommands.ts'

const project = { id: '00000000-0000-4000-8000-000000000001' }

function createHarness(overrides = {}) {
  const events = []
  const state = { error: 'erro anterior', notice: null }
  const actions = {
    flushDocumentWrites: async () => {},
    getFrame: () => 91,
    captureFrame: async () => 'data:image/png;base64,AQID',
    savePrint: async () => 'editor-v6/prints/print.png',
    openPrints: async () => {},
    ...overrides
  }
  const commands = createEditorV6PrintCommands({
    trackOperation: async (operation) => { events.push('operation:start'); const result = await operation(); events.push('operation:end'); return result },
    flushDocumentWrites: async (...args) => { events.push('flush'); return actions.flushDocumentWrites(...args) },
    getFrame: (...args) => { events.push('frame'); return actions.getFrame(...args) },
    captureFrame: async (...args) => { events.push(['capture', ...args.slice(1)]); return actions.captureFrame(...args) },
    savePrint: async (...args) => { events.push(['save', ...args]); return actions.savePrint(...args) },
    openPrints: async (...args) => { events.push(['open', ...args]); return actions.openPrints(...args) },
    setError: (message) => { events.push(['error', message]); state.error = message },
    setNotice: (message) => { events.push(['notice', message]); state.notice = message }
  })
  return { events, state, commands }
}

test('exportação faz flush, captura o quadro atual em resolução nativa e salva antes do aviso', async () => {
  const { events, state, commands } = createHarness({
    flushDocumentWrites: async () => { events.push('flush:complete') },
    getFrame: () => { events.push('frame:read'); return 143 }
  })

  await commands.exportPrint(project)

  assert.deepEqual(events, [
    'operation:start', 'flush', 'flush:complete', 'frame', 'frame:read',
    ['capture', 143, 1920, 1080, 'image/png'],
    ['save', project.id, 'data:image/png;base64,AQID'],
    ['error', null], ['notice', 'Print salvo em editor-v6/prints/print.png'], 'operation:end'
  ])
  assert.equal(state.error, null)
  assert.equal(state.notice, 'Print salvo em editor-v6/prints/print.png')
})

test('falha no flush interrompe a captura e mantém o erro da gravação', async () => {
  const { events, state, commands } = createHarness({
    flushDocumentWrites: async () => { throw new Error('falha ao salvar o projeto') }
  })

  await commands.exportPrint(project)

  assert.deepEqual(events, ['operation:start', 'flush', ['error', 'falha ao salvar o projeto'], 'operation:end'])
  assert.equal(state.notice, null)
})

test('falha ao capturar impede salvar e mostra o erro do renderer', async () => {
  const { events, state, commands } = createHarness({
    captureFrame: async () => { throw new Error('captura indisponível') }
  })

  await commands.exportPrint(project)

  assert.equal(state.error, 'captura indisponível')
  assert.equal(events.some((event) => Array.isArray(event) && event[0] === 'save'), false)
  assert.equal(state.notice, null)
})

test('sem projeto ativo, exportação não inicia operação', () => {
  const { events, commands } = createHarness()

  assert.equal(commands.exportPrint(null), undefined)
  assert.deepEqual(events, [])
})

test('abrir a pasta usa o tracker e apresenta falha do IPC', async () => {
  const { events, state, commands } = createHarness({
    openPrints: async () => { throw new Error('pasta indisponível') }
  })

  await commands.openPrints(project.id)

  assert.deepEqual(events, ['operation:start', ['open', project.id], ['error', 'pasta indisponível'], 'operation:end'])
  assert.equal(state.error, 'pasta indisponível')
})

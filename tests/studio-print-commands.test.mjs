import test from 'node:test'
import assert from 'node:assert/strict'
import { makeCanvasPrint } from '../src/renderer/src/features/studio/studioCanvasPrint.ts'
import { createStudioPrintCommands } from '../src/renderer/src/features/studio/studioPrintCommands.ts'
import { registerStudioFileHandlers } from '../electron/domains/studio/fileIpc.ts'
import { studioIpcChannels } from '../src/shared/studioIpcChannels.ts'

const studioId = '00000000-0000-4000-8000-000000000001'
const studio = {
  schemaVersion: 1,
  id: studioId,
  title: 'Cena sintética',
  color: '#ffffff',
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
  backgroundColor: '#123456',
  backgroundAssetId: null,
  backgroundX: 0,
  backgroundY: 0,
  backgroundWidth: 100,
  backgroundHeight: 100,
  backgroundRotation: 0,
  assets: [],
  elements: []
}

function createCommandHarness(overrides = {}) {
  const events = []
  const state = { error: 'erro anterior', notice: null }
  const actions = {
    flushDocumentWrites: async () => {},
    renderPrint: async () => 'data:image/png;base64,AQID',
    savePrint: async () => 'studio/prints/print.png',
    openPrints: async () => {},
    ...overrides
  }
  const dependencies = {
    trackOperation: async (operation) => {
      events.push('operation:start')
      const result = await operation()
      events.push('operation:end')
      return result
    },
    flushDocumentWrites: async (...args) => { events.push('flush'); return actions.flushDocumentWrites(...args) },
    renderPrint: async (...args) => { events.push('render'); return actions.renderPrint(...args) },
    savePrint: async (...args) => { events.push('save'); return actions.savePrint(...args) },
    trackIpcWrite: (operation) => { events.push('track:ipc'); return operation },
    openPrints: async (...args) => { events.push('open'); return actions.openPrints(...args) },
    setError: (message) => { events.push(['error', message]); state.error = message },
    setNotice: (message) => { events.push(['notice', message]); state.notice = message }
  }
  return { events, state, commands: createStudioPrintCommands(dependencies) }
}

test('exportação mantém flush → renderização → gravação e só então mostra o caminho', async () => {
  const { events, state, commands } = createCommandHarness()

  await commands.exportPrint(studio)

  assert.deepEqual(events, [
    'operation:start', 'flush', 'render', 'save', 'track:ipc',
    ['error', null], ['notice', 'Print salvo em studio/prints/print.png'], 'operation:end'
  ])
  assert.equal(state.error, null)
  assert.equal(state.notice, 'Print salvo em studio/prints/print.png')
})

test('falha ao drenar gravações interrompe o print e preserva o erro original', async () => {
  const { events, state, commands } = createCommandHarness({
    flushDocumentWrites: async () => { throw new Error('falha no flush') }
  })

  await commands.exportPrint(studio)

  assert.deepEqual(events, ['operation:start', 'flush', ['error', 'falha no flush'], 'operation:end'])
  assert.equal(state.error, 'falha no flush')
  assert.equal(state.notice, null)
})

test('falha na gravação é apresentada e não anuncia um caminho de arquivo', async () => {
  const { events, state, commands } = createCommandHarness({
    savePrint: async () => { throw new Error('disco indisponível') }
  })

  await commands.exportPrint(studio)

  assert.equal(state.error, 'disco indisponível')
  assert.equal(state.notice, null)
  assert.equal(events.some((event) => Array.isArray(event) && event[0] === 'notice'), false)
})

test('falha ao renderizar interrompe a gravação e apresenta o erro da prévia', async () => {
  const { events, state, commands } = createCommandHarness({
    renderPrint: async () => { throw new Error('imagem indisponível') }
  })

  await commands.exportPrint(studio)

  assert.equal(state.error, 'imagem indisponível')
  assert.equal(state.notice, null)
  assert.equal(events.includes('save'), false)
})

test('sem cena ativa a exportação não inicia operação nem toca na persistência', async () => {
  const { events, commands } = createCommandHarness()

  assert.equal(commands.exportPrint(null), undefined)
  assert.deepEqual(events, [])
})

test('abrir prints conserva o tracker de operação e propaga erro para a página', async () => {
  const { events, state, commands } = createCommandHarness({
    openPrints: async () => { throw new Error('pasta indisponível') }
  })

  await commands.openPrints(studioId)

  assert.deepEqual(events, ['operation:start', 'open', ['error', 'pasta indisponível'], 'operation:end'])
  assert.equal(state.error, 'pasta indisponível')
})

test('fluxo integrado renderiza o canvas e grava os bytes pelo handler IPC real', async () => {
  const previousDocument = globalThis.document
  const context = { scale() {}, fillRect() {} }
  globalThis.document = {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => context,
      toDataURL: () => 'data:image/png;base64,AQID'
    })
  }

  const handlers = new Map()
  const writes = []
  registerStudioFileHandlers({
    ipcMain: { handle: (channel, listener) => handlers.set(channel, listener) },
    assertTrustedSender: (event) => { if (!event.trusted) throw new Error('Bloqueado') },
    showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
    appDataPath: () => 'app-data',
    tempPath: () => 'temp',
    studioPath: (id) => `app-data/projects/studio/${id}`,
    dataFileSystem: {
      locate: () => null,
      isLegacyDomain: () => false,
      materializeDirectory: async () => {}
    },
    files: {
      stat: async () => ({ size: 0 }),
      readFile: async () => Buffer.alloc(0),
      mkdir: async () => {},
      writeFile: async (path, bytes) => { writes.push({ path, bytes }) },
      rm: async () => {}
    },
    normalizeImage: async (bytes) => ({ bytes }),
    dataUrlBuffer: (value) => Buffer.from(value.slice(value.indexOf(',') + 1), 'base64'),
    createId: () => '12345678-1234-4234-8234-123456789abc',
    openPath: async () => ''
  })

  const { events, state, commands } = createCommandHarness({
    renderPrint: async (document) => {
      return makeCanvasPrint(document)
    },
    savePrint: (id, image) => handlers.get(studioIpcChannels.saveStudioPrint)({ trusted: true }, id, image)
  })

  try {
    await commands.exportPrint(studio)

    assert.deepEqual(writes.map((write) => write.bytes), [Buffer.from([1, 2, 3])])
    assert.match(writes[0].path, /prints[\\/]print-.*\.png$/)
    assert.equal(state.notice, `Print salvo em ${writes[0].path}`)
    assert.ok(events.indexOf('flush') < events.indexOf('render'))
    assert.ok(events.indexOf('render') < events.indexOf('save'))
    assert.ok(events.indexOf('save') < events.findIndex((event) => Array.isArray(event) && event[0] === 'notice'))
  } finally {
    if (previousDocument === undefined) delete globalThis.document
    else globalThis.document = previousDocument
  }
})

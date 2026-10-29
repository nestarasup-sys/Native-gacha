import assert from 'node:assert/strict'
import test from 'node:test'
import { createEditorV6ProjectCreationCommands } from '../../src/renderer/src/features/editorV6/editorV6ProjectCreation.ts'

function makeDocument(id, overrides = {}) {
  return {
    schemaVersion: 1,
    id,
    title: id,
    color: '#123456',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    backgroundColor: '#d7b5cd',
    backgroundAssetId: null,
    backgroundX: 0,
    backgroundY: 0,
    backgroundWidth: 100,
    backgroundHeight: 100,
    backgroundRotation: 0,
    assets: [],
    elements: [],
    timeline: { fps: 30, durationFrames: 300, tracks: [], knownElementIds: [] },
    ...overrides
  }
}

function makeHarness(overrides = {}) {
  const events = []
  const projects = [{ id: 'existing', title: 'Editor V6 04' }]
  const source = makeDocument('existing', {
    exportAudio: [{ id: 'audio-1', name: 'Trilha', fileName: 'audio-1.wav' }],
    media: [{ id: 'video-1', name: 'Vídeo', fileName: 'video-1.mp4', kind: 'video' }]
  })
  const nextNumber = { current: 1 }
  let id = 0
  const dependencies = {
    projects: () => projects,
    nextNumber,
    activeProject: () => source,
    createTimeline: () => ({ fps: 30, durationFrames: 300, tracks: [], knownElementIds: [] }),
    colorForNumber: (number) => `#00000${number}`,
    projectSummary: (document) => ({ id: document.id, title: document.title }),
    duplicateDocument: (document, identity) => ({ ...document, ...identity }),
    createId: () => `generated-${++id}`,
    now: () => '2026-10-29T12:00:00.000Z',
    loadProject: async (projectId) => { events.push(['load', projectId]); return projectId === source.id ? source : null },
    cloneExportAudio: async (sourceId, duplicateId, audio) => { events.push(['clone-audio', sourceId, duplicateId, audio]) },
    cloneMedia: async (sourceId, duplicateId, media) => { events.push(['clone-media', sourceId, duplicateId, media]) },
    writeDocument: async (document) => { events.push(['write', document]) },
    upsertSummary: (summary) => { events.push(['upsert', summary]) },
    selectProject: (projectId) => { events.push(['select', projectId]) },
    setSaved: (saved) => { events.push(['saved', saved]) },
    setError: (message) => { events.push(['error', message]) },
    trackOperation: (operation) => {
      events.push(['operation-start'])
      return Promise.resolve().then(operation).finally(() => events.push(['operation-end']))
    },
    ...overrides
  }
  return { commands: createEditorV6ProjectCreationCommands(dependencies), dependencies, events, projects, source, nextNumber }
}

test('aloca números acima do maior projeto salvo e mantém sequência local', () => {
  const { commands, nextNumber } = makeHarness()
  assert.equal(commands.allocateNumber(), 5)
  assert.equal(commands.allocateNumber(), 6)
  assert.equal(nextNumber.current, 7)
})

test('cria projeto com os padrões atuais e só seleciona depois de salvar', async () => {
  const { commands, events } = makeHarness()
  await commands.createStudio()
  const writeIndex = events.findIndex(([name]) => name === 'write')
  const upsertIndex = events.findIndex(([name]) => name === 'upsert')
  const selectIndex = events.findIndex(([name]) => name === 'select')
  assert.ok(writeIndex >= 0 && writeIndex < upsertIndex && upsertIndex < selectIndex)
  const document = events[writeIndex][1]
  assert.equal(document.title, 'Editor V6 05')
  assert.equal(document.color, '#000005')
  assert.equal(document.backgroundColor, '#d7b5cd')
  assert.deepEqual(document.elements, [])
  assert.deepEqual(document.timeline, { fps: 30, durationFrames: 300, tracks: [], knownElementIds: [] })
  assert.deepEqual(events.at(-1), ['saved', true])
})

test('não seleciona projeto novo se a gravação inicial falhar', async () => {
  const failure = new Error('disco indisponível')
  const { commands, events } = makeHarness({ writeDocument: async () => { throw failure } })
  await commands.createStudio()
  assert.ok(events.some(([name, message]) => name === 'error' && message === failure.message))
  assert.equal(events.some(([name]) => name === 'upsert' || name === 'select' || name === 'saved'), false)
})

test('duplica mídia de exportação e mídia do projeto antes de publicar o documento', async () => {
  const { commands, events, source } = makeHarness()
  await commands.duplicateStudio({ id: source.id, title: source.title })
  const labels = events.map(([name]) => name)
  assert.deepEqual(labels, ['operation-start', 'error', 'clone-audio', 'clone-media', 'write', 'upsert', 'select', 'saved', 'operation-end'])
  const duplicate = events.find(([name]) => name === 'write')[1]
  assert.equal(duplicate.title, 'Editor V6 05')
  assert.notEqual(duplicate.id, source.id)
  assert.deepEqual(events.find(([name]) => name === 'clone-audio').slice(1), [source.id, duplicate.id, source.exportAudio])
  assert.deepEqual(events.find(([name]) => name === 'clone-media').slice(1), [source.id, duplicate.id, source.media])
})

test('carrega da biblioteca um projeto que não está aberto antes de duplicar', async () => {
  const { commands, events, source } = makeHarness({ activeProject: () => null })
  await commands.duplicateStudio({ id: source.id, title: source.title })
  const labels = events.map(([name]) => name)
  assert.ok(labels.indexOf('load') > labels.indexOf('operation-start'))
  assert.ok(labels.indexOf('load') < labels.indexOf('clone-audio'))
  assert.ok(labels.includes('select'))
})

test('mantém o projeto sem seleção se copiar mídia falhar', async () => {
  const failure = new Error('falha ao copiar mídia')
  const { commands, events, source } = makeHarness({ cloneMedia: async () => { throw failure } })
  await commands.duplicateStudio({ id: source.id, title: source.title })
  assert.ok(events.some(([name, message]) => name === 'error' && message === failure.message))
  assert.equal(events.some(([name]) => name === 'write' || name === 'select' || name === 'upsert'), false)
  assert.deepEqual(events.at(-1), ['operation-end'])
})

test('não cria duplicata se o projeto de origem não estiver mais disponível', async () => {
  const { commands, events } = makeHarness({ activeProject: () => null, loadProject: async () => null })
  await commands.duplicateStudio({ id: 'missing', title: 'Editor V6 99' })
  assert.ok(events.some(([name, message]) => name === 'error' && message === 'Não foi possível carregar o projeto que será duplicado.'))
  assert.equal(events.some(([name]) => name === 'write' || name === 'select' || name === 'upsert'), false)
})

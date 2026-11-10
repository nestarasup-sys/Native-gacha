import assert from 'node:assert/strict'
import test from 'node:test'
import { createEditorV6Timeline } from '../src/shared/editorV6.ts'
import { createEditorV6AddObjectCommand } from '../src/renderer/src/features/editorV6/editorV6AddObjectCommand.ts'

const timestamp = '2026-11-10T18:00:00.000Z'
const objectAsset = {
  id: 'object-asset-1', category: 'object', name: 'Flor',
  mimeType: 'image/png', dataUrl: 'data:image/png;base64,AA=='
}

function makeProject({ elements = [], lockedObjectTrack = false } = {}) {
  const timeline = createEditorV6Timeline(elements)
  if (lockedObjectTrack) {
    timeline.tracks.push({
      id: 'object-track', kind: 'object', name: 'Objetos', muted: false, locked: true, blocks: []
    })
  }
  return {
    schemaVersion: 1,
    id: 'project-1',
    title: 'Editor V6 01',
    color: '#abcdef',
    createdAt: timestamp,
    updatedAt: timestamp,
    backgroundColor: '#ffffff',
    backgroundAssetId: null,
    backgroundX: 0,
    backgroundY: 0,
    backgroundWidth: 100,
    backgroundHeight: 100,
    backgroundRotation: 0,
    assets: [objectAsset],
    elements,
    timeline
  }
}

function makeHarness(project = makeProject()) {
  const events = []
  const state = { project }
  let id = 0
  const addObject = createEditorV6AddObjectCommand({
    activeProject: project,
    getFrame: () => { events.push(['frame']); return 75 },
    createId: () => `generated-${++id}`,
    now: () => { events.push(['now']); return timestamp },
    changeScene: (transform) => {
      events.push(['change-scene'])
      state.project = transform(state.project)
    },
    setError: (message) => events.push(['error', message]),
    setSelectedElementId: (elementId) => events.push(['selected-element', elementId]),
    setSelectedTimelineBlockId: (blockId) => events.push(['selected-block', blockId]),
    setInspectorOpen: (open) => events.push(['inspector-open', open]),
    setInspectorTab: (tab) => events.push(['inspector-tab', tab])
  })
  return { addObject, events, state, getGeneratedIdCount: () => id }
}

test('adiciona o objeto na posição atual da timeline e abre seus controles', () => {
  const character = {
    id: 'actor-1', kind: 'character', characterId: 'character-1', text: 'Lia',
    x: 0, y: 0, width: 20, height: 40, rotation: 0, zIndex: 4
  }
  const { addObject, events, state } = makeHarness(makeProject({ elements: [character] }))

  addObject(objectAsset)

  const element = state.project.elements.find((item) => item.kind === 'image')
  assert.deepEqual(element, {
    id: 'generated-1', kind: 'image', assetId: objectAsset.id, text: '',
    x: 0, y: 0, width: 25, height: 25, rotation: 0, zIndex: 5
  })
  const objectBlock = state.project.timeline.tracks.find((track) => track.kind === 'object').blocks[0]
  assert.equal(objectBlock.id, 'generated-2')
  assert.equal(objectBlock.startFrame, 75)
  assert.equal(state.project.updatedAt, timestamp)
  assert.deepEqual(events, [
    ['frame'], ['change-scene'], ['now'], ['selected-element', 'generated-1'],
    ['selected-block', 'generated-2'], ['inspector-open', true], ['inspector-tab', 'editor']
  ])
})

test('faixa Objetos bloqueada interrompe a inclusão antes de alocar IDs ou alterar o projeto', () => {
  const { addObject, events, state, getGeneratedIdCount } = makeHarness(makeProject({ lockedObjectTrack: true }))
  const original = state.project

  addObject(objectAsset)

  assert.equal(getGeneratedIdCount(), 0)
  assert.equal(state.project, original)
  assert.deepEqual(events, [['error', 'Desbloqueie a faixa Objetos para adicionar uma imagem.']])
})

test('projeto ausente não produz efeitos', () => {
  const { addObject, events, getGeneratedIdCount } = makeHarness(null)

  addObject(objectAsset)

  assert.equal(getGeneratedIdCount(), 0)
  assert.deepEqual(events, [])
})

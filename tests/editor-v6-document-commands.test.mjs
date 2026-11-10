import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { createEditorV6DocumentCommands } from '../src/renderer/src/features/editorV6/editorV6DocumentCommands.ts'
import { useEditorV6Store } from '../src/renderer/src/features/editorV6/editorV6Store.ts'

const timestamp = '2026-11-10T12:00:00.000Z'
const savedTimestamp = '2026-11-10T12:00:05.000Z'

function makeCharacter(id, assetId = 'shared-asset') {
  return {
    id,
    kind: 'character',
    characterId: id,
    assetId,
    text: id,
    x: 0,
    y: 0,
    width: 40,
    height: 80,
    rotation: 0,
    zIndex: 1
  }
}

function makeAsset(id) {
  return { id, category: 'object', name: id, mimeType: 'image/png', dataUrl: 'data:image/png;base64,AA==' }
}

function makeProject({ id = 'project-1', elements = [], assets = [] } = {}) {
  return {
    schemaVersion: 1,
    id,
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
    assets,
    elements,
    timeline: {
      fps: 30,
      durationFrames: 300,
      tracks: [],
      knownElementIds: []
    }
  }
}

function makeHarness(project, { selectedElementId = null, overrides = {} } = {}) {
  useEditorV6Store.setState({ projects: [], activeProject: null, histories: {} })
  useEditorV6Store.getState().setActiveProject(project)
  const events = []
  const activeProjectIdRef = { current: project?.id ?? null }
  const dependencies = {
    activeProject: project,
    activeProjectId: project?.id ?? null,
    activeProjectIdRef,
    selectedElementId,
    selectedTimelineBlockId: null,
    setSelectedElementId: (id) => events.push(['selected-element', id]),
    updateActiveProject: (update) => useEditorV6Store.getState().updateActiveProject(update),
    now: () => savedTimestamp,
    setActiveProject: (next) => useEditorV6Store.getState().setActiveProject(next),
    markUnsaved: () => events.push(['unsaved']),
    writeDocumentInOrder: async (document) => events.push(['write', document]),
    upsertSummary: (summary) => events.push(['summary', summary]),
    setSaved: (saved) => events.push(['saved', saved]),
    setError: (message) => events.push(['error', message]),
    setCanUndo: (value) => events.push(['can-undo', value]),
    setCanRedo: (value) => events.push(['can-redo', value]),
    bumpHistoryVersion: () => events.push(['history-version']),
    getFrame: () => 42,
    ...overrides
  }
  return { commands: createEditorV6DocumentCommands(dependencies), dependencies, events, activeProjectIdRef }
}

afterEach(() => {
  useEditorV6Store.setState({ projects: [], activeProject: null, histories: {} })
})

test('element update records history, synchronizes the timeline, and marks the project dirty', () => {
  const element = makeCharacter('character-1')
  const project = makeProject({ elements: [element], assets: [makeAsset('shared-asset')] })
  const { commands, events } = makeHarness(project)

  commands.updateElement(element.id, { x: 24 })

  const active = useEditorV6Store.getState().activeProject
  assert.equal(active.elements[0].x, 24)
  assert.equal(active.updatedAt, savedTimestamp)
  assert.equal(useEditorV6Store.getState().histories[project.id].undo.length, 1)
  assert.ok(events.some(([name]) => name === 'unsaved'))
  assert.ok(active.timeline.tracks.some((track) => track.kind === 'character'))
})

test('remove character keeps a shared asset and clears its selection', () => {
  const removed = makeCharacter('character-1')
  const remaining = makeCharacter('character-2')
  const project = makeProject({
    elements: [removed, remaining],
    assets: [makeAsset('shared-asset'), makeAsset('unused-asset')]
  })
  const { commands, events } = makeHarness(project, { selectedElementId: removed.id })

  commands.removeStageCharacter(removed)

  const active = useEditorV6Store.getState().activeProject
  assert.deepEqual(active.elements.map((element) => element.id), [remaining.id])
  assert.deepEqual(active.assets.map((asset) => asset.id), ['shared-asset', 'unused-asset'])
  assert.deepEqual(events.find(([name]) => name === 'selected-element'), ['selected-element', null])
  assert.equal(useEditorV6Store.getState().histories[project.id].undo.length, 1)
})

test('import persistence writes in order and updates history and saved state for the active project', async () => {
  const source = makeProject()
  const { commands, events } = makeHarness(source)
  const next = { ...source, title: 'Editor V6 importado', updatedAt: savedTimestamp }

  const isStillCurrent = await commands.persistImportedEditorV6Document(source, next)

  assert.equal(isStillCurrent, true)
  assert.equal(useEditorV6Store.getState().activeProject.title, next.title)
  assert.equal(useEditorV6Store.getState().histories[source.id].undo.length, 1)
  const labels = events.map(([name]) => name)
  assert.ok(labels.indexOf('unsaved') < labels.indexOf('write'))
  assert.ok(labels.indexOf('write') < labels.indexOf('summary'))
  assert.ok(labels.includes('saved'))
  assert.deepEqual(events.find(([name]) => name === 'saved'), ['saved', true])
})

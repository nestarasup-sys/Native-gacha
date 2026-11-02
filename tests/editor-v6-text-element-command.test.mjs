import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createEditorV6TextElementCommand } from '../src/renderer/src/features/editorV6/editorV6TextElementCommand.ts'

const pageSource = await readFile(new URL('../src/renderer/src/features/editorV6/EditorV6Page.tsx', import.meta.url), 'utf8')
const timestamp = '2026-11-02T13:00:00.000Z'

function makeCharacter(overrides = {}) {
  return {
    id: 'actor-1', kind: 'character', characterId: 'character-1', text: 'Lia',
    x: 18, y: 24, width: 20, height: 40, rotation: 0, zIndex: 3,
    ...overrides
  }
}

function makeProject({ elements = [], tracks = [] } = {}) {
  return {
    schemaVersion: 1,
    id: 'project-1',
    title: 'Editor V6 01',
    color: '#abcdef',
    createdAt: timestamp,
    updatedAt: timestamp,
    backgroundColor: '#fff',
    backgroundAssetId: null,
    backgroundX: 0,
    backgroundY: 0,
    backgroundWidth: 100,
    backgroundHeight: 100,
    backgroundRotation: 0,
    assets: [],
    elements,
    timeline: { fps: 30, durationFrames: 300, tracks, knownElementIds: elements.map((element) => element.id) }
  }
}

function makeHarness({ project = makeProject(), character = null } = {}) {
  const events = []
  const state = { project }
  let elementId = 0
  let blockId = 0
  const addTextElement = createEditorV6TextElementCommand({
    activeProject: project,
    selectedCharacterElement: character,
    pausePlayback: () => events.push(['pause']),
    getFrame: () => { events.push(['frame']); return 75 },
    createTextElement: (kind, zIndex) => ({
      id: `text-${++elementId}`, kind,
      text: kind === 'narrator' ? 'Texto do narrador' : 'Digite aqui',
      x: 0, y: 0, width: 28, height: 16, rotation: 0, zIndex
    }),
    createBlockId: () => `block-${++blockId}`,
    now: () => timestamp,
    changeScene: (transform) => {
      events.push(['change-scene'])
      state.project = transform(state.project)
    },
    setError: (message) => events.push(['error', message]),
    setSelectedElementId: (id) => events.push(['selected-element', id]),
    setSelectedTimelineBlockId: (id) => events.push(['selected-block', id]),
    setInspectorOpen: (open) => events.push(['inspector-open', open]),
    setInspectorTab: (tab) => events.push(['inspector-tab', tab])
  })
  return { addTextElement, events, state }
}

test('narrador pode ser adicionado sem personagem e vira bloco de vídeo no frame atual', () => {
  const { addTextElement, events, state } = makeHarness()

  addTextElement('narrator')

  assert.deepEqual(events.map(([name]) => name), ['pause', 'frame', 'change-scene', 'selected-element', 'selected-block', 'inspector-open', 'inspector-tab'])
  assert.equal(state.project.elements[0].kind, 'narrator')
  assert.equal(state.project.elements[0].zIndex, 1)
  assert.equal(state.project.timeline.tracks[0].kind, 'video')
  assert.equal(state.project.timeline.tracks[0].blocks[0].startFrame, 75)
  assert.equal(state.project.timeline.tracks[0].blocks[0].id, 'block-1')
  assert.equal(state.project.updatedAt, timestamp)
})

test('fala e pensamento preservam o vínculo e a posição inicial do personagem escolhido', () => {
  for (const kind of ['speech', 'thought']) {
    const character = makeCharacter()
    const { addTextElement, state } = makeHarness({ project: makeProject({ elements: [character] }), character })

    addTextElement(kind)

    const element = state.project.elements.find((entry) => entry.kind === kind)
    assert.equal(element.characterId, 'character-1')
    assert.equal(element.attachedCharacterElementId, 'actor-1')
    assert.equal(element.attachmentOriginX, 18)
    assert.equal(element.attachmentOriginY, 24)
    assert.equal(element.x, 18)
    assert.equal(element.y, 24)
    assert.equal(element.zIndex, 4)
    assert.equal(state.project.timeline.tracks.find((track) => track.kind === kind).blocks[0].startFrame, 75)
  }
})

test('fala sem personagem selecionado apresenta o erro antes de pausar o playback', () => {
  const { addTextElement, events, state } = makeHarness()

  addTextElement('speech')

  assert.deepEqual(events, [['error', 'Selecione um personagem na cena antes de adicionar fala ou pensamento.']])
  assert.deepEqual(state.project.elements, [])
})

test('faixa de destino bloqueada pausa antes do erro e não cria elemento nem IDs', () => {
  const character = makeCharacter()
  const lockedSpeechTrack = { id: 'speech-track', kind: 'speech', name: 'Fala', muted: false, locked: true, blocks: [] }
  const { addTextElement, events, state } = makeHarness({
    project: makeProject({ elements: [character], tracks: [lockedSpeechTrack] }),
    character
  })

  addTextElement('speech')

  assert.deepEqual(events, [
    ['pause'], ['frame'], ['error', 'Desbloqueie a faixa para adicionar um bloco.']
  ])
  assert.equal(state.project.elements.length, 1)
  assert.equal(state.project.timeline.tracks[0].blocks.length, 0)
})

test('faixa bloqueada de outro tipo não impede narrador; projeto ausente não produz efeitos', () => {
  const unrelatedLockedTrack = { id: 'speech-track', kind: 'speech', name: 'Fala', muted: false, locked: true, blocks: [] }
  const narrator = makeHarness({ project: makeProject({ tracks: [unrelatedLockedTrack] }) })
  narrator.addTextElement('narrator')
  assert.ok(narrator.state.project.elements.some((element) => element.kind === 'narrator'))

  const lockedVideoTrack = { id: 'video-track', kind: 'video', name: 'Vídeo', muted: false, locked: true, blocks: [] }
  const blockedNarrator = makeHarness({ project: makeProject({ tracks: [lockedVideoTrack] }) })
  blockedNarrator.addTextElement('narrator')
  assert.deepEqual(blockedNarrator.events, [['pause'], ['frame'], ['error', 'Desbloqueie a faixa para adicionar um bloco.']])
  assert.deepEqual(blockedNarrator.state.project.elements, [])

  const absent = makeHarness({ project: null })
  absent.addTextElement('narrator')
  assert.deepEqual(absent.events, [])
})

test('EditorV6Page delega a criação do elemento e preserva os callbacks da interface', () => {
  assert.match(pageSource, /createEditorV6TextElementCommand\(\{[\s\S]*?activeProject: activeEditorV6,[\s\S]*?changeScene,[\s\S]*?setSelectedTimelineBlockId,[\s\S]*?setInspectorTab/)
  assert.match(pageSource, /onClick=\{\(\) => addTextElement\('speech'\)\}/)
})

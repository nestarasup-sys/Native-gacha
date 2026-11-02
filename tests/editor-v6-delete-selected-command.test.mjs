import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createEditorV6DeleteSelectedCommand } from '../src/renderer/src/features/editorV6/editorV6DeleteSelectedCommand.ts'
import { syncEditorV6TimelineElements } from '../src/shared/editorV6.ts'
import { editEditorV6BackgroundAtFrame, resolveEditorV6BackgroundAtFrame } from '../src/shared/editorV6TimelineScene.ts'

const pageSource = await readFile(new URL('../src/renderer/src/features/editorV6/EditorV6Page.tsx', import.meta.url), 'utf8')
const timestamp = '2026-11-02T14:00:00.000Z'

function makeCharacter() {
  return { id: 'actor-1', kind: 'character', characterId: 'character-1', text: 'Lia', x: 0, y: 0, width: 20, height: 40, rotation: 0, zIndex: 1 }
}

function makeElement(id, kind = 'image', assetId = `${id}-asset`) {
  return { id, kind, assetId, text: '', x: 0, y: 0, width: 20, height: 20, rotation: 0, zIndex: 1 }
}

function makeProject({ elements = [], tracks = [], backgroundAssetId = null, assets = [], media = [] } = {}) {
  return {
    schemaVersion: 1,
    id: 'project-1',
    title: 'Editor V6 01',
    color: '#abcdef',
    createdAt: timestamp,
    updatedAt: timestamp,
    backgroundColor: '#fff',
    backgroundAssetId,
    backgroundX: 0,
    backgroundY: 0,
    backgroundWidth: 100,
    backgroundHeight: 100,
    backgroundRotation: 0,
    assets,
    media,
    elements,
    timeline: { fps: 30, durationFrames: 300, tracks, knownElementIds: elements.map((element) => element.id) }
  }
}

function makeHarness({ project = makeProject(), selectedElementId = null, selectedTimelineVideoBlockId = null } = {}) {
  const events = []
  const state = { project }
  const command = createEditorV6DeleteSelectedCommand({
    activeProject: project,
    selectedElementId,
    selectedTimelineVideoBlockId,
    getFrame: () => { events.push(['frame']); return 75 },
    editBackgroundAtFrame: editEditorV6BackgroundAtFrame,
    now: () => timestamp,
    changeScene: (transform) => {
      events.push(['change-scene'])
      const next = transform(state.project)
      state.project = { ...next, timeline: syncEditorV6TimelineElements(next.timeline, next.elements) }
    },
    removeStageCharacter: (element) => events.push(['remove-character', element.id]),
    setSelectedElementId: (id) => events.push(['selected-element', id]),
    setSelectedTimelineBlockId: (id) => events.push(['selected-block', id])
  })
  return { command, events, state }
}

test('remover fundo registra background nulo no frame e preserva o asset do projeto', () => {
  const backgroundAsset = { id: 'background-1', category: 'background', name: 'Fundo', mimeType: 'image/png', dataUrl: 'data:bg' }
  const { command, events, state } = makeHarness({
    project: makeProject({ backgroundAssetId: backgroundAsset.id, assets: [backgroundAsset] }),
    selectedElementId: 'background'
  })

  command()

  assert.deepEqual(events, [['frame'], ['change-scene'], ['selected-element', null]])
  assert.equal(resolveEditorV6BackgroundAtFrame(state.project, 75).backgroundAssetId, null)
  assert.deepEqual(state.project.assets, [backgroundAsset])
})

test('remover um vídeo apaga só o bloco da timeline e mantém mídia e asset do projeto', () => {
  const videoTrack = {
    id: 'video-track', kind: 'video', name: 'Vídeo', muted: false, locked: false,
    blocks: [{ id: 'video-block', mediaId: 'media-1', label: 'Clipe', startFrame: 0, durationFrames: 90 }]
  }
  const media = { id: 'media-1', name: 'Clipe', fileName: 'clip.mp4', kind: 'video', mimeType: 'video/mp4', sourceFrames: 90, hasAudio: false, sizeBytes: 100 }
  const asset = { id: 'unused-asset', category: 'object', name: 'Recurso', mimeType: 'image/png', dataUrl: 'data:obj' }
  const { command, events, state } = makeHarness({
    project: makeProject({ tracks: [videoTrack], media: [media], assets: [asset] }),
    selectedTimelineVideoBlockId: 'video-block'
  })

  command()

  assert.deepEqual(events, [['change-scene'], ['selected-block', null]])
  assert.equal(state.project.timeline.tracks[0].blocks.length, 0)
  assert.deepEqual(state.project.media, [media])
  assert.deepEqual(state.project.assets, [asset])
})

test('personagem delega a remoção específica e limpa a seleção; objeto mantém asset local', () => {
  const character = makeCharacter()
  const { command, events } = makeHarness({ project: makeProject({ elements: [character] }), selectedElementId: character.id })

  command()

  assert.deepEqual(events, [['remove-character', character.id], ['selected-element', null]])

  const object = makeElement('object-1')
  const objectAsset = { id: object.assetId, category: 'object', name: 'Objeto', mimeType: 'image/png', dataUrl: 'data:obj' }
  const { command: deleteObject, events: objectEvents, state } = makeHarness({ project: makeProject({ elements: [object], assets: [objectAsset] }), selectedElementId: object.id })
  deleteObject()
  assert.deepEqual(objectEvents, [['change-scene'], ['selected-element', null]])
  assert.deepEqual(state.project.elements, [])
  assert.deepEqual(state.project.assets, [objectAsset])
})

test('fundo tem prioridade sobre clip selecionado e nenhum projeto não produz efeitos', () => {
  const videoTrack = {
    id: 'video-track', kind: 'video', name: 'Vídeo', muted: false, locked: false,
    blocks: [{ id: 'video-block', mediaId: 'media-1', label: 'Clipe', startFrame: 0, durationFrames: 90 }]
  }
  const { command, state } = makeHarness({ project: makeProject({ tracks: [videoTrack] }), selectedElementId: 'background', selectedTimelineVideoBlockId: 'video-block' })

  command()

  assert.equal(state.project.timeline.tracks[0].blocks[0].id, 'video-block')

  const absent = makeHarness({ project: null, selectedElementId: 'background', selectedTimelineVideoBlockId: 'video-block' })
  absent.command()
  assert.deepEqual(absent.events, [])
})

test('EditorV6Page delega prioridade, timeline e limpeza da seleção ao comando', () => {
  assert.match(pageSource, /createEditorV6DeleteSelectedCommand\(\{[\s\S]*?activeProject: activeEditorV6,[\s\S]*?selectedTimelineVideoBlockId: selectedTimelineVideoClip\?\.block\.id \?\? null,[\s\S]*?removeStageCharacter,[\s\S]*?setSelectedTimelineBlockId/)
  assert.match(pageSource, /onDeleteSelected=\{deleteSelected\}/)
})

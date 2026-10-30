import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { loadEditorV6ProjectCatalog } from '../src/renderer/src/features/editorV6/editorV6ProjectCatalog.ts'
import {
  createEditorV6PoseRevisionSnapshot,
  createEditorV6ModelRevisionSnapshot,
  sameCustomizerCharacterCatalog,
  samePoseRevisionSnapshot
} from '../src/renderer/src/features/editorV6/useEditorV6CharacterSources.ts'
import { resolveEditorV6CharacterSourceRefresh } from '../src/renderer/src/features/editorV6/editorV6CharacterSourceModel.ts'
import { loadEditorV6PoseThumbnails } from '../src/renderer/src/features/editorV6/editorV6PoseCatalog.ts'
import { createEditorV6MediaCommands } from '../src/renderer/src/features/editorV6/editorV6MediaCommands.ts'
import {
  applyEditorV6CharacterAssetCrops,
  applyEditorV6CharacterRefreshResult
} from '../src/renderer/src/features/editorV6/editorV6CharacterRefreshModel.ts'
import {
  importEditorV6ImageToProject,
  importEditorV6MediaToTimeline
} from '../src/renderer/src/features/editorV6/editorV6MediaImport.ts'

const validId = (value) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`
const projectSummary = (id) => ({ id, title: `Projeto ${id}`, color: '#d7b5cd', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' })
const legacyEntry = (id, title = `Legado ${id}`) => ({ id, title, color: '#ab77bb' })
const emptyTimeline = () => ({ fps: 30, durationFrames: 300, tracks: [] })
const mediaProject = () => ({ id: 'project', assets: [], elements: [], media: [], timeline: emptyTimeline() })

function createMediaCommandHarness(overrides = {}) {
  const calls = []
  const selections = {}
  const source = mediaProject()
  source.timeline.tracks = ['video', 'object', 'audio'].map((kind) => ({
    id: kind,
    kind,
    name: kind,
    muted: false,
    locked: false,
    blocks: []
  }))
  const dependencies = {
    activeProject: source,
    trackOperation: async (operation) => { calls.push('track'); return operation() },
    importImageToProject: async (options) => {
      calls.push(['image-use-case', options.category, options.frame])
      const asset = await options.importAsset(options.category)
      const current = await options.loadProject()
      if (!asset || !current) return null
      const element = { id: 'image-element', kind: 'image', assetId: asset.id }
      const next = { ...current, assets: [...current.assets, asset], elements: [...current.elements, element] }
      await options.persistDocument(current, next)
      return { selectedElementId: element.id, selectedTimelineBlockId: 'image-block', activeTool: 'objects' }
    },
    importMediaToTimeline: async (options) => {
      calls.push(['media-use-case', options.frame])
      const media = await options.requestMedia()
      const current = await options.loadProject()
      if (!media || !current) return null
      const block = { id: 'media-block', mediaId: media.id, startFrame: options.frame, durationFrames: 60 }
      const track = current.timeline.tracks.find((item) => item.kind === media.kind)
      const timeline = { ...current.timeline, tracks: current.timeline.tracks.map((item) => item === track ? { ...item, blocks: [...item.blocks, block] } : item) }
      const mediaList = current.media ?? []
      const next = { ...current, media: mediaList.some((item) => item.id === media.id) ? mediaList : [...mediaList, media], timeline }
      await options.persistDocument(current, next)
      return { blockId: block.id, startFrame: block.startFrame }
    },
    addImageAsset: () => source,
    addTimelineMedia: () => ({ document: source, block: { id: 'unused' }, startFrame: 0 }),
    findClipAtFrame: () => undefined,
    editBackgroundAtFrame: (project, _frame, values) => ({ ...project, ...values }),
    bridge: {
      importEditorV6Image: async (category) => { calls.push(['import-image', category]); return { id: 'image-asset', category, name: 'Imagem', mimeType: 'image/png', dataUrl: 'data:image/png;base64,x' } },
      importEditorV6Media: async (projectId, kind) => { calls.push(['import-media', projectId, kind]); return { id: 'audio-media', kind, name: 'Áudio', fileName: 'audio.wav', sourceFrames: 90, mimeType: 'audio/wav' } },
      linkEditorV6LibraryVideo: async (projectId, libraryId) => { calls.push(['link-video', projectId, libraryId]); return { id: 'linked-video', kind: 'video', name: 'Vídeo da Base', fileName: 'video.mp4', sourceFrames: 90, mimeType: 'video/mp4', libraryVideoId: libraryId } }
    },
    pausePlayback: () => calls.push('pause'),
    publishPlayheadFrame: (frame) => calls.push(['playhead', frame]),
    loadLatestProject: async (projectId) => { calls.push(['load-latest', projectId]); return source },
    persistImportedDocument: async (before, next) => { calls.push(['persist', before, next]); return true },
    setError: (message) => calls.push(['error', message]),
    setVideoPickerOpen: (open) => calls.push(['picker', open]),
    setSelectedElementId: (id) => { selections.elementId = id },
    setSelectedTimelineBlockId: (id) => { selections.blockId = id },
    setActiveTool: (tool) => { selections.tool = tool },
    setInspectorOpen: (open) => { selections.inspectorOpen = open },
    setInspectorTab: (tab) => { selections.inspectorTab = tab },
    changeScene: (transform) => { selections.scene = transform(source) },
    createId: (() => { let id = 0; return () => `scene-${++id}` })(),
    getFrame: () => 42,
    ...overrides
  }
  return { commands: createEditorV6MediaCommands(dependencies), calls, selections, source }
}

test('importa apenas projetos legados ausentes e preserva defaults antes de reler a biblioteca', async () => {
  const knownId = validId(1)
  const addedIds = [validId(2), validId(3)]
  const calls = []
  const written = []
  let projects = [projectSummary(knownId)]
  const result = await loadEditorV6ProjectCatalog({
    listProjects: async () => { calls.push('list'); return projects },
    getFolder: async () => { calls.push('folder'); return 'C:/perfil/Editor V6' },
    legacyCatalog: () => {
      calls.push('legacy')
      return [legacyEntry(knownId), legacyEntry(addedIds[0]), legacyEntry(addedIds[1]), legacyEntry('id-invalido')]
    },
    createTimeline: emptyTimeline,
    now: () => '2026-10-29T12:00:00.000Z',
    writeDocument: async (document) => {
      written.push(document)
      projects = [...projects, projectSummary(document.id)]
    }
  })

  assert.deepEqual(calls.slice(0, 3), ['list', 'legacy', 'list'])
  assert.deepEqual(written.map((document) => document.id).sort(), addedIds)
  assert.ok(written.every((document) => document.createdAt === '2026-10-29T12:00:00.000Z' && document.updatedAt === document.createdAt))
  assert.ok(written.every((document) => document.assets.length === 0 && document.elements.length === 0 && document.timeline.fps === 30))
  assert.equal(result.projects.length, 3)
  assert.equal(result.folder, 'C:/perfil/Editor V6')
  assert.equal(result.clearLegacyCatalog, true)
  assert.deepEqual(calls.slice(2).sort(), ['folder', 'list'])
})

test('limita a três gravações independentes durante importação e espera todas finalizarem', async () => {
  const ids = Array.from({ length: 9 }, (_, index) => validId(index + 10))
  let active = 0
  let maximumActive = 0
  const written = []
  await loadEditorV6ProjectCatalog({
    listProjects: async () => [],
    getFolder: async () => 'folder',
    legacyCatalog: () => ids.map((id) => legacyEntry(id)),
    createTimeline: emptyTimeline,
    concurrency: Number.NaN,
    writeDocument: async (document) => {
      active += 1
      maximumActive = Math.max(maximumActive, active)
      await new Promise((resolve) => setTimeout(resolve, 2))
      written.push(document.id)
      active -= 1
    }
  })

  assert.equal(maximumActive, 3)
  assert.equal(active, 0)
  assert.deepEqual(written.sort(), ids.sort())
})

test('mantém ordem de sobrescrita quando o catálogo legado contém IDs repetidos', async () => {
  const duplicateId = validId(20)
  const titles = []
  await loadEditorV6ProjectCatalog({
    listProjects: async () => [],
    getFolder: async () => 'folder',
    legacyCatalog: () => [legacyEntry(duplicateId, 'primeiro'), legacyEntry(duplicateId, 'último')],
    createTimeline: emptyTimeline,
    concurrency: 2,
    writeDocument: async (document) => {
      if (document.title === 'primeiro') await new Promise((resolve) => setTimeout(resolve, 2))
      titles.push(document.title)
    }
  })
  assert.deepEqual(titles, ['primeiro', 'último'])
})

test('compara revisões e catálogos sem trocar referências se os dados não mudaram', () => {
  const first = { id: 'character', name: 'Chloe', updatedAt: 'v1', customization: { modelSlot: 2, poseSlot: 3 } }
  const same = { ...first, customization: { modelSlot: 2, poseSlot: 3 } }
  const changed = { ...first, customization: { modelSlot: 2, poseSlot: 4 } }
  assert.equal(sameCustomizerCharacterCatalog([first], [same]), true)
  assert.equal(sameCustomizerCharacterCatalog([first], [changed]), false)
  assert.equal(sameCustomizerCharacterCatalog([first], []), false)

  const revisions = createEditorV6PoseRevisionSnapshot([{ modelSlot: 2, poses: [null, { slot: 4, updatedAt: 'pose-v2' }] }])
  const modelRevisions = createEditorV6ModelRevisionSnapshot([null, { slot: 2, updatedAt: 'model-v3' }])
  assert.deepEqual(revisions, { '2:1': 'missing', '2:4': 'pose-v2' })
  assert.deepEqual(modelRevisions, { '2': 'model-v3' })
  assert.equal(samePoseRevisionSnapshot(revisions, { ...revisions }), true)
  assert.equal(samePoseRevisionSnapshot(revisions, { ...revisions, '2:4': 'pose-v3' }), false)
})

test('decide refresh com revisões atuais e states de personagens nos blocos da timeline', () => {
  const character = {
    id: 'character', name: 'Chloe', updatedAt: 'character-v2',
    customization: { modelSlot: 2, poseSlot: 4 }
  }
  const project = {
    id: 'project',
    elements: [{
      id: 'scene-character', kind: 'character', characterId: 'character',
      poseSourceRevision: 'pose-v2', characterSourceUpdatedAt: 'character-v2', modelSourceRevision: 'model-v3', faceRendererVersion: 8
    }],
    timeline: { tracks: [{ blocks: [{ state: {
      id: 'timeline-character', kind: 'character', characterId: 'character', poseSlot: 5,
      poseSourceRevision: 'pose-v1', characterSourceUpdatedAt: 'character-v2', modelSourceRevision: 'model-v3', faceRendererVersion: 8
    } }] }] }
  }
  const input = {
    project,
    characterById: new Map([[character.id, character]]),
    poseSourceSnapshot: { projectId: 'project', revisions: { '2:4': 'pose-v2', '2:5': 'pose-v1' }, modelRevisions: { '2': 'model-v3' } },
    faceRendererVersion: 8
  }

  const state = resolveEditorV6CharacterSourceRefresh(input)
  assert.equal(state.characterStates.length, 2)
  assert.equal(state.poseRefreshRequired, false)
  assert.equal(state.faceAssetRefreshRequired, false)

  const changedTimelineRevision = resolveEditorV6CharacterSourceRefresh({
    ...input,
    poseSourceSnapshot: { ...input.poseSourceSnapshot, revisions: { ...input.poseSourceSnapshot.revisions, '2:5': 'pose-v2' } }
  })
  assert.equal(changedTimelineRevision.poseRefreshRequired, true)
  assert.equal(changedTimelineRevision.faceAssetRefreshRequired, true)

  const changedModelRevision = resolveEditorV6CharacterSourceRefresh({
    ...input,
    poseSourceSnapshot: { ...input.poseSourceSnapshot, modelRevisions: { '2': 'model-v4' } }
  })
  assert.equal(changedModelRevision.poseRefreshRequired, true)
  assert.equal(changedModelRevision.faceAssetRefreshRequired, true)
})

test('mantém refresh pendente enquanto o snapshot de pose não chegou e detecta renderer antigo', () => {
  const character = { id: 'character', updatedAt: 'character-v2', customization: { modelSlot: 3, poseSlot: 7 } }
  const characterState = {
    id: 'scene-character', kind: 'character', characterId: 'character',
    poseSourceRevision: 'missing', characterSourceUpdatedAt: 'character-v2', faceRendererVersion: 8
  }
  const base = {
    project: { id: 'project', elements: [characterState], timeline: { tracks: [] } },
    characterById: new Map([[character.id, character]]),
    poseSourceSnapshot: null,
    faceRendererVersion: 8
  }

  assert.equal(resolveEditorV6CharacterSourceRefresh(base).poseRefreshRequired, true)
  assert.equal(resolveEditorV6CharacterSourceRefresh(base).faceAssetRefreshRequired, true)

  const oldRenderer = resolveEditorV6CharacterSourceRefresh({
    ...base,
    poseSourceSnapshot: { projectId: 'project', revisions: { '3:7': 'missing' } },
    project: { ...base.project, elements: [{ ...characterState, faceRendererVersion: 7 }] }
  })
  assert.equal(oldRenderer.poseRefreshRequired, false)
  assert.equal(oldRenderer.faceAssetRefreshRequired, true)
})

test('não bloqueia personagens sem fonte viva e devolve estado vazio sem projeto', () => {
  const missingCharacter = {
    id: 'scene-character', kind: 'character', characterId: 'removed-character',
    poseSlot: 3, characterSourceUpdatedAt: 'old', faceRendererVersion: 8
  }
  const input = {
    project: { id: 'project', elements: [missingCharacter], timeline: { tracks: [] } },
    characterById: new Map(),
    poseSourceSnapshot: null,
    faceRendererVersion: 8
  }

  assert.deepEqual(resolveEditorV6CharacterSourceRefresh(input), {
    characterStates: [missingCharacter], poseRefreshRequired: false, faceAssetRefreshRequired: false
  })
  assert.deepEqual(resolveEditorV6CharacterSourceRefresh({ ...input, project: null }), {
    characterStates: [], poseRefreshRequired: false, faceAssetRefreshRequired: false
  })
})

test('aplica recortes antigos de personagens em assets, cena e timeline sem mutar o projeto', () => {
  const character = { id: 'scene-character', kind: 'character', assetId: 'character-asset', x: 40, y: 50, width: 100, height: 120, rotation: 0 }
  const timelineCharacter = { ...character, id: 'timeline-character', x: 10, y: 20, width: 100, height: 100 }
  const unrelated = { id: 'object', kind: 'image', assetId: 'object-asset', x: 0, y: 0, width: 20, height: 20, rotation: 0 }
  const project = {
    id: 'project', updatedAt: 'before',
    assets: [
      { id: 'character-asset', category: 'character', dataUrl: 'data:image/png;base64,old', mimeType: 'image/png' },
      { id: 'object-asset', category: 'object', dataUrl: 'data:image/png;base64,object', mimeType: 'image/png' }
    ],
    elements: [character, unrelated],
    timeline: { tracks: [{ id: 'track', kind: 'character', blocks: [{ id: 'block', state: timelineCharacter, label: 'Character' }] }] }
  }
  const before = structuredClone(project)
  const crop = {
    dataUrl: 'data:image/png;base64,cropped', width: 50, height: 60,
    left: 10, top: 20, sourceWidth: 100, sourceHeight: 120
  }

  const normalized = applyEditorV6CharacterAssetCrops(project, [{ assetId: 'character-asset', crop }], 'after')

  assert.equal(normalized.assets[0].dataUrl, crop.dataUrl)
  assert.equal(normalized.assets[0].mimeType, 'image/png')
  assert.equal(normalized.elements[0].x, 25)
  assert.equal(normalized.elements[0].y, 40)
  assert.equal(normalized.elements[0].width, 50)
  assert.equal(normalized.elements[0].height, 60)
  assert.deepEqual(normalized.elements[1], unrelated)
  assert.ok(Math.abs(normalized.timeline.tracks[0].blocks[0].state.x + 5) < 1e-9)
  assert.ok(Math.abs(normalized.timeline.tracks[0].blocks[0].state.y - 11.666666666666667) < 1e-9)
  assert.equal(normalized.timeline.tracks[0].blocks[0].state.width, 50)
  assert.equal(normalized.timeline.tracks[0].blocks[0].state.height, 50)
  assert.equal(normalized.updatedAt, 'after')
  assert.deepEqual(project, before)
  assert.equal(applyEditorV6CharacterAssetCrops(project, [], 'unused'), project)
})

test('aplica refresh de snapshots preservando assets ainda referenciados e removendo snapshots órfãos', () => {
  const firstCharacter = { id: 'first', kind: 'character', characterId: 'character', assetId: 'old-shared', text: 'Anterior', x: 0, y: 0, width: 10, height: 10 }
  const secondCharacter = { id: 'second', kind: 'character', characterId: 'character', assetId: 'old-shared', text: 'Outra cópia', x: 0, y: 0, width: 10, height: 10 }
  const oldBlockState = { ...firstCharacter, id: 'timeline-state' }
  const project = {
    id: 'project', updatedAt: 'before', backgroundAssetId: null,
    elements: [firstCharacter, secondCharacter],
    assets: [
      { id: 'old-shared', category: 'character', dataUrl: 'old', timelineSnapshot: true },
      { id: 'old-orphan', category: 'character', dataUrl: 'orphan', timelineSnapshot: true },
      { id: 'permanent', category: 'character', dataUrl: 'permanent' }
    ],
    timeline: { durationFrames: 300, tracks: [{ id: 'track', kind: 'character', blocks: [{ id: 'block', elementId: 'first', state: oldBlockState, label: 'Anterior' }] }] }
  }
  const nextSceneState = { ...firstCharacter, assetId: 'new-scene', text: 'Novo personagem' }
  const nextBlockState = { ...oldBlockState, assetId: 'new-timeline', text: '  Novo estado  ' }
  const result = {
    nextElements: new Map([['first', nextSceneState]]),
    nextBlocks: new Map([['block', nextBlockState]]),
    refreshedAssets: [
      { id: 'new-scene', category: 'character', dataUrl: 'scene', timelineSnapshot: true },
      { id: 'new-timeline', category: 'character', dataUrl: 'timeline', timelineSnapshot: true },
      { id: 'new-orphan', category: 'character', dataUrl: 'unused', timelineSnapshot: true }
    ],
    staleAssetIds: new Set(['old-shared', 'old-orphan'])
  }

  const pruneSnapshots = (document) => {
    const referenced = new Set([
      ...document.elements.map((element) => element.assetId),
      ...document.timeline.tracks.flatMap((track) => track.blocks.map((block) => block.state?.assetId))
    ])
    return { ...document, assets: document.assets.filter((asset) => !asset.timelineSnapshot || referenced.has(asset.id)) }
  }
  const refreshed = applyEditorV6CharacterRefreshResult(project, result, pruneSnapshots, 'after')

  assert.equal(refreshed.elements[0].assetId, 'new-scene')
  assert.equal(refreshed.elements[1].assetId, 'old-shared')
  assert.deepEqual(refreshed.assets.map((asset) => asset.id), ['old-shared', 'permanent', 'new-scene', 'new-timeline'])
  assert.equal(refreshed.assets[0].timelineSnapshot, true)
  assert.equal(refreshed.timeline.tracks[0].blocks[0].state.assetId, 'new-timeline')
  assert.equal(refreshed.timeline.tracks[0].blocks[0].label, 'Novo estado')
  assert.equal(refreshed.updatedAt, 'after')
  assert.equal(project.assets[0].timelineSnapshot, true)
  assert.equal(project.timeline.tracks[0].blocks[0].state.assetId, 'old-shared')
})

test('importação de imagem coordena escolha, documento atual, persistência e seleção do bloco', async () => {
  const source = mediaProject()
  const asset = { id: 'image-asset', name: 'Fundo', category: 'object', dataUrl: 'data:image/png;base64,x' }
  const calls = []
  const result = await importEditorV6ImageToProject({
    category: 'object',
    frame: 42,
    importAsset: async (category) => { calls.push(['import', category]); return asset },
    loadProject: async () => { calls.push(['load']); return source },
    persistDocument: async (before, next) => { calls.push(['persist', before, next]); return true },
    createId: () => 'scene-image',
    addImageAsset: (document, imported, category, frame, createId) => {
      calls.push(['add', imported, category, frame])
      const image = { id: createId(), kind: 'image', assetId: imported.id }
      return { ...document, assets: [...document.assets, imported], elements: [...document.elements, image] }
    },
    findClipAtFrame: (_timeline, elementId, frame) => ({ block: { id: `${elementId}:${frame}` } })
  })

  assert.deepEqual(calls.map(([kind]) => kind), ['import', 'load', 'add', 'persist'])
  assert.equal(calls[3][1], source)
  assert.equal(result.selectedElementId, 'scene-image')
  assert.equal(result.selectedTimelineBlockId, 'scene-image:42')
  assert.equal(result.activeTool, 'objects')
})

test('cancelamento da seleção de imagem não carrega nem publica o projeto', async () => {
  let loads = 0
  let writes = 0
  const result = await importEditorV6ImageToProject({
    category: 'background', frame: 8,
    importAsset: async () => null,
    loadProject: async () => { loads += 1; return mediaProject() },
    persistDocument: async () => { writes += 1; return true },
    createId: () => 'unused',
    addImageAsset: (document) => document,
    findClipAtFrame: () => undefined
  })
  assert.equal(result, null)
  assert.equal(loads, 0)
  assert.equal(writes, 0)
})

test('imagem revalida bloqueio da faixa depois de escolher o arquivo e antes de persistir', async () => {
  let writes = 0
  const source = mediaProject()
  await assert.rejects(importEditorV6ImageToProject({
    category: 'object', frame: 8,
    importAsset: async () => ({ id: 'asset', name: 'Imagem', category: 'object', dataUrl: 'data:image/png;base64,x' }),
    loadProject: async () => source,
    persistDocument: async () => { writes += 1; return true },
    createId: () => 'unused',
    addImageAsset: (document) => document,
    findClipAtFrame: () => undefined,
    validateProject: () => { throw new Error('Desbloqueie a faixa Objetos para adicionar uma imagem.') }
  }), /Desbloqueie a faixa Objetos/)
  assert.equal(writes, 0)
})

test('mídia de áudio ou vídeo é anexada à última versão do documento antes de atualizar a timeline', async () => {
  const source = mediaProject()
  const media = { id: 'audio-1', kind: 'audio', name: 'Voz', sourceFrames: 90 }
  const calls = []
  const result = await importEditorV6MediaToTimeline({
    frame: 240,
    requestMedia: async () => { calls.push('import'); return media },
    loadProject: async () => { calls.push('load'); return source },
    persistDocument: async (before, next) => { calls.push(['persist', before, next]); return true },
    createId: () => 'audio-block',
    addTimelineMedia: (document, imported, frame, createId) => {
      calls.push(['add', imported, frame])
      return { document: { ...document, media: [...document.media, imported] }, block: { id: createId() }, startFrame: 240 }
    }
  })

  assert.deepEqual(calls.slice(0, 2), ['import', 'load'])
  assert.equal(calls[2][1], media)
  assert.equal(calls[2][2], 240)
  assert.equal(calls[3][1], source)
  assert.equal(result.blockId, 'audio-block')
  assert.equal(result.startFrame, 240)
})

test('importação sem mídia ou persistência cancelada não devolve seleção de timeline', async () => {
  const media = { id: 'video-1', kind: 'video', name: 'Clipe', sourceFrames: 60 }
  const result = await importEditorV6MediaToTimeline({
    frame: 12,
    requestMedia: async () => media,
    loadProject: async () => mediaProject(),
    persistDocument: async () => false,
    createId: () => 'video-block',
    addTimelineMedia: (document, imported, frame, createId) => ({ document, block: { id: createId() }, startFrame: frame })
  })
  assert.equal(result, null)
})

test('comandos da tela importam imagem pelo projeto mais recente antes de selecionar o objeto', async () => {
  const { commands, calls, selections, source } = createMediaCommandHarness()
  await commands.importImage('object')

  assert.deepEqual(calls.filter((call) => typeof call === 'string' || Array.isArray(call) && call[0] !== 'persist'), [
    'track', 'pause', ['image-use-case', 'object', 42], ['import-image', 'object'], ['load-latest', 'project']
  ])
  const persisted = calls.find((call) => Array.isArray(call) && call[0] === 'persist')
  assert.equal(persisted[1], source)
  assert.equal(persisted[2].assets[0].id, 'image-asset')
  assert.equal(persisted[2].elements[0].assetId, 'image-asset')
  assert.equal(selections.elementId, persisted[2].elements[0].id)
  assert.equal(selections.blockId, 'image-block')
  assert.equal(selections.tool, 'objects')
  assert.equal(selections.inspectorOpen, true)
  assert.equal(selections.inspectorTab, 'editor')
})

test('comandos da tela vinculam vídeo da biblioteca, salvam antes de selecionar e fecham o picker', async () => {
  const { commands, calls, selections, source } = createMediaCommandHarness()
  await commands.linkVideoLibraryItem({ id: 'library-video', name: 'Clipe escolhido' })

  assert.deepEqual(calls.filter((call) => typeof call === 'string' || Array.isArray(call) && call[0] !== 'persist'), [
    'track', 'pause', ['media-use-case', 42], ['link-video', 'project', 'library-video'], ['load-latest', 'project'], ['playhead', 42], ['picker', false]
  ])
  const persisted = calls.find((call) => Array.isArray(call) && call[0] === 'persist')
  assert.equal(persisted[1], source)
  assert.equal(persisted[2].media[0].libraryVideoId, 'library-video')
  assert.equal(selections.blockId, persisted[2].timeline.tracks.find((track) => track.kind === 'video').blocks[0].id)
  assert.equal(selections.elementId, null)
  assert.equal(selections.tool, null)
  assert.equal(selections.inspectorOpen, true)
})

test('comandos da tela importam áudio, persistem e só então selecionam o bloco', async () => {
  const { commands, calls, selections, source } = createMediaCommandHarness()
  await commands.importTimelineMedia('audio')

  assert.deepEqual(calls.filter((call) => typeof call === 'string' || Array.isArray(call) && call[0] !== 'persist'), [
    'track', 'pause', ['media-use-case', 42], ['import-media', 'project', 'audio'], ['load-latest', 'project'], ['playhead', 42]
  ])
  const persisted = calls.find((call) => Array.isArray(call) && call[0] === 'persist')
  assert.equal(persisted[1], source)
  assert.equal(persisted[2].media[0].kind, 'audio')
  assert.equal(persisted[2].timeline.tracks.find((track) => track.kind === 'audio').blocks[0].id, 'media-block')
  assert.equal(selections.blockId, 'media-block')
  assert.equal(selections.elementId, null)
  assert.equal(selections.tool, null)
  assert.equal(selections.inspectorOpen, true)
  assert.equal(selections.inspectorTab, 'editor')
})

test('comando de vídeo abre o seletor sem iniciar importação direta', async () => {
  const { commands, calls } = createMediaCommandHarness()
  await commands.importTimelineMedia('video')

  assert.deepEqual(calls, ['track', ['picker', true]])
})

test('comandos da tela bloqueiam importações quando a faixa ficou bloqueada', async () => {
  const lockedProject = mediaProject()
  lockedProject.timeline.tracks = [{ id: 'object', kind: 'object', name: 'Objetos', muted: false, locked: true, blocks: [] }]
  const { commands, calls } = createMediaCommandHarness({ activeProject: lockedProject })

  await commands.importImage('object')

  assert.ok(calls.includes('pause'))
  assert.deepEqual(calls.find((call) => Array.isArray(call) && call[0] === 'error'), [
    'error', 'Desbloqueie a faixa Objetos para adicionar uma imagem.'
  ])
  assert.equal(calls.some((call) => Array.isArray(call) && call[0] === 'image-use-case'), false)
})

test('selecionar imagem de fundo continua sincronizado com o frame atual do projeto', () => {
  const { commands, selections } = createMediaCommandHarness()
  commands.selectBackground({ id: 'background-1', category: 'background', name: 'Cenário', mimeType: 'image/png', dataUrl: 'data:image/png;base64,x' })

  assert.equal(selections.scene.backgroundAssetId, 'background-1')
  assert.equal(selections.scene.backgroundX, 0)
  assert.equal(selections.scene.backgroundWidth, 100)
  assert.equal(selections.elementId, 'background')
  assert.equal(selections.blockId, null)
  assert.equal(selections.inspectorTab, 'editor')
})

test('catálogo de poses limita leituras, conserva ordem e rejeita snapshots incompatíveis', async () => {
  const poses = Array.from({ length: 8 }, (_, index) => ({
    slot: index + 1,
    sourceModelSlot: index === 7 ? 9 : 2,
    name: `Pose ${index + 1}`,
    sourceModelName: 'Modelo 2',
    partCount: 1,
    updatedAt: '2026-01-01T00:00:00.000Z'
  }))
  const loads = []
  const rendered = []
  let active = 0
  let maxActive = 0
  const previews = await loadEditorV6PoseThumbnails({
    modelSlot: 2,
    poses,
    isCancelled: () => false,
    loadPose: async (modelSlot, poseSlot) => {
      loads.push([modelSlot, poseSlot])
      active += 1
      maxActive = Math.max(maxActive, active)
      await new Promise((resolve) => setTimeout(resolve, 2))
      active -= 1
      if (poseSlot === 5) throw new Error('pose ausente')
      return {
        schemaVersion: 1,
        sourceModelSlot: modelSlot,
        slot: poseSlot === 4 ? 40 : poseSlot,
        width: 100 + poseSlot,
        height: 200 + poseSlot,
        parts: [],
        joints: [],
        layerOrder: [],
        hiddenPartIds: []
      }
    },
    renderArtwork: async (artwork, maxSize) => {
      rendered.push([artwork.slot, maxSize])
      return artwork.slot === 2 ? null : `thumb:${artwork.slot}`
    }
  })

  assert.equal(maxActive, 3)
  assert.deepEqual(loads.map(([, slot]) => slot), [1, 2, 3, 4, 5, 6, 7])
  assert.deepEqual(previews, [1, 3, 6, 7].map((slot) => ({
    slot,
    thumbnail: `thumb:${slot}`,
    width: 100 + slot,
    height: 200 + slot
  })))
  assert.equal(rendered.some(([slot]) => slot === 40), false)
  assert.ok(rendered.every(([, maxSize]) => maxSize === 180))
})

test('catálogo de poses cancelado não inicia leituras', async () => {
  let loads = 0
  const previews = await loadEditorV6PoseThumbnails({
    modelSlot: 2,
    poses: [{ slot: 1, sourceModelSlot: 2, name: 'Pose', sourceModelName: 'Modelo 2', partCount: 1, updatedAt: 'v1' }],
    isCancelled: () => true,
    loadPose: async () => { loads += 1; return null },
    renderArtwork: async () => null
  })
  assert.deepEqual(previews, [])
  assert.equal(loads, 0)
})

test('página delega biblioteca, fontes e ciclo de atualização do personagem a módulos da feature', async () => {
  const [page, projectHook, characterHook, sourceModel, snapshotHook] = await Promise.all([
    readFile('src/renderer/src/features/editorV6/EditorV6Page.tsx', 'utf8'),
    readFile('src/renderer/src/features/editorV6/useEditorV6ProjectLibrary.ts', 'utf8'),
    readFile('src/renderer/src/features/editorV6/useEditorV6CharacterSources.ts', 'utf8'),
    readFile('src/renderer/src/features/editorV6/editorV6CharacterSourceModel.ts', 'utf8'),
    readFile('src/renderer/src/features/editorV6/useEditorV6CharacterSnapshotRefresh.ts', 'utf8')
  ])
  assert.match(page, /useEditorV6ProjectLibrary\(/)
  assert.match(page, /useEditorV6CharacterSources\(/)
  assert.match(page, /resolveEditorV6CharacterSourceRefresh\(/)
  assert.match(page, /useEditorV6CharacterSnapshotRefresh\(/)
  assert.doesNotMatch(page, /const activeCharacterStates|const poseRefreshRequired/)
  assert.doesNotMatch(page, /normalizedProjectIdsRef|planEditorV6CharacterRefresh|renderEditorV6CharacterRefresh/)
  assert.doesNotMatch(page, /window\.desktop\.customizer\.listCustomizerCharacters\(|window\.desktop\.editorV6\.listEditorV6Projects\(|window\.desktop\.editorV6\.loadEditorV6Project\(activeEditorV6Id\)/)
  assert.match(projectHook, /activeLoadGenerationRef/)
  assert.match(characterHook, /fabricator:assets-updated/)
  assert.match(characterHook, /addEventListener\('visibilitychange'/)
  assert.doesNotMatch(sourceModel, /window\.desktop|useEffect|useMemo/)
  assert.match(snapshotHook, /applyEditorV6CharacterAssetCrops/)
  assert.match(snapshotHook, /applyEditorV6CharacterRefreshResult/)
  assert.match(snapshotHook, /applyEditorV6CharacterRefreshResult\(current, result, pruneEditorV6TimelineSnapshots\)/)
})

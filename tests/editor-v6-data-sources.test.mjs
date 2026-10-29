import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { loadEditorV6ProjectCatalog } from '../src/renderer/src/features/editorV6/editorV6ProjectCatalog.ts'
import {
  createEditorV6PoseRevisionSnapshot,
  sameCustomizerCharacterCatalog,
  samePoseRevisionSnapshot
} from '../src/renderer/src/features/editorV6/useEditorV6CharacterSources.ts'
import { resolveEditorV6CharacterSourceRefresh } from '../src/renderer/src/features/editorV6/editorV6CharacterSourceModel.ts'
import { loadEditorV6PoseThumbnails } from '../src/renderer/src/features/editorV6/editorV6PoseCatalog.ts'
import {
  applyEditorV6CharacterAssetCrops,
  applyEditorV6CharacterRefreshResult
} from '../src/renderer/src/features/editorV6/editorV6CharacterRefreshModel.ts'

const validId = (value) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`
const projectSummary = (id) => ({ id, title: `Projeto ${id}`, color: '#d7b5cd', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' })
const legacyEntry = (id, title = `Legado ${id}`) => ({ id, title, color: '#ab77bb' })
const emptyTimeline = () => ({ fps: 30, durationFrames: 300, tracks: [] })

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
  assert.deepEqual(revisions, { '2:1': 'missing', '2:4': 'pose-v2' })
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
      poseSourceRevision: 'pose-v2', characterSourceUpdatedAt: 'character-v2', faceRendererVersion: 8
    }],
    timeline: { tracks: [{ blocks: [{ state: {
      id: 'timeline-character', kind: 'character', characterId: 'character', poseSlot: 5,
      poseSourceRevision: 'pose-v1', characterSourceUpdatedAt: 'character-v2', faceRendererVersion: 8
    } }] }] }
  }
  const input = {
    project,
    characterById: new Map([[character.id, character]]),
    poseSourceSnapshot: { projectId: 'project', revisions: { '2:4': 'pose-v2', '2:5': 'pose-v1' } },
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

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

test('página delega biblioteca e frescor da fonte de personagem a módulos da feature', async () => {
  const [page, projectHook, characterHook, sourceModel] = await Promise.all([
    readFile('src/renderer/src/features/editorV6/EditorV6Page.tsx', 'utf8'),
    readFile('src/renderer/src/features/editorV6/useEditorV6ProjectLibrary.ts', 'utf8'),
    readFile('src/renderer/src/features/editorV6/useEditorV6CharacterSources.ts', 'utf8'),
    readFile('src/renderer/src/features/editorV6/editorV6CharacterSourceModel.ts', 'utf8')
  ])
  assert.match(page, /useEditorV6ProjectLibrary\(/)
  assert.match(page, /useEditorV6CharacterSources\(/)
  assert.match(page, /resolveEditorV6CharacterSourceRefresh\(/)
  assert.doesNotMatch(page, /const activeCharacterStates|const poseRefreshRequired/)
  assert.doesNotMatch(page, /window\.desktop\.customizer\.listCustomizerCharacters\(|window\.desktop\.editorV6\.listEditorV6Projects\(|window\.desktop\.editorV6\.loadEditorV6Project\(activeEditorV6Id\)/)
  assert.match(projectHook, /activeLoadGenerationRef/)
  assert.match(characterHook, /fabricator:assets-updated/)
  assert.match(characterHook, /addEventListener\('visibilitychange'/)
  assert.doesNotMatch(sourceModel, /window\.desktop|useEffect|useMemo/)
})

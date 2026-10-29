import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { loadEditorV6ProjectCatalog } from '../src/renderer/src/features/editorV6/editorV6ProjectCatalog.ts'
import {
  createEditorV6PoseRevisionSnapshot,
  sameCustomizerCharacterCatalog,
  samePoseRevisionSnapshot
} from '../src/renderer/src/features/editorV6/useEditorV6CharacterSources.ts'

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

test('página delega biblioteca e fontes de personagem aos hooks da feature', async () => {
  const [page, projectHook, characterHook] = await Promise.all([
    readFile('src/renderer/src/features/editorV6/EditorV6Page.tsx', 'utf8'),
    readFile('src/renderer/src/features/editorV6/useEditorV6ProjectLibrary.ts', 'utf8'),
    readFile('src/renderer/src/features/editorV6/useEditorV6CharacterSources.ts', 'utf8')
  ])
  assert.match(page, /useEditorV6ProjectLibrary\(/)
  assert.match(page, /useEditorV6CharacterSources\(/)
  assert.doesNotMatch(page, /window\.desktop\.customizer\.listCustomizerCharacters\(|window\.desktop\.editorV6\.listEditorV6Projects\(|window\.desktop\.editorV6\.loadEditorV6Project\(activeEditorV6Id\)/)
  assert.match(projectHook, /activeLoadGenerationRef/)
  assert.match(characterHook, /fabricator:assets-updated/)
  assert.match(characterHook, /addEventListener\('visibilitychange'/)
})

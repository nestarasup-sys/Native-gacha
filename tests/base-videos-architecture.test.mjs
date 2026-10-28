/** Testes de regressão do novo módulo, executáveis sem Electron nem arquivos reais. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { BaseVideoService } from '../electron/domains/baseVideos/service.ts'
import { registerBaseVideoHandlers } from '../electron/domains/baseVideos/ipc.ts'
import { createVideoReferenceGuard } from '../electron/domains/mediaLibrary/videoReferences.ts'
import { createRoteirosVideoReferenceLookup } from '../electron/domains/roteiros/videoReferences.ts'
import { createEditorV6VideoReferenceLookup } from '../electron/domains/editorV6/videoReferences.ts'
import { assertBaseVideoId, nextCategoryColor, normalizeCategoryName, validateVideoDetails } from '../electron/domains/baseVideos/validation.ts'

const A = 'a2189020-8327-4327-a4a6-442ed9902123'
const B = 'b2189020-8327-4327-a4a6-442ed9902123'
const C = 'c2189020-8327-4327-a4a6-442ed9902123'

function fixture() {
  const db = new DatabaseSync(':memory:')
  db.exec(`PRAGMA foreign_keys = ON;
    CREATE TABLE base_video_categories (category_id TEXT PRIMARY KEY, name TEXT NOT NULL COLLATE NOCASE UNIQUE, color_hex TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL);
    CREATE TABLE base_video_details (video_id TEXT PRIMARY KEY, video_number INTEGER UNIQUE, description_text TEXT NOT NULL DEFAULT '', timeline TEXT NOT NULL DEFAULT 'unspecified', scene_end_seconds REAL, first_group_reaction_seconds REAL, second_group_reaction_seconds REAL, additional_context TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL);
    CREATE TABLE base_video_category_assignments (video_id TEXT PRIMARY KEY REFERENCES base_video_details(video_id) ON DELETE CASCADE, category_id TEXT NOT NULL REFERENCES base_video_categories(category_id) ON DELETE CASCADE, assigned_at TEXT NOT NULL);
    CREATE TABLE base_video_sequence (sequence_id INTEGER PRIMARY KEY, next_number INTEGER NOT NULL);
    CREATE TABLE roteiro_sections (id TEXT PRIMARY KEY, video_asset_json TEXT);`)
  // DatabaseSync e better-sqlite3 oferecem prepare/run/get/all, mas só better-sqlite3
  // implementa transaction(fn). Adaptamos APENAS essa operação para o teste SQL real.
  const sql = {
    prepare: (query) => db.prepare(query),
    transaction: (fn) => (...args) => {
      db.exec('BEGIN')
      try {
        const result = fn(...args)
        db.exec('COMMIT')
        return result
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }
    }
  }
  const calls = []
  const media = new Map([[A, { path: '/synthetic/A.mp4', durationFrames: 120 }], [B, { path: '/synthetic/B.mp4', durationFrames: 100 }]])
  let pending = Promise.resolve()
  const service = new BaseVideoService({
    getDatabase: () => sql,
    enqueueWrite: (operation) => {
      const next = pending.catch(() => undefined).then(operation)
      pending = next.then(() => undefined)
      return next
    },
    resolveMedia: async (id) => { calls.push(`resolve:${id}`); const result = media.get(id); if (!result) throw new Error('Mídia não encontrada.'); return result },
    assertMediaAccessible: async (path) => { calls.push(`access:${path}`); if (path.endsWith('missing')) throw new Error('Arquivo ausente.') },
    coordinateVideoReferenceChange: async (operation) => operation(),
    assertNoVideoReferences: createVideoReferenceGuard([createRoteirosVideoReferenceLookup(() => sql)]),
    deleteLibraryVideo: async (id) => { calls.push(`delete:${id}`); if (id === C) throw new Error('Falha na biblioteca.') }
  })
  return { db, service, calls, media }
}

test('validação pura rejeita entradas fora de contrato', () => {
  assert.throws(() => assertBaseVideoId('../evil'), /Identificador/)
  assert.doesNotThrow(() => assertBaseVideoId(A))
  assert.equal(normalizeCategoryName('  Looks  '), 'Looks')
  assert.throws(() => normalizeCategoryName('   '), /60 caracteres/)
  assert.throws(() => validateVideoDetails({ description: '', timeline: 'past' }), /Dados do vídeo/)
  assert.throws(() => validateVideoDetails({ videoId: A, description: '', timeline: 'alien' }), /Dados do vídeo/)
  assert.throws(() => validateVideoDetails({ videoId: A, description: '', timeline: 'past', sceneEndSeconds: -1 }), /Dados do vídeo/)
  assert.throws(() => validateVideoDetails({ videoId: A, description: '', timeline: 'past', categoryId: '../../p' }), /Dados do vídeo/)
  assert.doesNotThrow(() => validateVideoDetails({ videoId: A, description: '', timeline: 'unspecified' }))
  assert.equal(nextCategoryColor(new Set()), '#dc5368')
  assert.equal(nextCategoryColor(new Set(['#dc5368'])), '#e58b3a')
})

test('categorias: criação, nomes únicos, cores distintas, edição e exclusão', async (t) => {
  const { db, service } = fixture()
  t.after(() => db.close())
  const first = service.createCategory('  Animações ')
  const second = service.createCategory('Cenas')
  assert.equal(first.name, 'Animações')
  assert.notEqual(first.color, second.color)
  assert.deepEqual(service.listCategories().map(({ name }) => name), ['Animações', 'Cenas'])
  assert.throws(() => service.createCategory('animações'), /Já existe/)
  assert.equal(service.renameCategory(second.id, 'Vídeos').name, 'Vídeos')
  await service.deleteCategory(first.id)
  assert.deepEqual(service.listCategories().map(({ name }) => name), ['Vídeos'])
})

test('detalhes: gravação, atribuição de categoria, rollback e remoção da atribuição', async (t) => {
  const { db, service } = fixture()
  t.after(() => db.close())
  const category = service.createCategory('Drama')
  await service.saveDetails({ videoId: A, description: 'Teste', timeline: 'past', sceneEndSeconds: 10, categoryId: category.id, additionalContext: 'contexto' })
  assert.deepEqual(service.listDetails().map((r) => [r.videoId, r.description, r.categoryId, r.sceneEndSeconds]), [[A, 'Teste', category.id, 10]])
  await assert.rejects(service.saveDetails({ videoId: A, description: 'NÃO DEVE GRAVAR', timeline: 'future', categoryId: B }), /categoria selecionada/)
  assert.equal(service.listDetails()[0].description, 'Teste', 'transação deve reverter descrição após erro de categoria')
  await service.saveDetails({ videoId: A, description: 'Nova', timeline: 'present' })
  assert.equal(service.listDetails()[0].categoryId, category.id, 'categoria omitida deve ser preservada')
  await service.saveDetails({ videoId: A, description: 'Nova', timeline: 'present', categoryId: null })
  assert.equal(service.listDetails()[0].categoryId, undefined)
  await service.deleteDetails(A)
  assert.equal(service.listDetails().length, 0)
})

test('publicação: numeração estável, transação sequencial e validação de mídia', async (t) => {
  const { db, service, media, calls } = fixture()
  t.after(() => db.close())
  await service.saveDetails({ videoId: A, description: 'Descrição existente', timeline: 'past' })
  assert.equal(await service.publishVideo(A), 1)
  assert.equal(await service.publishVideo(A), 1)
  assert.equal(await service.publishVideo(B), 2)
  assert.equal(service.listDetails().find((x) => x.videoId === A).description, 'Descrição existente')
  assert.equal(db.prepare('SELECT next_number FROM base_video_sequence WHERE sequence_id=1').get().next_number, 3)
  media.set(C, { path: '/synthetic/C.mp4', durationFrames: null })
  await assert.rejects(service.publishVideo(C), /duração/)
  media.set(C, { path: '/synthetic/missing', durationFrames: 20 })
  await assert.rejects(service.publishVideo(C), /Arquivo ausente/)
  assert.deepEqual(calls.slice(0, 2), [`resolve:${A}`, 'access:/synthetic/A.mp4'])
  assert.equal(db.prepare('SELECT COUNT(*) AS total FROM base_video_details').get().total, 2)
})

test('exclusão: roteiro referenciando mídia impede apagar; ordem biblioteca → metadados', async (t) => {
  const { db, service, calls } = fixture()
  t.after(() => db.close())
  await service.saveDetails({ videoId: A, description: 'Manter se referenciado', timeline: 'past' })
  db.prepare('INSERT INTO roteiro_sections (id, video_asset_json) VALUES (?, ?)').run('section', JSON.stringify({ id: A }))
  await assert.rejects(service.deleteVideo(A), /sendo usado/)
  assert.equal(calls.includes(`delete:${A}`), false)
  db.prepare('DELETE FROM roteiro_sections').run()
  await service.deleteVideo(A)
  assert.equal(calls.at(-1), `delete:${A}`)
  assert.equal(service.listDetails().length, 0)
})

test('proteção de mídia: vínculo do Editor V6 impede excluir o vídeo', async () => {
  const assertNoReferences = createVideoReferenceGuard([createEditorV6VideoReferenceLookup({
    listProjects: async () => [{ id: 'project-1', title: 'Cena de teste' }],
    readManifest: async () => JSON.stringify({ media: [{ libraryVideoId: A }] })
  })])
  await assert.rejects(assertNoReferences(A), /projeto “Cena de teste” do Editor V6/)
})

test('IPC: os nove canais verificam origem em cada chamada antes da regra', async (t) => {
  const { db, service } = fixture()
  t.after(() => db.close())
  const handlers = new Map()
  registerBaseVideoHandlers({ handle(name, handler) { handlers.set(name, handler) } }, (event) => {
    if (event.allowed !== true) throw new Error('Origem não autorizada')
  }, service)
  assert.deepEqual([...handlers.keys()], [
    'base-videos:list-details', 'base-videos:categories:list', 'base-videos:categories:create',
    'base-videos:categories:rename', 'base-videos:categories:delete', 'base-videos:save-details',
    'base-videos:delete-details', 'base-videos:delete', 'base-videos:publish'
  ])
  for (const handler of handlers.values()) {
    await assert.rejects(Promise.resolve().then(() => handler({ allowed: false })), /Origem não autorizada/)
  }
  const category = await handlers.get('base-videos:categories:create')({ allowed: true }, 'Ação')
  assert.equal(category.name, 'Ação')
  assert.equal((await handlers.get('base-videos:categories:list')({ allowed: true })).length, 1)
})

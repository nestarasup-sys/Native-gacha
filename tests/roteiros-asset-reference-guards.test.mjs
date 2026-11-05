import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { createBackgroundLibraryService } from '../electron/domains/mediaLibrary/backgroundLibraryService.ts'
import { createRoteiroBackgroundReferenceGuard, createRoteiroUiGifReferenceGuard } from '../electron/domains/roteiros/assetReferences.ts'
import { createRoteiroUiGifsService } from '../electron/domains/roteiros/uiGifsService.ts'

const BACKGROUND_ID = 'a2189020-8327-4327-a4a6-442ed9902123'
const GIF_ID = 'b2189020-8327-4327-a4a6-442ed9902123'

function fixture() {
  const database = new DatabaseSync(':memory:')
  database.exec(`CREATE TABLE roteiros (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, background_asset_id TEXT, ui_gif_asset_id TEXT
  )`)
  const deleted = []
  const run = (operation) => operation()
  const background = createBackgroundLibraryService({
    openImportDialog: async () => null,
    library: { list: async () => [], importFile: async () => { throw new Error('unused') }, rename: async () => {}, delete: async (id) => deleted.push(`background:${id}`) },
    assertRoteiroUnreferenced: createRoteiroBackgroundReferenceGuard(() => database),
    assertEditorV6Unreferenced: async () => {}, editorV6References: async () => [], coordinateReferenceChange: run,
    enqueueWrite: run
  })
  const gifs = createRoteiroUiGifsService({
    getDefaultGifPath: () => '/synthetic/default.gif',
    openImportDialog: async () => null,
    library: { list: async () => [], importFile: async () => { throw new Error('unused') }, delete: async (id) => deleted.push(`gif:${id}`) },
    assertUnreferenced: createRoteiroUiGifReferenceGuard(() => database),
    enqueueWrite: run
  })
  return { database, deleted, background, gifs }
}

test('fundo associado a um roteiro não pode ser apagado da biblioteca compartilhada', async (t) => {
  const { database, deleted, background } = fixture()
  t.after(() => database.close())
  database.prepare('INSERT INTO roteiros (id, title, background_asset_id) VALUES (?, ?, ?)')
    .run('roteiro-1', 'Roteiro de teste', BACKGROUND_ID)

  await assert.rejects(background.delete(BACKGROUND_ID), /Este fundo está selecionado no roteiro “Roteiro de teste”/)
  assert.deepEqual(deleted, [])

  database.prepare('UPDATE roteiros SET background_asset_id=NULL WHERE id=?').run('roteiro-1')
  await background.delete(BACKGROUND_ID)
  assert.deepEqual(deleted, [`background:${BACKGROUND_ID}`])
})

test('GIF associado a um roteiro não pode ser apagado da biblioteca compartilhada', async (t) => {
  const { database, deleted, gifs } = fixture()
  t.after(() => database.close())
  database.prepare('INSERT INTO roteiros (id, title, ui_gif_asset_id) VALUES (?, ?, ?)')
    .run('roteiro-1', 'Roteiro de teste', GIF_ID)

  await assert.rejects(gifs.delete(GIF_ID), /Este GIF está selecionado no roteiro “Roteiro de teste”/)
  assert.deepEqual(deleted, [])

  database.prepare('UPDATE roteiros SET ui_gif_asset_id=NULL WHERE id=?').run('roteiro-1')
  await gifs.delete(GIF_ID)
  assert.deepEqual(deleted, [`gif:${GIF_ID}`])
})

test('biblioteca não apaga assets se o catálogo ainda não estiver disponível', async () => {
  const deleted = []
  const assertUnreferenced = createRoteiroBackgroundReferenceGuard(() => null)
  const library = createBackgroundLibraryService({
    openImportDialog: async () => null,
    library: { list: async () => [], importFile: async () => { throw new Error('unused') }, rename: async () => {}, delete: async (id) => deleted.push(id) },
    assertRoteiroUnreferenced: assertUnreferenced,
    assertEditorV6Unreferenced: async () => {}, editorV6References: async () => [], coordinateReferenceChange: (operation) => operation(),
    enqueueWrite: (operation) => operation()
  })
  await assert.rejects(library.delete(BACKGROUND_ID), /Catálogo de dados não inicializado/)
  assert.deepEqual(deleted, [])
})

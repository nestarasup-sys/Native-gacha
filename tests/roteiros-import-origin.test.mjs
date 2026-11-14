import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { RoteirosRepository } from '../electron/domains/roteiros/repository.ts'

const require = createRequire(import.meta.url)
const Database = require('better-sqlite3')
const schema = require('../electron/domains/storage/catalogSchema.cjs')

test('schema 19 guarda o JSON V6 original junto à origem e remove metadados ao apagar o roteiro', () => {
  const db = new Database(':memory:')
  try {
    schema.initializeCatalogSchema(db, 0)
    const repository = new RoteirosRepository(db)
    const roteiro = { id: 'roteiro-1', title: 'Roteiro IA', videoTitle: 'Vídeo 01', characterIds: [], tiktoks: [], importOrigin: { kind: 'ai-json', importId: '123e4567-e89b-42d3-a456-426614174001', importedAt: '2026-11-05T00:00:00.000Z', createdCharacterIds: [], sourceTitle: 'Roteiro IA', sourceFormat: 'NYMI_EDITOR_V6_REACT_V1', sourceDocument: { format: 'NYMI_EDITOR_V6_REACT_V1', title: 'Roteiro IA', cast: [{ character: 'Íris', x: -20, y: 0 }], videos: [], lines: [], beats: [] } } }
    repository.save([roteiro])
    assert.deepEqual(repository.list()[0].importOrigin, roteiro.importOrigin)
    assert.equal(db.pragma('user_version', { simple: true }), 19)
    repository.save([])
    assert.equal(db.prepare('SELECT count(*) AS count FROM roteiro_import_origins').get().count, 0)
  } finally { db.close() }
})

test('migra a tabela de origem já existente do schema 18 sem remover colunas antigas', () => {
  const db = new Database(':memory:')
  try {
    schema.initializeCatalogSchema(db, 0)
    db.exec('ALTER TABLE roteiro_import_origins DROP COLUMN source_document_json; ALTER TABLE roteiro_import_origins DROP COLUMN source_format;')
    db.pragma('user_version = 18')
    schema.initializeCatalogSchema(db, 18)
    const columns = new Set(db.prepare('PRAGMA table_info(roteiro_import_origins)').all().map((column) => column.name))
    assert.equal(columns.has('import_id'), true)
    assert.equal(columns.has('source_format'), true)
    assert.equal(columns.has('source_document_json'), true)
    assert.equal(db.pragma('user_version', { simple: true }), 19)
  } finally { db.close() }
})

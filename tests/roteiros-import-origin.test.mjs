import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { RoteirosRepository } from '../electron/domains/roteiros/repository.ts'

const require = createRequire(import.meta.url)
const Database = require('better-sqlite3')
const schema = require('../electron/domains/storage/catalogSchema.cjs')

test('schema 18 guarda origem da importação, lista corretamente e remove metadados ao apagar o roteiro', () => {
  const db = new Database(':memory:')
  try {
    schema.initializeCatalogSchema(db, 0)
    const repository = new RoteirosRepository(db)
    const roteiro = { id: 'roteiro-1', title: 'Roteiro IA', videoTitle: 'Vídeo 01', characterIds: [], tiktoks: [], importOrigin: { kind: 'ai-json', importId: 'import-1', importedAt: '2026-11-05T00:00:00.000Z', createdCharacterIds: ['character-1'], sourceTitle: 'Roteiro IA' } }
    repository.save([roteiro])
    assert.deepEqual(repository.list()[0].importOrigin, roteiro.importOrigin)
    assert.equal(db.pragma('user_version', { simple: true }), 18)
    repository.save([])
    assert.equal(db.prepare('SELECT count(*) AS count FROM roteiro_import_origins').get().count, 0)
  } finally { db.close() }
})

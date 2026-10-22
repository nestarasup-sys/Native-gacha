import test from 'node:test'
import assert from 'node:assert/strict'
import { isRoteiroDocument } from '../electron/domains/roteiros/validation.ts'
const root = 'a2189020-8327-4327-a4a6-442ed9902123'
const child = 'b2189020-8327-4327-a4a6-442ed9902123'
const character = 'c2189020-8327-4327-a4a6-442ed9902123'
const valid = () => ({ id: root, title: 'Roteiro', videoTitle: 'Vídeo', characterIds: [character],
  opening: { video: null, blocks: [{ id: child, characterId: character, kind: 'fala', expression: '', textPortuguese: 'Olá', textEnglish: 'Hello' }] }, tiktoks: [] })

test('regras de roteiro preservadas após extração do main', () => {
  assert.equal(isRoteiroDocument(valid()), true)
  assert.equal(isRoteiroDocument({ ...valid(), id: '../arquivo' }), false)
  assert.equal(isRoteiroDocument({ ...valid(), title: ' ' }), false)
  assert.equal(isRoteiroDocument({ ...valid(), tiktoks: Array.from({ length: 501 }, () => ({})) }), false)
  assert.equal(isRoteiroDocument({ ...valid(), opening: { ...valid().opening, blocks: [{ ...valid().opening.blocks[0], characterId: root }] } }), false)
  assert.equal(isRoteiroDocument({ ...valid(), opening: { ...valid().opening, sceneEndSeconds: -2 } }), false)
  assert.equal(isRoteiroDocument({ ...valid(), opening: { ...valid().opening, blocks: [], video: { id: child, name: 'Teste', extension: 'mp4', mimeType: 'video/webm', size: 10, durationFrames: 50 } } }), false)
  assert.equal(isRoteiroDocument(null), false)
})

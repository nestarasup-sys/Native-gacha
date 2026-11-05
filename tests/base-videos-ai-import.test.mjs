import test from 'node:test'
import assert from 'node:assert/strict'
import { validateAiImport, createRoteiroFromAiImport, AI_IMPORT_FORMAT } from '../src/renderer/src/features/baseVideos/baseVideosAiImport.ts'
import { isRoteiroDocument } from '../electron/domains/roteiros/validation.ts'

const video = { id: '123e4567-e89b-42d3-a456-426614174000', name: 'cena.mp4', mimeType: 'video/mp4', extension: 'mp4', size: 1000, durationFrames: 600, createdAt: '2026-01-01T00:00:00.000Z', available: true }
const character = { id: '123e4567-e89b-42d3-a456-426614174001', name: 'Íris', hair: '#000', outfit: '#000', skin: '#000', customization: { modelSlot: null, poseSlot: null, partOverrides: {}, layerOrder: [] }, createdAt: '', updatedAt: '' }
const sample = () => ({ format: AI_IMPORT_FORMAT, title: 'Roteiro teste', videos: [{ videoId: video.id, order: 1 }], characters: [{ characterId: character.id }], blocks: [{ type: 'speech', characterId: character.id, videoId: video.id, text: 'Olá', startAt: 2 }] })

test('valida IDs locais e rejeita mídia ausente, duplicatas e referências de bloco quebradas', () => {
  assert.equal(validateAiImport(sample(), [video], [character]).data?.title, 'Roteiro teste')
  const invalid = sample(); invalid.videos.push({ videoId: video.id, order: 2 })
  assert.match(validateAiImport(invalid, [video], [character]).errors.join(' '), /mais de uma vez/)
  const broken = sample(); broken.blocks[0].characterId = 'missing'
  assert.match(validateAiImport(broken, [video], [character]).errors.join(' '), /personagem não selecionado/)
  assert.equal(validateAiImport(sample(), [], [character]).data, null)
})

test('converte o JSON em roteiro nativo e mantém tempo, elenco e referência de origem', () => {
  const validation = validateAiImport(sample(), [video], [character])
  const generatedIds = ['123e4567-e89b-42d3-a456-426614174002', '123e4567-e89b-42d3-a456-426614174003', '123e4567-e89b-42d3-a456-426614174004']
  const document = createRoteiroFromAiImport(validation.data, [video], {}, new Map(), '123e4567-e89b-42d3-a456-426614174005', [], () => generatedIds.shift())
  assert.equal(document.tiktoks[0].video.id, video.id)
  assert.equal(document.tiktoks[0].blocks[0].kind, 'fala')
  assert.equal(document.tiktoks[0].blocks[0].startAt, 2)
  assert.equal(document.importOrigin?.kind, 'ai-json')
  assert.equal(isRoteiroDocument(document), true)
})

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

test('aceita o contrato JSON V6 do guia, vincula falas ao vídeo local e preserva o documento integral', () => {
  const v6 = {
    format: 'NYMI_EDITOR_V6_REACT_V1', title: 'Cena V6',
    cast: [{ character: character.name, x: -25, y: 0, poseSlot: 1, expression: 'Séria' }],
    videos: [{ videoId: video.id, startSeconds: 10, durationSeconds: 8, layout: { x: 0, y: 0, width: 40, height: 40, rotation: 0 } }],
    lines: [{ character: character.name, kind: 'speech', text: 'Fal fala literal', startSeconds: 12, durationSeconds: 3 }],
    beats: [{ character: character.name, startSeconds: 12, expression: 'Séria' }], durationSeconds: 20
  }
  const validation = validateAiImport(v6, [video], [character], {})
  assert.equal(validation.data?.format, 'NYMI_EDITOR_V6_REACT_V1')
  assert.equal(validation.data?.blocks[0].videoId, video.id)
  assert.equal(validation.data?.blocks[0].startAt, 2)
  assert.match(validation.warnings.join(' '), /beats, posições/)
  const ids = ['123e4567-e89b-42d3-a456-426614174006', '123e4567-e89b-42d3-a456-426614174007', '123e4567-e89b-42d3-a456-426614174008']
  const roteiro = createRoteiroFromAiImport(validation.data, [video], {}, new Map(), '123e4567-e89b-42d3-a456-426614174005', [], () => ids.shift())
  assert.equal(roteiro.importOrigin?.sourceFormat, 'NYMI_EDITOR_V6_REACT_V1')
  assert.equal(roteiro.importOrigin?.sourceDocument?.beats[0].expression, 'Séria')
  assert.equal(roteiro.importOrigin?.sourceDocument?.seed, undefined, 'o JSON recuperado mantém as omissões do arquivo original')
  assert.equal(isRoteiroDocument(roteiro), true)
})

test('rejeita JSON V6 com personagem não cadastrado e fala em lacuna da timeline', () => {
  const v6 = { format: 'NYMI_EDITOR_V6_REACT_V1', title: 'Inválido', cast: [{ character: character.name, x: 0, y: 0 }], videos: [{ videoId: video.id, startSeconds: 10, durationSeconds: 2 }], lines: [{ character: character.name, kind: 'speech', text: 'x', startSeconds: 15, durationSeconds: 1 }], beats: [] }
  const result = validateAiImport(v6, [video], [character], {})
  assert.equal(result.data, null)
  assert.match(result.errors.join(' '), /não está dentro de nenhum vídeo/)
  v6.cast[0].character = 'Fantasma'
  v6.lines[0].character = 'Fantasma'
  assert.match(validateAiImport(v6, [video], [character], {}).errors.join(' '), /Personagem não encontrado/)
})

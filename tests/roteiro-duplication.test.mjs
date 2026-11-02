import test from 'node:test'
import assert from 'node:assert/strict'
import { duplicateRoteiroDocument } from '../src/renderer/src/features/roteiros/duplicateRoteiroDocument.ts'

function idSequence(...ids) {
  let index = 0
  return () => ids[index++] ?? `generated-${index}`
}

test('duplicar roteiro gera IDs próprios e mantém referências vivas de mídia e elenco', () => {
  const source = {
    id: 'roteiro-original', title: 'Roteiro de teste', videoTitle: 'Vídeo original', characterIds: ['personagem-1'],
    opening: { video: { id: 'video-abertura', name: 'Abertura', mimeType: 'video/mp4', extension: 'mp4', size: 80, durationFrames: 60 }, blocks: [{ id: 'bloco-abertura', characterId: 'personagem-1', kind: 'fala', expression: 'alegre', textPortuguese: 'oi', textEnglish: 'hi' }] },
    tiktoks: [{ id: 'tiktok-1', title: 'Parte 1', videoTitle: 'Vídeo 1', video: { id: 'video-tiktok', name: 'TikTok', mimeType: 'video/mp4', extension: 'mp4', size: 120, durationFrames: 90 }, blocks: [{ id: 'bloco-tiktok', characterId: 'personagem-1', kind: 'fala', expression: 'sério', textPortuguese: 'não', textEnglish: 'no' }] }]
  }
  const copy = duplicateRoteiroDocument(source, idSequence('roteiro-copia', 'bloco-abertura-copia', 'tiktok-copia', 'bloco-tiktok-copia'))

  assert.equal(copy.title, 'Roteiro de teste (cópia)')
  assert.notEqual(copy.id, source.id)
  assert.notEqual(copy.opening?.blocks[0].id, source.opening.blocks[0].id)
  assert.notEqual(copy.tiktoks[0].id, source.tiktoks[0].id)
  assert.notEqual(copy.tiktoks[0].blocks?.[0].id, source.tiktoks[0].blocks[0].id)
  assert.equal(copy.opening?.video?.id, source.opening.video.id)
  assert.equal(copy.tiktoks[0].video?.id, source.tiktoks[0].video.id)
  assert.notEqual(copy.opening?.video, source.opening.video)
  assert.notEqual(copy.characterIds, source.characterIds)
  assert.deepEqual(copy.characterIds, source.characterIds)
  assert.equal(source.opening.blocks[0].id, 'bloco-abertura')
  assert.equal(source.tiktoks[0].blocks[0].id, 'bloco-tiktok')
})

test('duplicação mantém compatibilidade com abertura ausente e blocos opcionais antigos', () => {
  const source = { id: 'legacy', title: 'Legado', videoTitle: 'Vídeo', characterIds: [], tiktoks: [{ id: 'legacy-tiktok', title: 'Parte', videoTitle: 'Vídeo', blocks: undefined }] }
  const copy = duplicateRoteiroDocument(source, idSequence('copy', 'copy-tiktok'))

  assert.deepEqual(copy.opening, { video: null, blocks: [], description: '', additionalContext: '', timeline: 'unspecified' })
  assert.equal(copy.tiktoks[0].blocks, undefined)
  assert.equal(copy.tiktoks[0].id, 'copy-tiktok')
  assert.equal(source.opening, undefined)
})

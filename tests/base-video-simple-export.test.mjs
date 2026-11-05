import test from 'node:test'
import assert from 'node:assert/strict'
import { formatSimpleVideoExport, selectSimpleExportEntries } from '../src/renderer/src/features/baseVideos/baseVideoSimpleExport.ts'

const item = (id, createdAt = '2026-01-01T00:00:00.000Z') => ({ id, name: `${id}.mp4`, mimeType: 'video/mp4', extension: 'mp4', size: 100, durationFrames: 600, createdAt, available: true })
const details = (videoId, patch = {}) => ({ videoId, description: '', timeline: 'unspecified', ...patch })

test('export simples filtra todas as categorias e sem categoria, incluindo rascunhos', () => {
  const entries = [
    { item: item('draft'), details: details('draft') },
    { item: item('categorized'), details: details('categorized', { videoNumber: 9, categoryId: 'cat' }), category: { id: 'cat', name: 'Ação', color: '#111', createdAt: '' } },
    { item: item('earlier'), details: details('earlier', { videoNumber: 2 }) }
  ]
  assert.deepEqual(selectSimpleExportEntries(entries, 'all').map(({ item: entry }) => entry.id), ['earlier', 'categorized', 'draft'])
  assert.deepEqual(selectSimpleExportEntries(entries, 'uncategorized').map(({ item: entry }) => entry.id), ['earlier', 'draft'])
  assert.deepEqual(selectSimpleExportEntries(entries, 'cat').map(({ item: entry }) => entry.id), ['categorized'])
})

test('formato TXT conserva os campos atuais e não inventa contagens de falas', () => {
  const text = formatSimpleVideoExport([{
    item: item('cena'),
    details: details('cena', { videoNumber: 2, description: 'A personagem entra.', sceneEndSeconds: 4.5, firstGroupReactionSeconds: 2, secondGroupReactionSeconds: 8, timeline: 'past', additionalContext: 'Tom dramático.' }),
    category: { id: 'cat', name: 'Drama', color: '#111', createdAt: '' }
  }])
  assert.match(text, /VÍDEO 02 — cena\.mp4/)
  assert.match(text, /TEMPO QUE TERMINA A CENA DA DESCRIÇÃO: 4\.50 segundos/)
  assert.match(text, /CATEGORIA: Drama/)
  assert.match(text, /LINHA DO TEMPO: Passado/)
  assert.match(text, /CONTEXTO ADICIONAL PARA IA:\nTom dramático\./)
  assert.doesNotMatch(text, /QUANTIDADE DE FALAS/)
  assert.doesNotMatch(text, /Contagem de falas/)
})

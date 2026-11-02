import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { loadBaseVideosSnapshot } from '../src/renderer/src/features/baseVideos/loadBaseVideosSnapshot.ts'

function video(id) {
  return {
    id,
    name: `${id}.mp4`,
    mimeType: 'video/mp4',
    extension: 'mp4',
    size: 2048,
    durationFrames: 600,
    createdAt: '2026-01-01T00:00:00.000Z',
    available: true
  }
}

test('carrega biblioteca, metadados e categorias em paralelo e mantém o contrato por ID', async () => {
  const calls = []
  const library = [video('video-a'), video('video-b')]
  const savedDetails = [
    { videoId: 'video-a', description: 'salvo', timeline: 'past', categoryId: 'cat-1' },
    { videoId: 'orphan', description: 'sem mídia', timeline: 'future' }
  ]
  const categories = [{ id: 'cat-1', name: 'Reações', color: '#dc5368', createdAt: '2026-01-01T00:00:00.000Z' }]

  const snapshot = await loadBaseVideosSnapshot({
    listLibrary: async () => { calls.push('library'); return library },
    listDetails: async () => { calls.push('details'); return savedDetails },
    listCategories: async () => { calls.push('categories'); return categories }
  })

  assert.deepEqual(calls, ['library', 'details', 'categories'])
  assert.deepEqual(snapshot.items, library)
  assert.deepEqual(snapshot.categories, categories)
  assert.deepEqual(snapshot.detailsById, {
    'video-a': savedDetails[0],
    'video-b': { videoId: 'video-b', categoryId: null, description: '', additionalContext: '', timeline: 'unspecified' }
  })
  assert.equal(snapshot.detailsById.orphan, undefined)
})

test('propaga falhas de qualquer leitura sem criar um snapshot parcial', async () => {
  await assert.rejects(loadBaseVideosSnapshot({
    listLibrary: async () => [video('video-a')],
    listDetails: async () => { throw new Error('metadados indisponíveis') },
    listCategories: async () => []
  }), /metadados indisponíveis/)
})

test('a carga inicial e a tentativa de novo usam o mesmo loader e mantêm cancelamento do efeito', async () => {
  const page = await readFile(new URL('../src/renderer/src/features/baseVideos/BaseVideosPage.tsx', import.meta.url), 'utf8')
  const loadCalls = page.match(/loadBaseVideosSnapshot\(/g) ?? []

  assert.equal(loadCalls.length, 2)
  assert.match(page, /if \(cancelled\) return/)
  assert.match(page, /const retryLoad = async \(\) =>/)
})

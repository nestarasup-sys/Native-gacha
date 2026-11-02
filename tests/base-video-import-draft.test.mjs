import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { importBaseVideoDraft } from '../src/renderer/src/features/baseVideos/importBaseVideoDraft.ts'

const item = {
  id: 'video-1',
  name: 'video.mp4',
  mimeType: 'video/mp4',
  extension: 'mp4',
  size: 100,
  durationFrames: null,
  createdAt: '2026-11-01T00:00:00.000Z',
  available: true
}

function createHarness(overrides = {}) {
  const calls = []
  const dependencies = {
    importVideo: async () => { calls.push('import'); return item },
    saveDetails: async (details) => { calls.push(['save-details', details]) },
    publishToSession: (video, details) => calls.push(['publish', video.id, details.videoId]),
    recognizeDuration: async (video) => { calls.push(['recognize', video.id]); return { ...video, durationFrames: 60 } },
    updateSessionItem: (video) => calls.push(['update-item', video.id, video.durationFrames]),
    deleteIncompleteImport: async (id) => { calls.push(['delete-incomplete', id]) },
    setError: (message) => calls.push(['error', message]),
    logCleanupFailure: (reason) => calls.push(['cleanup-error', reason.message]),
    ...overrides
  }
  return { calls, run: () => importBaseVideoDraft(dependencies) }
}

test('importa, salva metadados, publica rascunho e depois reconhece a duração', async () => {
  const { calls, run } = createHarness()

  await run()

  assert.deepEqual(calls, [
    'import',
    ['save-details', { videoId: 'video-1', categoryId: null, description: '', additionalContext: '', timeline: 'unspecified' }],
    ['publish', 'video-1', 'video-1'],
    ['recognize', 'video-1'],
    ['update-item', 'video-1', 60]
  ])
})

test('cancelamento do seletor não grava nem atualiza sessão', async () => {
  const { calls, run } = createHarness({ importVideo: async () => { calls.push('import'); return null } })

  await run()

  assert.deepEqual(calls, ['import'])
})

test('falha ao gravar metadados compensa a importação e mantém a falha original', async () => {
  const { calls, run } = createHarness({
    saveDetails: async () => { calls.push('save-details'); throw new Error('catálogo indisponível') },
    deleteIncompleteImport: async () => { calls.push('delete-incomplete'); throw new Error('limpeza indisponível') }
  })

  await run()

  assert.deepEqual(calls, [
    'import', 'save-details', 'delete-incomplete', ['cleanup-error', 'limpeza indisponível'],
    ['error', 'catálogo indisponível']
  ])
})

test('falha ao reconhecer duração mantém o rascunho e informa o erro sem removê-lo', async () => {
  const { calls, run } = createHarness({
    recognizeDuration: async () => { calls.push('recognize'); throw new Error('duração não reconhecida') }
  })

  await run()

  assert.equal(calls.some((call) => Array.isArray(call) && call[0] === 'publish'), true)
  assert.equal(calls.some((call) => Array.isArray(call) && call[0] === 'delete-incomplete'), false)
  assert.deepEqual(calls.at(-1), ['error', 'duração não reconhecida'])
})

test('a página delega o caso de uso e ainda libera busy em qualquer resultado', async () => {
  const page = await readFile(new URL('../src/renderer/src/features/baseVideos/BaseVideosPage.tsx', import.meta.url), 'utf8')

  assert.match(page, /await importBaseVideoDraft\(/)
  assert.match(page, /importVideo: \(\) => window\.desktop\.mediaLibrary\.import\(\)/)
  assert.match(page, /deleteIncompleteImport: \(videoId\) => window\.desktop\.baseVideos\.deleteVideo\(videoId\)/)
  assert.match(page, /finally \{ setBusy\(false\) \}/)
})

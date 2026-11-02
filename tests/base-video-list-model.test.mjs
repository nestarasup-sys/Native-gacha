import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { selectVisibleBaseVideos } from '../src/renderer/src/features/baseVideos/baseVideoListModel.ts'

function video(id, { name = id, durationFrames = 120, createdAt = '2026-01-01T00:00:00.000Z' } = {}) {
  return {
    id,
    name,
    mimeType: 'video/mp4',
    extension: 'mp4',
    size: 1024,
    durationFrames,
    createdAt,
    available: true
  }
}

function details(videoId, { videoNumber, description = '', timeline = 'unspecified', additionalContext = '' } = {}) {
  return { videoId, videoNumber, description, timeline, additionalContext }
}

const options = (overrides = {}) => ({
  activeView: 'main',
  search: '',
  timelineFilter: 'all',
  sort: 'order',
  ...overrides
})

test('separa publicados e rascunhos pelo número e mantém o número zero como publicado', () => {
  const items = [video('second'), video('draft'), video('zero'), video('first')]
  const byId = {
    second: details('second', { videoNumber: 2 }),
    zero: details('zero', { videoNumber: 0 }),
    first: details('first', { videoNumber: 1 })
  }

  assert.deepEqual(selectVisibleBaseVideos(items, byId, options()).map(({ id }) => id), ['zero', 'first', 'second'])
  assert.deepEqual(selectVisibleBaseVideos(items, byId, options({ activeView: 'drafts' })).map(({ id }) => id), ['draft'])
})

test('rascunhos na ordem padrão são listados do mais recente para o mais antigo', () => {
  const items = [
    video('older', { createdAt: '2025-12-01T00:00:00.000Z' }),
    video('newer', { createdAt: '2026-02-01T00:00:00.000Z' })
  ]

  assert.deepEqual(selectVisibleBaseVideos(items, {}, options({ activeView: 'drafts' })).map(({ id }) => id), ['newer', 'older'])
})

test('busca normalizada consulta nome, ID, número, descrição e contexto adicional', () => {
  const items = [video('id-matching'), video('number'), video('description'), video('context')]
  const byId = {
    'id-matching': details('id-matching', { videoNumber: 10 }),
    number: details('number', { videoNumber: 42 }),
    description: details('description', { videoNumber: 11, description: 'Cena de reação' }),
    context: details('context', { videoNumber: 12, additionalContext: 'corte surpresa' })
  }

  for (const search of ['ID-MATCH', '42', 'REAÇÃO', 'SURPRESA']) {
    assert.equal(selectVisibleBaseVideos(items, byId, options({ search: `  ${search}  ` })).length, 1, search)
  }
})

test('combina filtro temporal com busca em português', () => {
  const items = [video('past', { name: 'Café da manhã' }), video('future', { name: 'Café à noite' })]
  const byId = {
    past: details('past', { timeline: 'past' }),
    future: details('future', { timeline: 'future' })
  }

  assert.deepEqual(
    selectVisibleBaseVideos(items, byId, options({ activeView: 'drafts', search: ' CAFÉ ', timelineFilter: 'past' })).map(({ id }) => id),
    ['past']
  )
})

test('modos de ordenação por nome, duração e data preservam suas regras', () => {
  const items = [
    video('c', { name: 'Caju', durationFrames: 300, createdAt: '2026-03-01T00:00:00.000Z' }),
    video('a', { name: 'Abacaxi', durationFrames: null, createdAt: '2026-01-01T00:00:00.000Z' }),
    video('b', { name: 'Árvore', durationFrames: 60, createdAt: '2026-02-01T00:00:00.000Z' })
  ]
  const byId = Object.fromEntries(items.map((item) => [item.id, details(item.id)]))

  assert.deepEqual(selectVisibleBaseVideos(items, byId, options({ activeView: 'drafts', sort: 'name' })).map(({ id }) => id), ['a', 'b', 'c'])
  assert.deepEqual(selectVisibleBaseVideos(items, byId, options({ activeView: 'drafts', sort: 'duration' })).map(({ id }) => id), ['a', 'b', 'c'])
  assert.deepEqual(selectVisibleBaseVideos(items, byId, options({ activeView: 'drafts', sort: 'newest' })).map(({ id }) => id), ['c', 'b', 'a'])
})

test('usa detalhes padrão para itens ainda sem metadados e não reordena a entrada original', () => {
  const items = [video('z'), video('a')]
  const result = selectVisibleBaseVideos(items, {}, options({ activeView: 'drafts' }))

  assert.deepEqual(result.map(({ id }) => id), ['z', 'a'])
  assert.deepEqual(items.map(({ id }) => id), ['z', 'a'])
})

test('BaseVideosPage delega a lista derivada ao modelo puro', async () => {
  const page = await readFile(new URL('../src/renderer/src/features/baseVideos/BaseVideosPage.tsx', import.meta.url), 'utf8')

  assert.match(page, /selectVisibleBaseVideos\(items, detailsById/)
  assert.doesNotMatch(page, /const visibleItems = useMemo\(\(\) => items\.filter\(/)
})

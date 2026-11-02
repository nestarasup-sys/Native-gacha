import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { deleteBaseVideoCategory } from '../src/renderer/src/features/baseVideos/baseVideoCategoryCommands.ts'

const detailsById = {
  'video-a': { videoId: 'video-a', categoryId: 'category-1' },
  'video-b': { videoId: 'video-b', categoryId: null },
  'video-c': { videoId: 'video-c', categoryId: 'category-1' }
}

test('exclui categoria somente depois de drenar metadados vinculados e limpa atribuições depois', async () => {
  const calls = []
  const assigned = await deleteBaseVideoCategory({
    categoryId: 'category-1',
    detailsById,
    flushPendingSave: async (id) => { calls.push(`flush:${id}`) },
    deleteCategory: async (id) => { calls.push(`delete:${id}`) },
    clearCategoryAssignment: (id) => calls.push(`clear:${id}`)
  })

  assert.deepEqual(assigned, ['video-a', 'video-c'])
  assert.deepEqual(calls, [
    'flush:video-a', 'flush:video-c', 'delete:category-1', 'clear:video-a', 'clear:video-c'
  ])
})

test('falha ao drenar um vídeo preserva categoria e atribuições restantes', async () => {
  const calls = []

  await assert.rejects(deleteBaseVideoCategory({
    categoryId: 'category-1',
    detailsById,
    flushPendingSave: async (id) => {
      calls.push(`flush:${id}`)
      if (id === 'video-c') throw new Error('save pendente')
    },
    deleteCategory: async (id) => calls.push(`delete:${id}`),
    clearCategoryAssignment: (id) => calls.push(`clear:${id}`)
  }), /save pendente/)

  assert.deepEqual(calls, ['flush:video-a', 'flush:video-c'])
})

test('falha ao apagar categoria não limpa atribuições em memória', async () => {
  const calls = []

  await assert.rejects(deleteBaseVideoCategory({
    categoryId: 'category-1',
    detailsById,
    flushPendingSave: async (id) => calls.push(`flush:${id}`),
    deleteCategory: async () => { throw new Error('delete falhou') },
    clearCategoryAssignment: (id) => calls.push(`clear:${id}`)
  }), /delete falhou/)

  assert.deepEqual(calls, ['flush:video-a', 'flush:video-c'])
})

test('BaseVideosPage delega a ordem de flush, exclusão e limpeza ao comando', async () => {
  const page = await readFile(new URL('../src/renderer/src/features/baseVideos/BaseVideosPage.tsx', import.meta.url), 'utf8')

  assert.match(page, /await deleteBaseVideoCategory\(/)
  assert.doesNotMatch(page, /for \(const \[videoId, details\] of Object\.entries\(detailsById\)\) if \(details\.categoryId === category\.id\)/)
})

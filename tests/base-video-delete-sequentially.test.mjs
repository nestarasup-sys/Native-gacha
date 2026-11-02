import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { deleteBaseVideosSequentially } from '../src/renderer/src/features/baseVideos/deleteBaseVideosSequentially.ts'

test('grava e exclui cada vídeo sequencialmente, notificando somente depois do sucesso', async () => {
  const calls = []
  const completed = []

  await deleteBaseVideosSequentially({
    videoIds: ['video-a', 'video-b'],
    flushPendingSave: async (id) => { calls.push(`flush:${id}`) },
    deleteVideo: async (id) => { calls.push(`delete:${id}`) },
    onDeleted: (id) => completed.push(id)
  })

  assert.deepEqual(calls, ['flush:video-a', 'delete:video-a', 'flush:video-b', 'delete:video-b'])
  assert.deepEqual(completed, ['video-a', 'video-b'])
})

test('falha no flush mantém a lista de sucessos anteriores e não apaga o vídeo pendente', async () => {
  const calls = []
  const completed = []

  await assert.rejects(deleteBaseVideosSequentially({
    videoIds: ['video-a', 'video-b'],
    flushPendingSave: async (id) => { calls.push(`flush:${id}`); if (id === 'video-b') throw new Error('flush falhou') },
    deleteVideo: async (id) => { calls.push(`delete:${id}`) },
    onDeleted: (id) => completed.push(id)
  }), /flush falhou/)

  assert.deepEqual(calls, ['flush:video-a', 'delete:video-a', 'flush:video-b'])
  assert.deepEqual(completed, ['video-a'])
})

test('falha na exclusão não reporta o vídeo que o serviço não removeu', async () => {
  const calls = []
  const completed = []

  await assert.rejects(deleteBaseVideosSequentially({
    videoIds: ['video-a', 'video-b'],
    flushPendingSave: async (id) => { calls.push(`flush:${id}`) },
    deleteVideo: async (id) => { calls.push(`delete:${id}`); if (id === 'video-b') throw new Error('vídeo referenciado') },
    onDeleted: (id) => completed.push(id)
  }), /vídeo referenciado/)

  assert.deepEqual(calls, ['flush:video-a', 'delete:video-a', 'flush:video-b', 'delete:video-b'])
  assert.deepEqual(completed, ['video-a'])
})

test('BaseVideosPage delega a exclusão e usa IDs concluídos para refletir falhas parciais', async () => {
  const page = await readFile(new URL('../src/renderer/src/features/baseVideos/BaseVideosPage.tsx', import.meta.url), 'utf8')
  const handler = page.slice(page.indexOf('const confirmDelete'), page.indexOf('const renameVideo'))

  assert.match(handler, /await deleteBaseVideosSequentially\(/)
  assert.match(handler, /onDeleted: \(id\) => deletedIds\.push\(id\)/)
  assert.match(handler, /setSelectedIds\(\(current\) => current\.filter\(\(id\) => !deletedIds\.includes\(id\)\)\)/)
  assert.doesNotMatch(handler, /for \(const id of selectedIds\)/)
})

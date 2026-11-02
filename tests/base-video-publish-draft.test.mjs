import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { publishBaseVideoDraft } from '../src/renderer/src/features/baseVideos/publishBaseVideoDraft.ts'

test('drena metadados antes de publicar e retorna o número permanente', async () => {
  const calls = []
  const videoNumber = await publishBaseVideoDraft({
    videoId: 'draft-1',
    flushPendingSave: async (id) => { calls.push(`flush:${id}`) },
    publish: async (id) => { calls.push(`publish:${id}`); return 17 }
  })

  assert.equal(videoNumber, 17)
  assert.deepEqual(calls, ['flush:draft-1', 'publish:draft-1'])
})

test('falha no flush impede a publicação e preserva o rascunho', async () => {
  const calls = []

  await assert.rejects(publishBaseVideoDraft({
    videoId: 'draft-2',
    flushPendingSave: async (id) => { calls.push(`flush:${id}`); throw new Error('metadados não salvos') },
    publish: async (id) => { calls.push(`publish:${id}`); return 18 }
  }), /metadados não salvos/)

  assert.deepEqual(calls, ['flush:draft-2'])
})

test('erro do serviço de publicação propaga depois que o flush conclui', async () => {
  const calls = []

  await assert.rejects(publishBaseVideoDraft({
    videoId: 'draft-3',
    flushPendingSave: async (id) => { calls.push(`flush:${id}`) },
    publish: async (id) => { calls.push(`publish:${id}`); throw new Error('numeração indisponível') }
  }), /numeração indisponível/)

  assert.deepEqual(calls, ['flush:draft-3', 'publish:draft-3'])
})

test('BaseVideosPage delega a publicação e mantém a atualização da sessão depois do sucesso', async () => {
  const page = await readFile(new URL('../src/renderer/src/features/baseVideos/BaseVideosPage.tsx', import.meta.url), 'utf8')
  const handler = page.slice(page.indexOf('const sendToBase'), page.indexOf('const handleDelete'))

  assert.match(handler, /await publishBaseVideoDraft\(/)
  assert.match(handler, /setDetailsById\(/)
  assert.match(handler, /setActiveView\('main'\)/)
  assert.doesNotMatch(handler, /await flushPendingSave\(videoId\)/)
})

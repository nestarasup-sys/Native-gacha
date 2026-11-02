import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createBaseVideoCategory, deleteBaseVideoCategory, renameBaseVideoCategory } from '../src/renderer/src/features/baseVideos/baseVideoCategoryCommands.ts'

const detailsById = {
  'video-a': { videoId: 'video-a', categoryId: 'category-1' },
  'video-b': { videoId: 'video-b', categoryId: null },
  'video-c': { videoId: 'video-c', categoryId: 'category-1' }
}

const category = { id: 'category-2', name: '  Ação  ', color: '#abcdef' }

test('cria categoria antes de atualizar lista, atribuir o vídeo e limpar o campo', async () => {
  const calls = []
  const created = await createBaseVideoCategory({
    name: category.name,
    videoId: 'video-a',
    createCategory: async (name) => { calls.push(['create', name]); return category },
    appendCategory: (value) => calls.push(['append', value.id]),
    assignCategory: (videoId, categoryId) => calls.push(['assign', videoId, categoryId]),
    clearName: () => calls.push(['clear-name'])
  })

  assert.equal(created, category)
  assert.deepEqual(calls, [
    ['create', '  Ação  '], ['append', 'category-2'], ['assign', 'video-a', 'category-2'], ['clear-name']
  ])
})

test('falha ao criar categoria não altera lista, atribuição ou valor digitado', async () => {
  const calls = []

  await assert.rejects(createBaseVideoCategory({
    name: 'Categoria',
    videoId: 'video-a',
    createCategory: async () => { throw new Error('nome duplicado') },
    appendCategory: () => calls.push('append'),
    assignCategory: () => calls.push('assign'),
    clearName: () => calls.push('clear-name')
  }), /nome duplicado/)

  assert.deepEqual(calls, [])
})

test('renomeia categoria antes de substituir os dados locais e sair da edição', async () => {
  const calls = []
  const renamed = { ...category, name: 'Ação' }

  const result = await renameBaseVideoCategory({
    categoryId: category.id,
    name: renamed.name,
    renameCategory: async (id, name) => { calls.push(['rename', id, name]); return renamed },
    replaceCategory: (value) => calls.push(['replace', value.name]),
    finishEditing: () => calls.push(['finish-editing'])
  })

  assert.equal(result, renamed)
  assert.deepEqual(calls, [
    ['rename', 'category-2', 'Ação'], ['replace', 'Ação'], ['finish-editing']
  ])
})

test('falha ao renomear preserva a edição ativa e os dados locais', async () => {
  const calls = []

  await assert.rejects(renameBaseVideoCategory({
    categoryId: category.id,
    name: 'Outra',
    renameCategory: async () => { throw new Error('falha ao persistir') },
    replaceCategory: () => calls.push('replace'),
    finishEditing: () => calls.push('finish-editing')
  }), /falha ao persistir/)

  assert.deepEqual(calls, [])
})

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
  assert.match(page, /await createBaseVideoCategory\(/)
  assert.match(page, /await renameBaseVideoCategory\(/)
  assert.doesNotMatch(page, /for \(const \[videoId, details\] of Object\.entries\(detailsById\)\) if \(details\.categoryId === category\.id\)/)
})

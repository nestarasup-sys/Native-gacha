import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createAnimatorDeleteAnimationCommand } from '../src/renderer/src/features/fabricator/animatorDeleteAnimationCommand.ts'

const pageUrl = new URL('../src/renderer/src/features/fabricator/AnimatorWorkspace.tsx', import.meta.url)

function makeAnimation({ slot = 4, sourceModelSlot = 2, name = 'Corrida' } = {}) {
  return { slot, sourceModelSlot, name }
}

function makeHarness({
  saving = false,
  animation = makeAnimation(),
  confirmed = true,
  waitForWrites = async () => undefined,
  deleteSavedAnimation = async () => undefined,
  loadSavedDraft = async () => null,
  deleteSavedDraft = async () => undefined
} = {}) {
  const events = []
  const command = createAnimatorDeleteAnimationCommand({
    saving,
    animation,
    confirm: (message) => { events.push(['confirm', message]); return confirmed },
    clearDraftTimer: () => events.push(['clear-draft-timer']),
    waitForWrites: () => { events.push(['wait-for-writes']); return waitForWrites() },
    deleteSavedAnimation: (modelSlot, slot) => { events.push(['delete-animation', modelSlot, slot]); return deleteSavedAnimation(modelSlot, slot) },
    loadSavedDraft: (modelSlot) => { events.push(['load-draft', modelSlot]); return loadSavedDraft(modelSlot) },
    deleteSavedDraft: (modelSlot) => { events.push(['delete-draft', modelSlot]); return deleteSavedDraft(modelSlot) },
    resetAfterSuccess: (slot) => events.push(['reset', slot]),
    setError: (error) => events.push(['error', error])
  })
  return { command, events }
}

test('confirma, drena writes, remove o slot e só apaga o rascunho do mesmo slot', async () => {
  const animation = makeAnimation()
  const harness = makeHarness({ animation, loadSavedDraft: async () => ({ editingSlot: animation.slot }) })

  await harness.command()

  assert.deepEqual(harness.events, [
    ['confirm', 'Excluir a animação “Corrida” do slot 4?'],
    ['clear-draft-timer'],
    ['wait-for-writes'],
    ['delete-animation', 2, 4],
    ['load-draft', 2],
    ['delete-draft', 2],
    ['reset', 4]
  ])
})

test('rascunho de outro slot fica no serviço e não impede a limpeza após excluir a animação', async () => {
  const harness = makeHarness({ loadSavedDraft: async () => ({ editingSlot: 8 }) })

  await harness.command()

  assert.ok(harness.events.some(([name]) => name === 'reset'))
  assert.equal(harness.events.some(([name]) => name === 'delete-draft'), false)
})

test('salvamento ativo, animação ausente ou confirmação cancelada não iniciam exclusão', async () => {
  const saving = makeHarness({ saving: true })
  await saving.command()
  assert.deepEqual(saving.events, [])

  const absent = makeHarness({ animation: null })
  await absent.command()
  assert.deepEqual(absent.events, [])

  const cancelled = makeHarness({ confirmed: false })
  await cancelled.command()
  assert.deepEqual(cancelled.events, [['confirm', 'Excluir a animação “Corrida” do slot 4?']])
})

test('falha da fila anterior é tolerada e a exclusão continua depois do flush', async () => {
  const harness = makeHarness({ waitForWrites: async () => { throw new Error('write antigo') } })

  await harness.command()

  assert.deepEqual(harness.events.slice(1, 5), [
    ['clear-draft-timer'], ['wait-for-writes'], ['delete-animation', 2, 4], ['load-draft', 2]
  ])
  assert.ok(harness.events.some(([name]) => name === 'reset'))
  assert.equal(harness.events.some(([name]) => name === 'error'), false)
})

test('falha na exclusão do slot mantém estado local e apresenta a mensagem do serviço', async () => {
  const harness = makeHarness({ deleteSavedAnimation: async () => { throw new Error('permissão negada') } })

  await harness.command()

  assert.deepEqual(harness.events.slice(-1), [['error', 'permissão negada']])
  assert.equal(harness.events.some(([name]) => name === 'load-draft' || name === 'reset'), false)
})

test('falha ao consultar o rascunho ocorre após apagar o slot e não limpa sessão local', async () => {
  const harness = makeHarness({ loadSavedDraft: async () => { throw 'catálogo indisponível' } })

  await harness.command()

  assert.ok(harness.events.some(([name]) => name === 'delete-animation'))
  assert.deepEqual(harness.events.slice(-1), [['error', 'Não foi possível excluir a animação.']])
  assert.equal(harness.events.some(([name]) => name === 'reset'), false)
})

test('AnimatorWorkspace injeta persistência e delega a sequência de exclusão ao comando', async () => {
  const page = await readFile(pageUrl, 'utf8')

  assert.match(page, /createAnimatorDeleteAnimationCommand\(\{[\s\S]*?waitForWrites: \(\) => writeQueue\.current,[\s\S]*?deleteSavedAnimation:[\s\S]*?loadSavedDraft:[\s\S]*?deleteSavedDraft:[\s\S]*?resetAfterSuccess:/)
  assert.match(page, /onClick=\{\(\) => void deleteAnimation\(\)\}/)
  assert.doesNotMatch(page, /await window\.desktop\.fabricator\.deleteAnimatorAnimation\(animation\.sourceModelSlot, animation\.slot\)/)
})

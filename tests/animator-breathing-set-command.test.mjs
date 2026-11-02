import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createAnimatorBreathingSetCommand } from '../src/renderer/src/features/fabricator/animatorBreathingSetCommand.ts'

const workspaceUrl = new URL('../src/renderer/src/features/fabricator/AnimatorWorkspace.tsx', import.meta.url)

const variations = [
  { key: 'suave', name: 'Suave', cycleMs: 4200, torsoWidth: 100, torsoHeight: 102 },
  { key: 'calma', name: 'Calma', cycleMs: 3600, torsoWidth: 101, torsoHeight: 103 },
  { key: 'profunda', name: 'Profunda', cycleMs: 5200, torsoWidth: 102, torsoHeight: 104 },
  { key: 'ritmada', name: 'Ritmada', cycleMs: 3000, torsoWidth: 101, torsoHeight: 102 }
]

function makeSummary(slot, name) {
  return { slot, sourceModelSlot: 2, name, sourceModelName: 'Modelo', sourceModelUpdatedAt: '2026-01-01', sourceModelPartCount: 1, thumbnailDataUrl: 'data:image/png;base64,thumb', updatedAt: '2026-01-01' }
}

function makeAnimation(slot, name) {
  return { slot, sourceModelSlot: 2, name, parts: [{ id: `part-${slot}`, name: 'Tronco', dataUrl: `data:image/png;base64,${slot}` }], frames: [] }
}

function makeHarness(options = {}) {
  const events = []
  const initialSummaries = options.initialSummaries ?? []
  const refreshedSummaries = options.refreshedSummaries ?? initialSummaries
  const savedAnimations = options.savedAnimations ?? new Map()
  const poses = options.poses ?? [
    { slot: 1, name: 'Pose base', category: 'Parado' },
    { slot: 2, name: 'Pose cadeira', category: 'Sentado' }
  ]
  let listAnimationsCalls = 0
  const state = { breathingSaving: [], summaries: [], messages: [], dialogs: [], errors: [] }
  const dependencies = {
    source: { slot: 2, name: 'Modelo', updatedAt: '2026-01-01', parts: [] },
    modelSlot: 2,
    characterId: 'personagem-1',
    saving: false,
    breathingSaving: false,
    summaries: initialSummaries,
    slotCount: 12,
    variations,
    listPoseSlots: async (modelSlot) => { events.push(['list-poses', modelSlot]); return poses.map((pose) => ({ slot: pose.slot, sourceModelSlot: modelSlot, name: pose.name, partCount: 1, sourceModelName: 'Modelo', sourceModelUpdatedAt: '2026-01-01', updatedAt: '2026-01-01' })) },
    listAnimations: async (modelSlot) => {
      events.push(['list-animations', modelSlot])
      listAnimationsCalls += 1
      return listAnimationsCalls === 1 ? initialSummaries : refreshedSummaries
    },
    loadAnimation: async (modelSlot, slot) => { events.push(['load-animation', modelSlot, slot]); return savedAnimations.get(slot) ?? null },
    loadPose: async (modelSlot, slot) => { events.push(['load-pose', modelSlot, slot]); return poses.find((pose) => pose.slot === slot) ?? null },
    createAnimation: async (_source, pose, slot, characterId, variation) => {
      events.push(['create-animation', pose.category, slot, characterId, variation.key])
      return makeAnimation(slot, `${pose.category}-${variation.name}`)
    },
    serializeAnimation: (animation) => ({ ...animation, parts: animation.parts.map(({ dataUrl: _dataUrl, ...part }) => part) }),
    saveAnimation: async (modelSlot, slot, document, assets) => { events.push(['save-animation', modelSlot, slot, document.name, assets.map(({ id }) => id)]) },
    deleteAnimation: async (modelSlot, slot) => { events.push(['delete-animation', modelSlot, slot]) },
    setBreathingSaving: (value) => { state.breathingSaving.push(value); events.push(['saving', value]) },
    setSummaries: (value) => { state.summaries.push(value); events.push(['summaries', value]) },
    setSaveMessage: (value) => { state.messages.push(value); events.push(['message', value]) },
    setBreathingDialog: (value) => { state.dialogs.push(value); events.push(['dialog', value]) },
    setError: (value) => { state.errors.push(value); events.push(['error', value]) },
    ...options.dependencies
  }
  return { command: createAnimatorBreathingSetCommand(dependencies), dependencies, events, state }
}

test('substitui somente as respirações e gera quatro variações para cada pose', async () => {
  const oldSummaries = [makeSummary(10, 'Respiração ·'), makeSummary(11, 'Respiração · Sentado · antiga'), makeSummary(1, 'Manual')]
  const oldAnimations = new Map([[10, makeAnimation(10, 'Respiração ·')], [11, makeAnimation(11, 'Respiração · Sentado · antiga')]])
  const finalSummaries = [makeSummary(1, 'Manual'), ...Array.from({ length: 8 }, (_, index) => makeSummary(index + 2, `Respiração nova ${index + 1}`))]
  const harness = makeHarness({ initialSummaries: oldSummaries, refreshedSummaries: finalSummaries, savedAnimations: oldAnimations })

  await harness.command()

  assert.deepEqual(harness.events.filter(([name]) => name === 'delete-animation'), [['delete-animation', 2, 10], ['delete-animation', 2, 11]])
  const created = harness.events.filter(([name]) => name === 'create-animation')
  assert.equal(created.length, 8)
  assert.deepEqual(created.slice(0, 4).map(([, category]) => category), ['Parado', 'Parado', 'Parado', 'Parado'])
  assert.deepEqual(created.slice(4).map(([, category]) => category), ['Sentado', 'Sentado', 'Sentado', 'Sentado'])
  assert.deepEqual(created.slice(0, 4).map(([, , , characterId]) => characterId), Array(4).fill('personagem-1'))
  assert.equal(harness.events.filter(([name]) => name === 'save-animation').length, 8)
  assert.deepEqual(harness.state.summaries, [finalSummaries])
  assert.deepEqual(harness.state.messages, ['8 variações de respiração salvas'])
  assert.deepEqual(harness.state.dialogs, [false])
  assert.deepEqual(harness.state.errors, [''])
  assert.deepEqual(harness.state.breathingSaving, [true, false])
})

test('guardas impedem iniciar quando falta origem/modelo ou já existe um salvamento', async () => {
  for (const dependencies of [
    { source: null },
    { modelSlot: null },
    { saving: true },
    { breathingSaving: true }
  ]) {
    const harness = makeHarness({ dependencies })
    await harness.command()
    assert.deepEqual(harness.events, [])
  }
})

test('slot de respiração ausente interrompe o lote antes de excluir qualquer slot', async () => {
  const summaries = [makeSummary(10, 'Respiração · Parado · antiga')]
  const harness = makeHarness({ initialSummaries: summaries, savedAnimations: new Map() })

  await harness.command()

  assert.equal(harness.events.some(([name]) => name === 'delete-animation' || name === 'create-animation'), false)
  assert.ok(harness.state.errors.at(-1).includes('não alterei nenhum slot'))
  assert.deepEqual(harness.state.breathingSaving, [true, false])
})

test('ausência de pose sentada ou parada deixa a animação salva intacta', async () => {
  const harness = makeHarness({ poses: [{ slot: 1, name: 'Só parada', category: 'Parado' }] })

  await harness.command()

  assert.equal(harness.events.some(([name]) => ['delete-animation', 'save-animation', 'create-animation'].includes(name)), false)
  assert.match(harness.state.errors.at(-1), /Parado.*Sentado/)
})

test('slots insuficientes são detectados antes da geração ou exclusão', async () => {
  const harness = makeHarness({ dependencies: { slotCount: 1, variations: [variations[0]] }, initialSummaries: [makeSummary(1, 'Manual')] })

  await harness.command()

  assert.equal(harness.events.some(([name]) => ['delete-animation', 'save-animation', 'create-animation'].includes(name)), false)
  assert.deepEqual(harness.state.errors, ['', 'São necessários 2 slots livres; este modelo tem 0. Libere slots sem animação para continuar.'])
})

test('falha ao montar as novas animações ocorre antes de remover a versão anterior', async () => {
  const oldSummary = makeSummary(10, 'Respiração · antiga')
  const oldAnimation = makeAnimation(10, oldSummary.name)
  const harness = makeHarness({
    initialSummaries: [oldSummary],
    savedAnimations: new Map([[10, oldAnimation]]),
    dependencies: { createAnimation: async () => { throw new Error('miniatura indisponível') } }
  })

  await harness.command()

  assert.equal(harness.events.some(([name]) => name === 'delete-animation' || name === 'save-animation'), false)
  assert.deepEqual(harness.state.errors, ['', 'miniatura indisponível'])
})

test('falha parcial apaga os slots novos, restaura respirações antigas e atualiza a lista', async () => {
  const oldSummaries = [makeSummary(10, 'Respiração · Parado · antiga'), makeSummary(11, 'Respiração · Sentado · antiga')]
  const oldAnimations = new Map([[10, makeAnimation(10, oldSummaries[0].name)], [11, makeAnimation(11, oldSummaries[1].name)]])
  const saveAttempts = []
  let failedNewWrite = false
  const harness = makeHarness({
    initialSummaries: oldSummaries,
    refreshedSummaries: oldSummaries,
    savedAnimations: oldAnimations,
    dependencies: {
      saveAnimation: async (modelSlot, slot, document, assets) => {
        saveAttempts.push(document.name)
        harness.events.push(['save-animation', modelSlot, slot, document.name, assets.map(({ id }) => id)])
        if (document.name === 'Parado-Calma' && !failedNewWrite) {
          failedNewWrite = true
          throw new Error('disco indisponível')
        }
      }
    }
  })

  await harness.command()

  const firstNewSavedIndex = harness.events.findIndex(([name, , , title]) => name === 'save-animation' && title === 'Parado-Suave')
  const secondNewFailedIndex = harness.events.findIndex(([name, , , title]) => name === 'save-animation' && title === 'Parado-Calma')
  const rollbackDeleteIndex = harness.events.findIndex(([name, , slot]) => name === 'delete-animation' && slot === 1)
  const firstRestoreIndex = harness.events.findIndex(([name, , , title]) => name === 'save-animation' && title === oldSummaries[0].name)
  assert.ok(firstNewSavedIndex < secondNewFailedIndex)
  assert.ok(secondNewFailedIndex < rollbackDeleteIndex)
  assert.ok(rollbackDeleteIndex < firstRestoreIndex)
  assert.deepEqual(harness.events.filter(([name]) => name === 'delete-animation').map(([, , slot]) => slot), [10, 11, 1, 2])
  assert.equal(saveAttempts.filter((name) => name === oldSummaries[0].name || name === oldSummaries[1].name).length, 2)
  assert.deepEqual(harness.state.summaries, [oldSummaries])
  assert.deepEqual(harness.state.errors, ['', 'disco indisponível'])
  assert.deepEqual(harness.state.dialogs, [])
})

test('AnimatorWorkspace injeta a API do Fabricador e delega a substituição em lote', async () => {
  const workspace = await readFile(workspaceUrl, 'utf8')

  assert.match(workspace, /createAnimatorBreathingSetCommand\(\{[\s\S]*?listPoseSlots:[\s\S]*?loadAnimation:[\s\S]*?loadPose:[\s\S]*?saveAnimation:[\s\S]*?deleteAnimation:[\s\S]*?setSummaries[,}]/)
  assert.match(workspace, /onClick=\{\(\) => void createBreathingSet\(\)\}/)
  assert.doesNotMatch(workspace, /for \(const old of oldBreathing\) await window\.desktop\.fabricator\.deleteAnimatorAnimation/)
})

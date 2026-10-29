import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import ts from 'typescript'
import { fabricatorIpcChannels } from '../src/shared/fabricatorIpcChannels.ts'
import { editorV6IpcChannels } from '../src/shared/editorV6IpcChannels.ts'
import { studioIpcChannels } from '../src/shared/studioIpcChannels.ts'
import {
  addedFabricatorPoseReferences,
  collectCustomizerPoseReferences,
  collectEditorV6PoseReferences,
  collectStudioPoseReferences,
  findFabricatorPoseReferenceOwners
} from '../src/shared/fabricatorPoseReferences.ts'
import { CustomizerCharacterService } from '../electron/domains/customizer/service.ts'
import { createFabricatorPoseReferenceIntegrity } from '../electron/domains/fabricator/poseReferenceIntegrity.ts'
import { assertPoseHasNoReferences, createPoseReferenceChangeCoordinator } from '../electron/domains/fabricator/poseReferences.ts'
import { registerEditorV6PrimaryHandlers } from '../electron/domains/editorV6/primaryIpc.ts'
import { registerStudioPrimaryHandlers } from '../electron/domains/studio/primaryIpc.ts'

function loadPoseHandlers() {
  const source = readFileSync(new URL('../electron/domains/fabricator/poseIpc.ts', import.meta.url), 'utf8')
  const compiled = ts.transpile(source, { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 })
  const module = { exports: {} }
  const requireFromTest = createRequire(import.meta.url)
  const injectedRequire = (name) => {
    if (name.includes('fabricatorIpcChannels')) return { fabricatorIpcChannels }
    if (name.includes('poseReferences.ts')) return { assertPoseHasNoReferences }
    if (name.includes('shared/fabricator')) return { resolvePoseCategory: (pose) => pose.category ?? 'normal' }
    return requireFromTest(name)
  }
  new Function('require', 'exports', 'module', compiled)(injectedRequire, module.exports, module)
  return module.exports.registerFabricatorPoseHandlers
}

const character = (modelSlot = 2, poseSlot = 3) => ({
  id: 'character-1', name: 'Lia',
  customization: { modelSlot, poseSlot }
})

const sceneElement = (id, poseSlot, changes = {}) => ({
  id, kind: 'character', characterId: 'character-1', poseSlot, text: `Ator ${id}`,
  ...changes
})

function createPoseIntegrity(overrides = {}) {
  return createFabricatorPoseReferenceIntegrity({
    isValidModelSlot: (slot) => Number.isInteger(slot) && slot >= 1 && slot <= 10,
    isValidPoseSlot: (slot) => Number.isInteger(slot) && slot >= 1 && slot <= 12,
    readPose: async () => ({ id: 'pose' }),
    listCharacters: async () => [character()],
    withCharactersLocked: (operation) => operation([character()]),
    listStudioDocuments: async () => [],
    readStudioDocument: async () => null,
    listEditorV6Documents: async () => [],
    readEditorV6Document: async () => null,
    ...overrides
  })
}

test('inventário inclui personagens, poses explícitas de cena e blocos do Editor V6', () => {
  const characters = [character()]
  const customizerRefs = collectCustomizerPoseReferences(characters)
  const studioRefs = collectStudioPoseReferences([{
    id: 'studio-1', title: 'Cena', elements: [
      sceneElement('linked', 5),
      sceneElement('unknown-model', 6, { characterId: 'deleted-character' }),
      sceneElement('no-pose', null),
      sceneElement('not-character', 7, { kind: 'image' })
    ]
  }], characters)
  const editorRefs = collectEditorV6PoseReferences([{
    id: 'editor-1', title: 'Animação', elements: [],
    timeline: { tracks: [{
      id: 'track-1', characterId: 'character-1', blocks: [{
        id: 'block-1', label: 'Pose da linha do tempo', state: sceneElement('state-1', 8, { characterId: undefined })
      }]
    }] }
  }], characters)

  assert.deepEqual(customizerRefs.map(({ modelSlot, poseSlot }) => [modelSlot, poseSlot]), [[2, 3]])
  assert.deepEqual(studioRefs.map(({ modelSlot, poseSlot }) => [modelSlot, poseSlot]), [[2, 5], [null, 6]])
  assert.deepEqual(editorRefs.map(({ modelSlot, poseSlot }) => [modelSlot, poseSlot]), [[2, 8]])
  assert.deepEqual(findFabricatorPoseReferenceOwners([...customizerRefs, ...studioRefs, ...editorRefs], 1, 6), [
    'Studio “Cena” · Ator unknown-model'
  ])
})

test('mudança de modelo identifica como novos os vínculos de pose que mudaram de destino', () => {
  const before = character(2, 3)
  const after = character(4, 3)
  const previous = [
    ...collectCustomizerPoseReferences([before]),
    ...collectStudioPoseReferences([{ id: 'studio-1', title: 'Cena', elements: [sceneElement('linked', 5)] }], [before])
  ]
  const next = [
    ...collectCustomizerPoseReferences([after]),
    ...collectStudioPoseReferences([{ id: 'studio-1', title: 'Cena', elements: [sceneElement('linked', 5)] }], [after])
  ]

  assert.deepEqual(addedFabricatorPoseReferences(next, previous).map(({ modelSlot, poseSlot }) => [modelSlot, poseSlot]), [
    [4, 3], [4, 5]
  ])
})

test('serviço de integridade bloqueia referências inválidas e poses ausentes', async () => {
  const reads = []
  const integrity = createPoseIntegrity({ readPose: async (modelSlot, poseSlot) => {
    reads.push([modelSlot, poseSlot])
    return poseSlot === 3 ? { id: 'pose' } : null
  } })
  await integrity.assertPoseReferencesAvailable([{ modelSlot: 2, poseSlot: 3, ownerKey: 'character:1', owner: 'personagem “Lia”' }])
  await assert.rejects(integrity.assertPoseReferencesAvailable([
    { modelSlot: null, poseSlot: 3, ownerKey: 'scene:1', owner: 'Studio “Cena”' }
  ]), /identificar o modelo e a pose/)
  await assert.rejects(integrity.assertPoseReferencesAvailable([
    { modelSlot: 2, poseSlot: 4, ownerKey: 'scene:2', owner: 'Editor V6 “Teste”' }
  ]), /2:4.*não está mais disponível/)
  assert.deepEqual(reads, [[2, 3], [2, 4]])
})

test('snapshot de referências lê as três áreas sob o bloqueio do elenco', async () => {
  const editorDocument = {
    id: 'editor-1', title: 'Animação', elements: [],
    timeline: { tracks: [{ id: 'track-1', characterId: 'character-1', blocks: [{ id: 'block-1', label: 'Pose 6', state: sceneElement('state-6', 6) }] }] }
  }
  const order = []
  const integrity = createPoseIntegrity({
    withCharactersLocked: async (operation) => { order.push('lock'); try { return await operation([character()]) } finally { order.push('unlock') } },
    listStudioDocuments: async () => { order.push('studio'); return [{ id: 'studio-1', title: 'Cena', elements: [sceneElement('element-5', 5)] }] },
    listEditorV6Documents: async () => { order.push('editor'); return [editorDocument] }
  })

  const refs = await integrity.withPoseReferenceSnapshot(async (references) => references)
  assert.deepEqual(order.slice(0, 1), ['lock'])
  assert.deepEqual(order.slice(-1), ['unlock'])
  assert.deepEqual(order.slice(1, 3).sort(), ['editor', 'studio'])
  assert.deepEqual(refs.map(({ modelSlot, poseSlot }) => [modelSlot, poseSlot]), [[2, 3], [2, 5], [2, 6]])
})

test('mudança de modelo valida vínculos de pose dependentes e rejeita identidade trocada', async () => {
  const reads = []
  let listCount = 0
  const integrity = createPoseIntegrity({
    readPose: async (modelSlot, poseSlot) => { reads.push([modelSlot, poseSlot]); return { id: 'pose' } },
    listStudioDocuments: async () => { listCount += 1; return [{ id: 'studio-1', title: 'Cena', elements: [sceneElement('linked-studio', 5)] }] },
    listEditorV6Documents: async () => [{
      id: 'editor-1', title: 'Animação', elements: [sceneElement('linked-editor', 6)], timeline: { tracks: [] }
    }]
  })

  await integrity.assertDependentCharacterPoseReferencesAvailable(character(2, 3), character(4, 3))
  assert.deepEqual(reads, [[4, 5], [4, 6]])
  await integrity.assertDependentCharacterPoseReferencesAvailable(character(4, 3), character(4, 8))
  await assert.rejects(integrity.assertDependentCharacterPoseReferencesAvailable(
    character(2, 3), { ...character(4, 3), id: 'other-character' }
  ), /confirmar a identidade/)
  assert.equal(listCount, 1)
  assert.deepEqual(reads, [[4, 5], [4, 6]])
})

test('Studio e Editor V6 validam somente referências novas em relação ao documento salvo', async () => {
  const poseReads = []
  const existingStudio = { id: 'studio-1', title: 'Cena', elements: [sceneElement('existing', 5)] }
  const nextStudio = { ...existingStudio, elements: [...existingStudio.elements, sceneElement('new', 7)] }
  const existingEditor = {
    id: 'editor-1', title: 'Animação', elements: [],
    timeline: { tracks: [{ id: 'track-1', characterId: 'character-1', blocks: [{ id: 'existing-block', label: 'Pose existente', state: sceneElement('state-6', 6) }] }] }
  }
  const nextEditor = {
    ...existingEditor,
    timeline: { tracks: [{ ...existingEditor.timeline.tracks[0], blocks: [...existingEditor.timeline.tracks[0].blocks, { id: 'new-block', label: 'Pose nova', state: sceneElement('state-8', 8) }] }] }
  }
  const integrity = createPoseIntegrity({
    readPose: async (modelSlot, poseSlot) => { poseReads.push([modelSlot, poseSlot]); return { id: 'pose' } },
    readStudioDocument: async () => existingStudio,
    readEditorV6Document: async () => existingEditor
  })

  await integrity.assertStudioPoseReferencesAvailable(nextStudio)
  await integrity.assertEditorV6PoseReferencesAvailable(nextEditor)
  assert.deepEqual(poseReads, [[2, 7], [2, 8]])
})

test('referências corrompidas falham fechadas em vez de liberar uma exclusão', () => {
  const unknownModel = collectCustomizerPoseReferences([character(99, 3)])
  assert.equal(unknownModel[0].modelSlot, null)
  assert.deepEqual(findFabricatorPoseReferenceOwners(unknownModel, 1, 3), ['personagem “Lia”'])
  assert.throws(() => collectStudioPoseReferences([{
    id: 'studio-1', title: 'Cena', elements: [sceneElement('broken', 13)]
  }], [character()]), /pose salva.*inválida/i)
  assert.throws(() => collectStudioPoseReferences([{
    id: 'studio-1', title: 'Cena', elements: [sceneElement('broken-kind', 3, { kind: 'unknown' })]
  }], [character()]), /tipo inválido/i)
})

test('exclusão de pose preserva o asset quando há vínculo e remove slot isolado', async () => {
  const removed = []
  const references = collectCustomizerPoseReferences([character(2, 3)])
  const handlers = new Map()
  const coordinator = createPoseReferenceChangeCoordinator()
  const root = join(tmpdir(), 'native-gacha-pose-reference-test')
  loadPoseHandlers()({
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
    assertTrustedSender: () => undefined,
    ensureLegacyPoseMigration: async () => undefined,
    isValidModelSlot: (slot) => Number.isInteger(slot) && slot >= 1 && slot <= 10,
    isValidPoseSlot: (slot) => Number.isInteger(slot) && slot >= 1 && slot <= 12,
    slotCount: 10, poseSlotCount: 12,
    poseSlotPath: (modelSlot, slot) => join(root, `model-${modelSlot}`, `slot-${slot}`),
    poseModelPath: (modelSlot) => join(root, `model-${modelSlot}`),
    poseDraftPath: (modelSlot) => join(root, `model-${modelSlot}`, 'draft'),
    queuePoseWrite: (operation) => operation(),
    readPoseProject: async () => null,
    writePoseProject: async () => undefined,
    coordinatePoseReferenceChange: coordinator,
    withPoseReferenceSnapshot: (operation) => operation(references),
    readPoseDraft: async () => null,
    writePoseDraft: async () => undefined,
    files: {
      readFile: async () => '', writeFile: async () => undefined, mkdir: async () => undefined,
      rename: async () => undefined, rm: async (path) => { removed.push(path) }
    }
  })
  const deletePose = handlers.get(fabricatorIpcChannels.deleteFabricatorPose)

  await assert.rejects(deletePose({}, 2, 3), /Lia/)
  assert.deepEqual(removed, [])
  await deletePose({}, 2, 4)
  assert.deepEqual(removed, [join(root, 'model-2', 'slot-4')])
})

test('validação de pose acompanha mudança do modelo sem alterar personagem em caso de falha', async () => {
  const original = {
    id: 'character-1', name: 'Lia', hair: '#123456', outfit: '#abcdef', skin: '#ffffff',
    customization: { modelSlot: 1, poseSlot: null, partOverrides: {}, layerOrder: [] },
    createdAt: '2026-10-28T00:00:00.000Z', updatedAt: '2026-10-28T00:00:00.000Z'
  }
  let stored = [original]
  let checkedPair = null
  const service = new CustomizerCharacterService(
    { list: async () => stored, save: async (items) => { stored = [...items] } },
    () => 'unused-id', () => '2026-10-28T00:01:00.000Z',
    { assertDependentFabricatorPosesAvailable: async (previous, next) => {
      checkedPair = [previous.customization.modelSlot, next.customization.modelSlot]
      throw new Error('Pose explícita de cena inexistente no novo modelo.')
    } }
  )

  await assert.rejects(service.save({
    ...original, customization: { ...original.customization, modelSlot: 4 }
  }), /novo modelo/)
  assert.deepEqual(checkedPair, [1, 4])
  assert.equal(stored[0].customization.modelSlot, 1)
})

test('coordenador serializa gravações de referência e exclusões', async () => {
  const coordinate = createPoseReferenceChangeCoordinator()
  const order = []
  let releaseFirst
  const firstGate = new Promise((resolve) => { releaseFirst = resolve })
  const first = coordinate(async () => { order.push('início gravação'); await firstGate; order.push('fim gravação') })
  const second = coordinate(async () => { order.push('exclusão') })

  await new Promise((resolve) => setImmediate(resolve))
  assert.deepEqual(order, ['início gravação'])
  releaseFirst()
  await Promise.all([first, second])
  assert.deepEqual(order, ['início gravação', 'fim gravação', 'exclusão'])
  assert.throws(() => assertPoseHasNoReferences(collectCustomizerPoseReferences([character(2, 3)]), 2, 3), /Lia/)
})

test('Studio e Editor V6 validam uma pose nova sob a coordenação antes de persistir', async () => {
  for (const [register, channel] of [
    [registerStudioPrimaryHandlers, studioIpcChannels.saveStudio],
    [registerEditorV6PrimaryHandlers, editorV6IpcChannels.saveEditorV6Project]
  ]) {
    const handlers = new Map()
    const order = []
    let writes = 0
    let pending = Promise.resolve()
    register({
      ipcMain: { handle: (name, handler) => handlers.set(name, handler) },
      assertTrustedSender: () => order.push('sender'),
      list: async () => [], read: async () => null,
      write: async () => { writes += 1 }, remove: async () => undefined,
      assertPoseReferencesAvailable: async () => { order.push('validate'); throw new Error('pose ausente') },
      coordinatePoseReferenceChange: async (operation) => {
        order.push('lock')
        try { return await operation() } finally { order.push('unlock') }
      },
      getPendingWrites: () => pending,
      setPendingWrites: (next) => { pending = next },
      measure: (_label, operation) => operation()
    })

    await assert.rejects(handlers.get(channel)({}, { id: 'project-1' }), /pose ausente/)
    assert.deepEqual(order, ['sender', 'lock', 'validate', 'unlock'])
    assert.equal(writes, 0)
  }
})

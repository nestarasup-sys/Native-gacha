import test from 'node:test'
import assert from 'node:assert/strict'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fabricatorIpcChannels } from '../src/shared/fabricatorIpcChannels.ts'
import { collectCustomizerFaceAssetReferences } from '../src/shared/customizerFaceAssetReferences.ts'
import {
  assertFaceCatalogItemHasNoReferences, assertFaceComponentHasNoReferences, assertFaceSetHasNoReferences,
  addedFaceExpressionDraftReferences, addedFaceExpressionPresetReferences, collectFaceExpressionDraftReferences,
  collectFaceExpressionPresetReferences
} from '../electron/domains/fabricator/faceReferences.ts'
import { registerFabricatorFaceCatalogHandlers } from '../electron/domains/fabricator/faceCatalogIpc.ts'
import { registerExpressionPresetHandlers } from '../electron/domains/fabricator/expressionIpc.ts'

const selections = (changes = {}) => ({
  eyes: { left: null, right: null }, pupils: { left: null, right: null }, eyebrows: { left: null, right: null },
  nose: null, mouth: null, ...changes
})

const preset = (id, faceSelections = selections()) => ({
  schemaVersion: 1, id, modelSlot: 1, name: `Preset ${id}`, selections: faceSelections,
  transforms: {}, noseOpacity: 1, updatedAt: '2026-10-28T00:00:00.000Z'
})

const character = (faceAppearance) => ({ name: 'Lia', customization: { faceAppearance } })

function referenceSnapshot() {
  const faceAppearance = {
    modelSlot: 1, setId: 'face-set', eyeCatalogId: 'legacy_old-set_eyes', noseCatalogId: 'nose-character',
    components: { 'eye-left': { assetId: 'eye-character' } },
    faceDetails: { blush: 'blush-character' }, headExtras: { glasses: 'glasses-character' },
    eyeState: 0, eyebrows: true, noseIndex: 0, expressionIndex: 0, mouthOpen: false
  }
  const expressionPreset = preset('preset-1', selections({
    eyes: { left: 'eye-preset', right: null },
    pupils: { left: 'pupil-preset', right: null },
    nose: { catalogId: 'nose-preset', index: 0 },
    mouth: { catalogId: 'mouth-preset', kind: 'mouth-open', index: 0 }
  }))
  const expressionDraft = {
    schemaVersion: 1, modelSlot: 1, selectedCollectionId: 'standard', selectedExpressionIndex: 0,
    current: { id: 'draft-1', selections: selections({ eyebrows: { left: 'brow-draft', right: null } }) },
    workingCopies: {}, customExpressionNames: {}, updatedAt: '2026-10-28T00:00:00.000Z'
  }
  return {
    characters: [character(faceAppearance)], expressionPresets: [expressionPreset], expressionDraft,
    faceComponents: [{ id: 'pair-owner', modelSlot: 1, kind: 'eye', name: 'Olho pareado', pairId: 'eye-paired' }]
  }
}

function registerFaceHandlers(snapshot, removed, storedCatalogItem = true) {
  const handlers = new Map()
  const modelRoot = join(tmpdir(), 'native-gacha-face-reference-test', 'model-1')
  registerFabricatorFaceCatalogHandlers({ handle: (channel, handler) => handlers.set(channel, handler) }, () => undefined, {
    isValidModelSlot: slot => slot === 1,
    isValidWardrobeId: id => /^[a-z0-9_-]+$/.test(id),
    isValidFaceCatalogId: id => /^[a-z0-9_-]+$/.test(id),
    listFaceSets: async () => [], readFaceSet: async () => null, writeFaceSet: async () => undefined,
    faceModelPath: () => modelRoot, faceSetPath: (_slot, id) => join(modelRoot, `set-${id}`),
    listFaceCatalogItems: async () => [], readFaceCatalogItem: async () => null, writeFaceCatalogItem: async () => undefined,
    faceCatalogPath: () => join(modelRoot, 'catalog'), faceCatalogItemPath: (_slot, id) => join(modelRoot, 'catalog', `item-${id}`),
    listFaceComponentAssets: async () => [],
    readFaceComponentAsset: async (_slot, id) => ({ id, name: id, kind: 'eye' }),
    writeFaceComponentAsset: async () => undefined,
    faceComponentPath: () => join(modelRoot, 'components'), faceComponentItemPath: (_slot, id) => join(modelRoot, 'components', `item-${id}`),
    hasStoredFaceCatalogItem: async () => storedCatalogItem,
    withReferenceSnapshot: async (_slot, operation) => operation(snapshot),
    removeDirectory: async path => { removed.push(path) },
    queueSave: async operation => operation()
  })
  return handlers
}

test('inventaria todos os vínculos de rosto persistidos pelo personagem', () => {
  const refs = collectCustomizerFaceAssetReferences(character(referenceSnapshot().characters[0].customization.faceAppearance))
  assert.deepEqual(refs.map(ref => `${ref.assetType}:${ref.id}`).sort(), [
    'face-catalog:legacy_old-set_eyes', 'face-catalog:nose-character',
    'face-component:blush-character', 'face-component:eye-character', 'face-component:glasses-character'
  ])
})

test('setId antigo só permanece referenciado enquanto o conjunto legado é renderizado', () => {
  const legacyAppearance = {
    modelSlot: 1, setId: 'face-set', faceDetails: { blush: 'blush-character' }, headExtras: { glasses: 'glasses-character' }
  }
  const refs = collectCustomizerFaceAssetReferences(character(legacyAppearance))
  assert.deepEqual(refs.map(ref => ref.assetType), ['face-component', 'face-component', 'face-set'])
  assert.equal(refs.find(ref => ref.assetType === 'face-set').id, 'face-set')
})

test('presets e rascunhos de Expressões DEV mantêm referências faciais', () => {
  const snapshot = referenceSnapshot()
  assert.deepEqual(collectFaceExpressionPresetReferences(snapshot.expressionPresets).map(ref => ref.id).sort(), [
    'eye-preset', 'mouth-preset', 'nose-preset', 'pupil-preset'
  ])
  assert.deepEqual(collectFaceExpressionDraftReferences(snapshot.expressionDraft).map(ref => ref.id), ['brow-draft'])
  const activeLegacySet = { ...snapshot, characters: [character({ modelSlot: 1, setId: 'face-set' })] }
  assert.throws(() => assertFaceSetHasNoReferences(activeLegacySet, 1, 'face-set'), /Lia/)
  assert.throws(() => assertFaceSetHasNoReferences(snapshot, 1, 'old-set'), /Lia/)
  assert.throws(() => assertFaceCatalogItemHasNoReferences(snapshot, 1, 'nose-preset'), /Preset preset-1/)
  assert.throws(() => assertFaceCatalogItemHasNoReferences(snapshot, 1, 'mouth-preset'), /Preset preset-1/)
  assert.throws(() => assertFaceComponentHasNoReferences(snapshot, 1, 'eye-character', 'Olho'), /Lia/)
  assert.throws(() => assertFaceComponentHasNoReferences(snapshot, 1, 'brow-draft', 'Sobrancelha'), /rascunho de Expressões DEV/)
  assert.throws(() => assertFaceComponentHasNoReferences(snapshot, 1, 'eye-paired', 'Olho'), /pareado/)
})

test('excluir asset facial bloqueia vínculos e permite remover um asset isolado', async () => {
  const snapshot = referenceSnapshot()
  const removed = []
  const handlers = registerFaceHandlers(snapshot, removed)
  const deleteComponent = handlers.get(fabricatorIpcChannels.deleteFaceComponentAsset)
  await assert.rejects(deleteComponent({}, 1, 'eye-preset'), /Preset preset-1/)
  await assert.rejects(handlers.get('fabricator:face-catalog:delete')({}, 1, 'nose-preset'), /Preset preset-1/)
  assert.deepEqual(removed, [])

  await handlers.get('fabricator:face:delete')({}, 1, 'face-set')
  assert.match(removed[0], /set-face-set$/)
  await deleteComponent({}, 1, 'eye-isolado')
  assert.equal(removed.length, 2)
  assert.match(removed[1], /item-eye-isolado$/)
})

test('peça virtual de conjunto legado não retorna sucesso falso ao tentar excluí-la', async () => {
  const handlers = registerFaceHandlers({ characters: [], expressionPresets: [], expressionDraft: null, faceComponents: [] }, [], false)
  await assert.rejects(handlers.get('fabricator:face-catalog:delete')({}, 1, 'legacy_old-set_eyes'), /conjunto facial legado/)
})

test('novos vínculos de preset e rascunho são checados, preservando referências antigas', () => {
  const previous = preset('preset-1', selections({ eyes: { left: 'eye-old', right: null } }))
  const next = preset('preset-1', selections({ eyes: { left: 'eye-old', right: null }, nose: { catalogId: 'nose-new', index: 0 } }))
  assert.deepEqual(addedFaceExpressionPresetReferences([next], [previous]).map(ref => ref.id), ['nose-new'])
  const transferred = preset('preset-2', selections({ eyes: { left: 'eye-old', right: null } }))
  assert.deepEqual(addedFaceExpressionPresetReferences([transferred], [previous]).map(ref => ref.id), ['eye-old'])

  const previousDraft = {
    schemaVersion: 1, modelSlot: 1, selectedCollectionId: 'standard', selectedExpressionIndex: 0,
    current: { id: 'draft-1', selections: selections({ eyes: { left: 'eye-old', right: null } }) },
    workingCopies: {}, customExpressionNames: {}, updatedAt: '2026-10-28T00:00:00.000Z'
  }
  const nextDraft = {
    ...previousDraft,
    current: { ...previousDraft.current, selections: selections({ eyes: { left: 'eye-old', right: null }, mouth: { catalogId: 'mouth-new', kind: 'mouth-closed', index: 0 } }) }
  }
  assert.deepEqual(addedFaceExpressionDraftReferences(nextDraft, previousDraft).map(ref => ref.id), ['mouth-new'])
})

test('salvar preset, lote e rascunho validam novos IDs antes de persistir', async () => {
  const handlers = new Map()
  const checks = []
  const saved = []
  registerExpressionPresetHandlers({ handle: (channel, handler) => handlers.set(channel, handler) }, () => undefined, {
    queue: async (_slot, operation) => operation(), recover: async () => undefined,
    listPresets: async () => [], listCollections: async () => [], saveCollection: async () => undefined,
    loadPreset: async () => null, savePreset: async () => { saved.push('preset') }, saveBatch: async () => { saved.push('batch') },
    removePreset: async () => undefined, presetPath: () => join(tmpdir(), 'unused.json'),
    validSlot: slot => slot === 1, validId: id => /^[a-z0-9-]+$/.test(id),
    loadDraft: async () => null, saveDraft: async () => { saved.push('draft') },
    assertFaceAssetsAvailable: async (slot, references) => { checks.push({ slot, references }) }
  })
  await handlers.get('fabricator:expression-presets:save')({}, 1, preset('preset-1', selections({ pupils: { left: 'pupil-new', right: null } })))
  await handlers.get('fabricator:expression-presets:save-batch')({}, 1, [preset('preset-2', selections({ eyes: { left: null, right: 'eye-batch' } }))])
  await handlers.get('fabricator:expression-workspace:save')({}, 1, {
    schemaVersion: 1, modelSlot: 1, selectedCollectionId: 'standard', selectedExpressionIndex: 0,
    current: { id: 'draft-1', selections: selections({ mouth: { catalogId: 'mouth-draft', kind: 'mouth-open', index: 0 } }) },
    workingCopies: {}, customExpressionNames: {}, updatedAt: '2026-10-28T00:00:00.000Z'
  })
  assert.deepEqual(checks.map(({ slot, references }) => [slot, references.map(ref => ref.id)]), [
    [1, ['pupil-new']], [1, ['eye-batch']], [1, ['mouth-draft']]
  ])
  assert.deepEqual(saved, ['preset', 'batch', 'draft'])
})

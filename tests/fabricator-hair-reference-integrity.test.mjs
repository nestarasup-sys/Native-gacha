import test from 'node:test'
import assert from 'node:assert/strict'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fabricatorIpcChannels } from '../src/shared/fabricatorIpcChannels.ts'
import { hairAppearanceStyleIds, collectCustomizerHairStyleReferences } from '../src/shared/hairCategories.ts'
import { registerFabricatorHairHandlers } from '../electron/domains/fabricator/hairIpc.ts'

const character = (hairAppearance, name = 'Lia') => ({ name, customization: { hairAppearance } })

function registerHandlers(characters, removed) {
  const handlers = new Map()
  const modelRoot = join(tmpdir(), 'native-gacha-hair-reference-test', 'model-1')
  registerFabricatorHairHandlers({
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
    assertTrustedSender: () => undefined,
    isValidModelSlot: slot => slot === 1,
    isValidHairStyleId: id => /^[a-z0-9-]+$/.test(id),
    hairModelPath: () => modelRoot,
    hairStylePath: (_slot, id) => join(modelRoot, 'styles', `style-${id}`),
    readWorkspace: async () => null,
    writeWorkspace: async () => undefined,
    clearWorkspace: async () => undefined,
    listStyles: async () => [],
    readStyle: async () => null,
    writeStyle: async () => undefined,
    setLegacyHairCatalogState: async () => undefined,
    removeDirectory: async path => { removed.push(path) },
    withCharactersLocked: async operation => operation(characters)
  })
  return handlers
}

test('inventário de cabelo segue as mesmas regras de IDs que a renderização atual', () => {
  const legacy = { modelSlot: 2, styleId: 'legacy-set' }
  assert.deepEqual(hairAppearanceStyleIds(legacy, 'back').map(({ id, part }) => ({ id, part })), [
    { id: 'legacy-set', part: 'backHair' }
  ])
  assert.deepEqual(hairAppearanceStyleIds(legacy, 'front').map(({ id, part }) => ({ id, part })), [
    { id: 'legacy-set', part: 'rearHair' }
  ])
  assert.deepEqual(collectCustomizerHairStyleReferences(character({
    modelSlot: 2,
    frontStyleId: 'front-only',
    backStyleId: null,
    parts: { backHair: null, rearHair: null, frontHair: 'fringe-only' }
  })), [
    { modelSlot: 2, id: 'fringe-only' }
  ])
})

test('exclusão de cabelo recusa personagem vinculado e mantém o asset intacto', async () => {
  const removed = []
  const handlers = registerHandlers([character({ modelSlot: 1, parts: { frontHair: 'style-1' } })], removed)
  const removeHair = handlers.get(fabricatorIpcChannels.deleteHairStyle)
  await assert.rejects(removeHair({}, 1, 'style-1'), /Lia/)
  assert.deepEqual(removed, [])
})

test('exclusão de cabelo sem vínculos ainda remove definitivamente o conjunto selecionado', async () => {
  const removed = []
  const handlers = registerHandlers([], removed)
  await handlers.get(fabricatorIpcChannels.deleteHairStyle)({}, 1, 'style-1')
  assert.equal(removed.length, 1)
  assert.match(removed[0], /style-1$/)
})

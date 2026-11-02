import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createStudioDeleteSelectedCommand } from '../src/renderer/src/features/studio/studioDeleteSelectedCommand.ts'

const pageSource = await readFile(new URL('../src/renderer/src/features/studio/StudioPage.tsx', import.meta.url), 'utf8')
const timestamp = '2026-11-02T15:00:00.000Z'

function makeElement(id, kind = 'image', assetId = `${id}-asset`) {
  return { id, kind, assetId, text: id, x: 0, y: 0, width: 20, height: 20, rotation: 0, zIndex: 1 }
}

function makeStudio({ elements = [], backgroundAssetId = null, assets = [] } = {}) {
  return {
    id: 'studio-1', title: 'Studio 01', createdAt: timestamp, updatedAt: timestamp,
    backgroundColor: '#fff', backgroundAssetId, backgroundX: 0, backgroundY: 0,
    backgroundWidth: 100, backgroundHeight: 100, backgroundRotation: 0,
    assets, elements
  }
}

function makeHarness({ studio = makeStudio(), selectedElementId = null } = {}) {
  const events = []
  const state = { studio }
  const command = createStudioDeleteSelectedCommand({
    activeStudio: studio,
    selectedElementId,
    now: () => timestamp,
    changeScene: (transform) => {
      events.push(['change-scene'])
      state.studio = transform(state.studio)
    },
    removeStageCharacter: (element) => events.push(['remove-character', element.id]),
    setSelectedElementId: (id) => events.push(['selected-element', id])
  })
  return { command, events, state }
}

test('remove fundo limpa a imagem de fundo no documento sem apagar assets', () => {
  const background = { id: 'background-1', category: 'background', name: 'Fundo', mimeType: 'image/png', dataUrl: 'data:bg' }
  const element = makeElement('object-1')
  const { command, events, state } = makeHarness({
    studio: makeStudio({ backgroundAssetId: background.id, assets: [background], elements: [element] }),
    selectedElementId: 'background'
  })

  command()

  assert.deepEqual(events, [['change-scene'], ['selected-element', null]])
  assert.equal(state.studio.backgroundAssetId, null)
  assert.deepEqual(state.studio.assets, [background])
  assert.deepEqual(state.studio.elements, [element])
  assert.equal(state.studio.updatedAt, timestamp)
})

test('remove personagem delega ao fluxo proprietário e limpa a seleção', () => {
  const character = makeElement('actor-1', 'character', 'character-image')
  const { command, events } = makeHarness({ studio: makeStudio({ elements: [character] }), selectedElementId: character.id })

  command()

  assert.deepEqual(events, [['remove-character', character.id], ['selected-element', null]])
})

test('remove outro elemento da cena mas mantém seu asset no Studio', () => {
  const object = makeElement('object-1')
  const remaining = makeElement('object-2')
  const objectAsset = { id: object.assetId, category: 'object', name: 'Objeto', mimeType: 'image/png', dataUrl: 'data:obj' }
  const { command, events, state } = makeHarness({
    studio: makeStudio({ elements: [object, remaining], assets: [objectAsset] }),
    selectedElementId: object.id
  })

  command()

  assert.deepEqual(events, [['change-scene'], ['selected-element', null]])
  assert.deepEqual(state.studio.elements, [remaining])
  assert.deepEqual(state.studio.assets, [objectAsset])
})

test('ID selecionado ausente ainda limpa seleção e nenhum estado não produz efeitos', () => {
  const stale = makeHarness({ studio: makeStudio(), selectedElementId: 'deleted-before-render' })
  stale.command()
  assert.deepEqual(stale.events, [['change-scene'], ['selected-element', null]])
  assert.equal(stale.state.studio.updatedAt, timestamp)

  const noSelection = makeHarness({ selectedElementId: null })
  noSelection.command()
  assert.deepEqual(noSelection.events, [])

  const noStudio = makeHarness({ studio: null, selectedElementId: 'background' })
  noStudio.command()
  assert.deepEqual(noStudio.events, [])
})

test('StudioPage delega a exclusão da seleção ao comando da feature', () => {
  assert.match(pageSource, /createStudioDeleteSelectedCommand\(\{[\s\S]*?activeStudio,[\s\S]*?selectedElementId,[\s\S]*?changeScene,[\s\S]*?removeStageCharacter,[\s\S]*?setSelectedElementId/)
  assert.match(pageSource, /remove=\{deleteSelected\}/)
})

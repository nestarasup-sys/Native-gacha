import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { projectStudioCastItems } from '../src/renderer/src/features/studio/studioCastPanelModel.ts'

function character(id, name) {
  return { id, name, hair: '#111111', outfit: '#222222', skin: '#ffeecc' }
}

function element(id, characterId, text) {
  return { id, kind: 'character', characterId, text, x: 0, y: 0, width: 20, height: 30, rotation: 0, zIndex: 1 }
}

test('índice do elenco mantém nomes, fallback e primeira correspondência de ID', () => {
  const alice = character('alice', '  Alice Azevedo ')
  const items = projectStudioCastItems(
    [element('actor-1', 'alice', 'Texto'), element('actor-2', 'missing', '  Sem catálogo'), element('actor-3', undefined, 'Narrador')],
    [alice, character('alice', 'Outra Alice')]
  )

  assert.deepEqual(items.map(({ firstName }) => firstName), ['Alice', 'Sem', 'Narrador'])
  assert.equal(items[0].character, alice)
  assert.equal(items[1].character, null)
  assert.equal(items[2].character, null)
  assert.equal(items[0].element.id, 'actor-1')
})

test('painel do elenco é apresentação e a StudioPage mantém o controle das ações', async () => {
  const [page, panel] = await Promise.all([
    readFile('src/renderer/src/features/studio/StudioPage.tsx', 'utf8'),
    readFile('src/renderer/src/features/studio/StudioCastPanel.tsx', 'utf8')
  ])

  assert.match(page, /<StudioCastPanel/)
  assert.match(page, /onTogglePositionLock=\{toggleStageCharacterPositionLock\}/)
  assert.match(page, /onRemoveCharacter=\{removeStageCharacter\}/)
  assert.match(panel, /onSelectCharacter\(element\)/)
  assert.match(panel, /onRemoveCharacter\(element\)/)
  assert.doesNotMatch(panel, /changeScene\(|ipcRenderer|window\.desktop/)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { projectSceneCastItems } from '../src/renderer/src/ui/components/sceneCastPanelModel.ts'

function character(id, name) {
  return { id, name, hair: '#111111', outfit: '#222222', skin: '#ffeecc' }
}

function element(id, characterId, text) {
  return { id, kind: 'character', characterId, text, x: 0, y: 0, width: 20, height: 30, rotation: 0, zIndex: 1 }
}

test('índice do elenco mantém nomes, fallback e primeira correspondência de ID', () => {
  const alice = character('alice', '  Alice Azevedo ')
  const items = projectSceneCastItems(
    [element('actor-1', 'alice', 'Texto'), element('actor-2', 'missing', '  Sem catálogo'), element('actor-3', undefined, 'Narrador')],
    [alice, character('alice', 'Outra Alice')]
  )

  assert.deepEqual(items.map(({ firstName }) => firstName), ['Alice', 'Sem', 'Narrador'])
  assert.equal(items[0].character, alice)
  assert.equal(items[1].character, null)
  assert.equal(items[2].character, null)
  assert.equal(items[0].element.id, 'actor-1')
})

test('Studio e Editor V6 compartilham apresentação sem compartilhar as ações', async () => {
  const [studio, editorV6, panel] = await Promise.all([
    readFile('src/renderer/src/features/studio/StudioPage.tsx', 'utf8'),
    readFile('src/renderer/src/features/editorV6/EditorV6Page.tsx', 'utf8'),
    readFile('src/renderer/src/ui/components/SceneCastPanel.tsx', 'utf8')
  ])

  assert.match(studio, /<SceneCastPanel/)
  assert.match(studio, /onTogglePositionsLocked=\{toggleStageCharacterPositionLock\}/)
  assert.match(studio, /onRemoveCharacter=\{removeStageCharacter\}/)
  assert.match(editorV6, /<SceneCastPanel/)
  assert.match(editorV6, /onTogglePositionsLocked=\{toggleStageCharacterPositionLock\}/)
  assert.match(editorV6, /onRemoveCharacter=\{removeStageCharacter\}/)
  assert.match(panel, /onSelectCharacter\(element\)/)
  assert.match(panel, /onRemoveCharacter\(element\)/)
  assert.doesNotMatch(panel, /changeScene\(|ipcRenderer|window\.desktop/)
  assert.doesNotMatch(studio, /StudioCastPanel/)
  assert.doesNotMatch(editorV6, /EditorV6CastPanel/)
})

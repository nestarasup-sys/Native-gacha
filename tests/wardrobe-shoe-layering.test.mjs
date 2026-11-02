import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolveShoeOverlayAnchorPartId } from '../src/renderer/src/characters/wardrobeShoeLayering.ts'

const part = (id, name, x, y) => ({
  id, name, x, y, width: 20, height: 30, rotation: 0,
  dataUrl: 'data:image/png;base64,AA=='
})

test('sapato sobreposto é ancorado depois do pé e da canela do mesmo lado', () => {
  const shinLeft = part('shin-left', 'Canela esquerda', 10, 50)
  const footLeft = part('foot-left', 'Pé esquerdo', 11, 80)
  const shinRight = part('shin-right', 'Canela direita', 50, 50)
  const footRight = part('foot-right', 'Pé direito', 50, 80)
  const parts = [shinLeft, footLeft, shinRight, footRight]

  assert.equal(resolveShoeOverlayAnchorPartId(
    { attachedPartId: 'foot-left', sleeveSide: 'left' }, footLeft, parts,
    ['shin-left', 'foot-left', 'shin-right', 'foot-right']
  ), 'foot-left')
})

test('sapato é desenhado depois da canela quando ela vem após o pé na ordem de camadas', () => {
  const shinLeft = part('shin-left', 'Canela esquerda', 10, 50)
  const footLeft = part('foot-left', 'Pé esquerdo', 11, 80)
  const shinRight = part('shin-right', 'Canela direita', 50, 50)
  const parts = [shinLeft, footLeft, shinRight]

  assert.equal(resolveShoeOverlayAnchorPartId(
    { attachedPartId: 'foot-left', sleeveSide: 'left' }, footLeft, parts,
    ['foot-left', 'shin-left', 'shin-right']
  ), 'shin-left')
})

test('a canela do lado oposto não vira alvo quando o lado do sapato está identificado', () => {
  const shinRight = part('shin-right', 'Canela direita', 12, 50)
  const footLeft = part('foot-left', 'Pé esquerdo', 10, 80)
  const parts = [shinRight, footLeft]

  assert.equal(resolveShoeOverlayAnchorPartId(
    { attachedPartId: 'foot-left', sleeveSide: 'left' }, footLeft, parts,
    ['shin-right', 'foot-left']
  ), 'foot-left')
})

test('renderer desenha sapatos marcados depois da roupa e da ponte da canela', async () => {
  const renderer = await readFile(new URL('../src/renderer/src/characters/characterWardrobeRenderer.ts', import.meta.url), 'utf8')
  assert.match(renderer, /resolveShoeOverlayAnchorPartId\(/)
  assert.match(renderer, /garment\.group\.renderAboveShinClothing !== true/)
  assert.match(renderer, /garment\.component\.category === 'sapato' && garment\.group\.renderAboveShinClothing === true\) continue/)
  assert.ok(renderer.indexOf('for (const bridge of bridgesAfterPart.get(part.id)')
    < renderer.indexOf('for (const garment of shoeOverlaysAfterPart.get(part.id)'))
})

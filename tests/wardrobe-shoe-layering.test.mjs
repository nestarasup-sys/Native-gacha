import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolveShoeBehindShinPlacement } from '../src/renderer/src/characters/wardrobeShoeLayering.ts'

const part = (id, name, x, y) => ({
  id, name, x, y, width: 20, height: 30, rotation: 0,
  dataUrl: 'data:image/png;base64,AA=='
})

test('sapato atrás da roupa aguarda o pé e a canela do mesmo lado', () => {
  const shinLeft = part('shin-left', 'Canela esquerda', 10, 50)
  const footLeft = part('foot-left', 'Pé esquerdo', 11, 80)
  const shinRight = part('shin-right', 'Canela direita', 50, 50)
  const footRight = part('foot-right', 'Pé direito', 50, 80)
  const parts = [shinLeft, footLeft, shinRight, footRight]

  assert.deepEqual(resolveShoeBehindShinPlacement(
    { attachedPartId: 'foot-left', sleeveSide: 'left' }, footLeft, parts,
    ['shin-left', 'foot-left', 'shin-right', 'foot-right']
  ), { shinPartId: 'shin-left', renderAfterPartId: 'foot-left' })
})

test('camada da canela é adiada até depois do pé quando ele vem primeiro', () => {
  const shinLeft = part('shin-left', 'Canela esquerda', 10, 50)
  const footLeft = part('foot-left', 'Pé esquerdo', 11, 80)
  const shinRight = part('shin-right', 'Canela direita', 50, 50)
  const parts = [shinLeft, footLeft, shinRight]

  assert.deepEqual(resolveShoeBehindShinPlacement(
    { attachedPartId: 'foot-left', sleeveSide: 'left' }, footLeft, parts,
    ['foot-left', 'shin-left', 'shin-right']
  ), { shinPartId: 'shin-left', renderAfterPartId: 'shin-left' })
})

test('canela do lado oposto não vira alvo para cobrir o sapato', () => {
  const shinRight = part('shin-right', 'Canela direita', 12, 50)
  const footLeft = part('foot-left', 'Pé esquerdo', 10, 80)
  const parts = [shinRight, footLeft]

  assert.deepEqual(resolveShoeBehindShinPlacement(
    { attachedPartId: 'foot-left', sleeveSide: 'left' }, footLeft, parts,
    ['shin-right', 'foot-left']
  ), { shinPartId: null, renderAfterPartId: 'foot-left' })
})

test('renderer desenha o sapato, depois a canela e a ponte para manter o sapato atrás', async () => {
  const renderer = await readFile(new URL('../src/renderer/src/characters/characterWardrobeRenderer.ts', import.meta.url), 'utf8')
  assert.match(renderer, /resolveShoeBehindShinPlacement\(/)
  assert.match(renderer, /garment\.group\.renderBehindShinClothing !== true/)
  assert.match(renderer, /deferredShoes\.add\(garment\)/)
  const shoeDraw = renderer.indexOf('for (const shoe of behindLayers?.shoes')
  const shinDraw = renderer.indexOf('for (const shinGarment of behindLayers?.shinGarments')
  const bridgeDraw = renderer.indexOf('for (const bridge of behindLayers?.bridges')
  assert.ok(shoeDraw >= 0 && shoeDraw < shinDraw && shinDraw < bridgeDraw)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { effectiveAssetColorMode, loadAssetColorModeImage, toAssetColorOverrides } from '../src/renderer/src/characters/assetColorMode.ts'

test('converte os cinco controles fixos para as funções equivalentes das cores originais', () => {
  assert.deepEqual(toAssetColorOverrides({
    outline: '#111111', shadow: '#333333', base: '#777777', light: '#dddddd', detail: '#8c7bff'
  }), {
    outline: '#111111', fade: '#333333', base: '#777777', highlight: '#dddddd', accent: '#8c7bff'
  })
  assert.deepEqual(toAssetColorOverrides({ outline: '#222222', fade: '#444444', base: '#888888', highlight: '#eeeeee', accent: '#aa55cc' }), {
    outline: '#222222', fade: '#444444', base: '#888888', highlight: '#eeeeee', accent: '#aa55cc'
  })
  assert.equal(toAssetColorOverrides({}), undefined)
})

test('mantém o renderer legado e escolhe o renderer correto depois da escolha explícita', async () => {
  const calls = []
  const loaders = {
    fixedPalette: async (_source, colors) => { calls.push(['fixed', colors]); return 'fixed-image' },
    assetColors: async (_source, colors) => { calls.push(['asset', colors]); return 'asset-image' }
  }
  assert.equal(effectiveAssetColorMode(undefined, 'fixed-palette'), 'fixed-palette')
  assert.equal(await loadAssetColorModeImage('piece.png', undefined, undefined, 'fixed-palette', loaders), 'fixed-image')
  assert.equal(await loadAssetColorModeImage('piece.png', { shadow: '#123456' }, 'asset-colors', 'fixed-palette', loaders), 'asset-image')
  assert.deepEqual(calls, [['fixed', undefined], ['asset', { fade: '#123456' }]])
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { getHairThreeStyleRegions } from '../src/renderer/src/features/fabricator/hairGridLayout.ts'

test('grade de três cabelos separa três colunas e duas fileiras na ordem pedida', () => {
  const regions = getHairThreeStyleRegions(900, 600)
  assert.equal(regions.length, 3)
  assert.deepEqual(regions.map(({ posterior, traseiro }) => ({
    posterior: [posterior.x, posterior.y, posterior.width, posterior.height],
    traseiro: [traseiro.x, traseiro.y, traseiro.width, traseiro.height]
  })), [
    { posterior: [0, 0, 300, 300], traseiro: [0, 300, 300, 300] },
    { posterior: [300, 0, 300, 300], traseiro: [300, 300, 300, 300] },
    { posterior: [600, 0, 300, 300], traseiro: [600, 300, 300, 300] }
  ])
})

test('grade distribui pixels restantes sem perder bordas', () => {
  const regions = getHairThreeStyleRegions(10, 7)
  assert.deepEqual(regions.map(({ source }) => [source.x, source.width]), [[0, 3], [3, 3], [6, 4]])
  assert.deepEqual(regions.map(({ posterior, traseiro }) => posterior.height + traseiro.height), [7, 7, 7])
  assert.equal(regions.at(-1).source.x + regions.at(-1).source.width, 10)
})

test('rejeita folhas pequenas demais para os três conjuntos', () => {
  assert.throws(() => getHairThreeStyleRegions(2, 100), /3 colunas e 2 fileiras/)
  assert.throws(() => getHairThreeStyleRegions(100, 1), /3 colunas e 2 fileiras/)
})

test('modal mantém importação individual e em par, além da grade de três conjuntos', async () => {
  const [workspace, modal] = await Promise.all([
    readFile('src/renderer/src/features/fabricator/HairWorkspace.tsx', 'utf8'),
    readFile('src/renderer/src/features/fabricator/HairImportModal.tsx', 'utf8')
  ])
  assert.match(workspace, /onImportThreeStyleGrid=\{\(\) => \{ setImportModalOpen\(false\); threeStyleFileInputRef\.current\?\.click\(\) \}\}/)
  assert.match(workspace, /processThreeStyleHairGrid\(sourceImageDataUrl, tolerance, mode\)/)
  assert.match(workspace, /saveStyle\(workspace, name, null\)/)
  assert.match(modal, /Importar uma peça/)
  assert.match(modal, /Importar um conjunto/)
  assert.match(modal, /Importar 3 conjuntos/)
  assert.match(modal, /posterior em cima e traseiro embaixo/)
})

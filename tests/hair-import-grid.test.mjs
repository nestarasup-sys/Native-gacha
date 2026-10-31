import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { detectHairGridSplits, getHairThreeStyleRegions } from '../src/renderer/src/features/fabricator/hairGridLayout.ts'
import { findHairCropBounds } from '../src/renderer/src/features/fabricator/hairCropBounds.ts'

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

test('permite divisões ajustadas para folhas com colunas e fileiras desiguais', () => {
  const regions = getHairThreeStyleRegions(1000, 500, {
    firstColumnPercent: 28.5,
    secondColumnPercent: 71.2,
    posteriorRowPercent: 43.6
  })
  assert.deepEqual(regions.map(({ posterior, traseiro }) => [posterior.x, posterior.width, posterior.height, traseiro.y, traseiro.height]), [
    [0, 285, 218, 218, 282],
    [285, 427, 218, 218, 282],
    [712, 288, 218, 218, 282]
  ])
  const normalized = getHairThreeStyleRegions(100, 100, { firstColumnPercent: 45, secondColumnPercent: 30, posteriorRowPercent: 50 })
  assert.deepEqual(normalized.map(({ source }) => source.x), [0, 45, 55])
})

function rgbaFixture(width, height, pixels) {
  const rgba = new Uint8ClampedArray(width * height * 4)
  for (const [x, y, alpha = 255] of pixels) rgba.set([90, 50, 120, alpha], (y * width + x) * 4)
  return rgba
}

test('recorte resiste pixels isolados, preserva fios na área principal e aplica margem configurável', () => {
  const pixels = []
  for (let y = 6; y <= 15; y += 1) for (let x = 5; x <= 14; x += 1) pixels.push([x, y])
  pixels.push([0, 0], [19, 19])
  const rgba = rgbaFixture(20, 20, pixels)
  assert.deepEqual(findHairCropBounds(rgba, 20, 20, 0), { left: 5, top: 6, right: 14, bottom: 15 })
  assert.deepEqual(findHairCropBounds(rgba, 20, 20, 10), { left: 3, top: 4, right: 16, bottom: 17 })
  assert.equal(rgba[(0 * 20 + 0) * 4 + 3], 0)
  assert.equal(rgba[(19 * 20 + 19) * 4 + 3], 0)
})

test('recorte mantém um detalhe separado com área útil e remove apenas ruído menor que o limite', () => {
  const pixels = []
  for (let y = 2; y <= 7; y += 1) for (let x = 2; x <= 7; x += 1) pixels.push([x, y])
  pixels.push([14, 2], [15, 2], [14, 3], [15, 3], [19, 19])
  const rgba = rgbaFixture(20, 20, pixels)
  assert.deepEqual(findHairCropBounds(rgba, 20, 20, 0), { left: 2, top: 2, right: 15, bottom: 7 })
  assert.equal(rgba[(19 * 20 + 19) * 4 + 3], 0)
  assert.equal(rgba[(2 * 20 + 14) * 4 + 3], 255)
})

test('detecta divisões pelo meio dos espaços transparentes entre as silhuetas', () => {
  const width = 900, height = 500
  const rgba = new Uint8ClampedArray(width * height * 4)
  for (const [left, right, top, bottom] of [
    [20, 235, 20, 180], [320, 500, 25, 185], [660, 890, 15, 175],
    [30, 240, 285, 480], [325, 490, 290, 475], [650, 880, 280, 490]
  ]) for (let y = top; y < bottom; y += 1) for (let x = left; x < right; x += 1) rgba[(y * width + x) * 4 + 3] = 255
  const splits = detectHairGridSplits({ width, height, data: rgba })
  const first = Math.round(width * splits.firstColumnPercent / 100)
  const second = Math.round(width * splits.secondColumnPercent / 100)
  const row = Math.round(height * splits.posteriorRowPercent / 100)
  assert.ok(first > 245 && first < 310, `primeira divisão ficou em ${first}px`)
  assert.ok(second > 510 && second < 650, `segunda divisão ficou em ${second}px`)
  assert.ok(row > 180 && row < 285, `divisão horizontal ficou em ${row}px`)
})

test('detecta colunas com larguras muito diferentes usando o espaço entre os grupos', () => {
  const width = 1000, height = 500
  const rgba = new Uint8ClampedArray(width * height * 4)
  for (const [left, right, top, bottom] of [
    [15, 155, 20, 285], [300, 425, 22, 288], [500, 970, 18, 290],
    [20, 160, 355, 490], [305, 420, 355, 485], [495, 965, 350, 488]
  ]) for (let y = top; y < bottom; y += 1) for (let x = left; x < right; x += 1) rgba[(y * width + x) * 4 + 3] = 255
  const splits = detectHairGridSplits({ width, height, data: rgba })
  const first = Math.round(width * splits.firstColumnPercent / 100)
  const second = Math.round(width * splits.secondColumnPercent / 100)
  const row = Math.round(height * splits.posteriorRowPercent / 100)
  assert.ok(first > 200 && first < 270, `primeira divisão ficou em ${first}px`)
  assert.ok(second > 435 && second < 495, `segunda divisão ficou em ${second}px`)
  assert.ok(row > 300 && row < 340, `divisão horizontal ficou em ${row}px`)
})

test('não analisa transparência como conteúdo e aponta células vazias', () => {
  const transparent = rgbaFixture(8, 8, [[2, 2, 0], [6, 6, 0]])
  assert.throws(() => findHairCropBounds(transparent, 8, 8), /Não encontrei/)
  assert.throws(() => findHairCropBounds(new Uint8Array(2), 8, 8), /limites do cabelo/)
})

test('modal mantém importação individual e em par, além da grade de três conjuntos', async () => {
  const [workspace, modal, worker] = await Promise.all([
    readFile('src/renderer/src/features/fabricator/HairWorkspace.tsx', 'utf8'),
    readFile('src/renderer/src/features/fabricator/HairImportModal.tsx', 'utf8'),
    readFile('src/renderer/src/features/fabricator/hairProcessor.worker.ts', 'utf8')
  ])
  assert.match(workspace, /onImportThreeStyleGrid=\{\(\) => \{ setImportModalOpen\(false\); threeStyleFileInputRef\.current\?\.click\(\) \}\}/)
  assert.match(workspace, /processThreeStyleHairGrid\(hairGridReview\.sourceImageDataUrl, hairGridReview\.tolerance, hairGridReview\.mode, paddingPercent, splits\)/)
  assert.match(workspace, /saveStyle\(workspace, name, null\)/)
  assert.match(modal, /Importar uma peça/)
  assert.match(modal, /Importar um conjunto/)
  assert.match(modal, /Importar 3 conjuntos/)
  assert.match(modal, /posterior em cima e traseiro embaixo/)
  assert.match(await readFile('src/renderer/src/features/fabricator/HairGridReviewModal.tsx', 'utf8'), /Divisão 1ª coluna/)
  assert.match(await readFile('src/renderer/src/features/fabricator/HairGridReviewModal.tsx', 'utf8'), /Margem transparente/)
  assert.match(worker, /detectHairGridSplits\(processed\)/)
  assert.match(worker, /findHairCropBounds\(image\.data, image\.width, image\.height, paddingPercent\)/)
})

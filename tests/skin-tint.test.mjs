import test from 'node:test'
import assert from 'node:assert/strict'
import { fillEnclosedTransparentSkin, tintModelBodyPixels, tintSkinPixels } from '../src/renderer/src/characters/skinTint.ts'

function makeImage(width, height, color = [0, 0, 0, 0]) {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let pixel = 0; pixel < width * height; pixel++) data.set(color, pixel * 4)
  return { width, height, data }
}

function setPixel(image, x, y, color) {
  image.data.set(color, (y * image.width + x) * 4)
}

function getPixel(image, x, y) {
  return Array.from(image.data.slice((y * image.width + x) * 4, (y * image.width + x) * 4 + 4))
}

function rgb(hex, alpha = 255) {
  return [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16)).concat(alpha)
}

test('preenche o interior cercado e conserva transparência externa e contorno original', () => {
  const image = makeImage(5, 5)
  for (let coordinate = 1; coordinate <= 3; coordinate++) {
    setPixel(image, coordinate, 1, [24, 18, 22, 255])
    setPixel(image, coordinate, 3, [24, 18, 22, 255])
    setPixel(image, 1, coordinate, [24, 18, 22, 255])
    setPixel(image, 3, coordinate, [24, 18, 22, 255])
  }

  const filled = fillEnclosedTransparentSkin(image, '#edc5a5', [], false)

  assert.equal(filled, 1)
  assert.deepEqual(getPixel(image, 2, 2), rgb('#edc5a5'))
  assert.deepEqual(getPixel(image, 0, 0), [0, 0, 0, 0])
  assert.deepEqual(getPixel(image, 1, 2), [24, 18, 22, 255])
})

test('recolore a pele cercada por um contorno que se conecta diagonalmente', () => {
  const image = makeImage(5, 5)
  for (const [x, y] of [[2, 0], [1, 1], [3, 1], [0, 2], [4, 2], [1, 3], [3, 3], [2, 4]]) {
    setPixel(image, x, y, [24, 18, 22, 255])
  }

  tintModelBodyPixels(image, '#c88961')

  assert.deepEqual(getPixel(image, 2, 2), rgb('#c88961'))
  assert.deepEqual(getPixel(image, 0, 0), [0, 0, 0, 0])
})

test('uma abertura ortogonal real continua conectando a junta ao fundo transparente', () => {
  const image = makeImage(5, 5)
  for (let coordinate = 1; coordinate <= 3; coordinate++) {
    setPixel(image, coordinate, 1, [24, 18, 22, 255])
    setPixel(image, 1, coordinate, [24, 18, 22, 255])
    setPixel(image, 3, coordinate, [24, 18, 22, 255])
  }
  setPixel(image, 1, 3, [24, 18, 22, 255])
  setPixel(image, 3, 3, [24, 18, 22, 255])

  const filled = fillEnclosedTransparentSkin(image, '#edc5a5', [], false)

  assert.equal(filled, 0)
  assert.deepEqual(getPixel(image, 2, 2), [0, 0, 0, 0])
})

test('recolore a faixa clara entre a pele do modelo e o contorno sem cruzar o traço', () => {
  const image = makeImage(13, 9, [255, 255, 255, 255])
  for (let x = 1; x <= 11; x++) {
    setPixel(image, x, 1, [24, 18, 22, 255])
    setPixel(image, x, 7, [24, 18, 22, 255])
  }
  for (let y = 1; y <= 7; y++) {
    setPixel(image, 1, y, [24, 18, 22, 255])
    setPixel(image, 11, y, [24, 18, 22, 255])
  }
  for (let y = 2; y <= 6; y++) for (let x = 2; x <= 10; x++) setPixel(image, x, y, [255, 255, 255, 255])
  for (let y = 3; y <= 5; y++) for (let x = 5; x <= 7; x++) setPixel(image, x, y, rgb('#f5ddcb'))

  tintModelBodyPixels(image, '#c88961', '#352522')

  assert.notDeepEqual(getPixel(image, 2, 4), [255, 255, 255, 255])
  assert.notDeepEqual(getPixel(image, 10, 4), [255, 255, 255, 255])
  assert.deepEqual(getPixel(image, 1, 4), [22, 16, 14, 255])
  assert.deepEqual(getPixel(image, 0, 4), [255, 255, 255, 255])
})

test('a recuperação de bordas claras só é aplicada a peças do modelo', () => {
  const image = makeImage(13, 9, [255, 255, 255, 255])
  for (let x = 1; x <= 11; x++) {
    setPixel(image, x, 1, [24, 18, 22, 255])
    setPixel(image, x, 7, [24, 18, 22, 255])
  }
  for (let y = 1; y <= 7; y++) {
    setPixel(image, 1, y, [24, 18, 22, 255])
    setPixel(image, 11, y, [24, 18, 22, 255])
  }
  for (let y = 2; y <= 6; y++) for (let x = 2; x <= 10; x++) setPixel(image, x, y, [255, 255, 255, 255])
  for (let y = 3; y <= 5; y++) for (let x = 5; x <= 7; x++) setPixel(image, x, y, rgb('#f5ddcb'))

  tintSkinPixels(image, '#c88961')

  assert.deepEqual(getPixel(image, 2, 4), [255, 255, 255, 255])
})

test('o contorno artificial fecha a junta sem preencher o fundo transparente', () => {
  const image = makeImage(7, 7)
  for (let coordinate = 1; coordinate <= 5; coordinate++) {
    setPixel(image, coordinate, 1, [30, 24, 28, 255])
    setPixel(image, 1, coordinate, [30, 24, 28, 255])
    setPixel(image, 5, coordinate, [30, 24, 28, 255])
  }
  setPixel(image, 1, 5, [30, 24, 28, 255])
  setPixel(image, 5, 5, [30, 24, 28, 255])
  const jointGuide = [{ points: [{ x: 1 / 6, y: 5 / 6 }, { x: 5 / 6, y: 5 / 6 }], width: 0.2 }]

  fillEnclosedTransparentSkin(image, '#c88961', jointGuide, false)

  assert.deepEqual(getPixel(image, 3, 3), rgb('#c88961'))
  assert.deepEqual(getPixel(image, 3, 5), rgb('#c88961'))
  assert.deepEqual(getPixel(image, 0, 0), [0, 0, 0, 0])
})

test('preserva o preenchimento por scanline das imagens antigas sem guia artificial', () => {
  const image = makeImage(5, 1)
  setPixel(image, 0, 0, [242, 214, 194, 255])
  setPixel(image, 4, 0, [242, 214, 194, 255])

  const filled = fillEnclosedTransparentSkin(image, '#dba47d')

  assert.equal(filled, 3)
  assert.deepEqual(getPixel(image, 2, 0), rgb('#dba47d'))
})

test('recolore o interior e o contorno usando a máscara original, preservando alpha', () => {
  const image = makeImage(17, 17, rgb('#f5ddcb'))
  for (let coordinate = 0; coordinate < image.width; coordinate++) {
    setPixel(image, coordinate, 0, [20, 17, 18, 220])
    setPixel(image, coordinate, image.height - 1, [20, 17, 18, 220])
    setPixel(image, 0, coordinate, [20, 17, 18, 220])
    setPixel(image, image.width - 1, coordinate, [20, 17, 18, 220])
  }

  tintModelBodyPixels(image, '#c88961', '#352522')

  assert.deepEqual(getPixel(image, 8, 8), rgb('#c88961'))
  assert.deepEqual(getPixel(image, 0, 8), [22, 16, 14, 220])
  assert.deepEqual(getPixel(image, 8, 0), [22, 16, 14, 220])
})

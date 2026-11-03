import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createWardrobePairedSheetComponents } from '../src/renderer/src/features/fabricator/wardrobe/wardrobePairedSheetImport.ts'
import { wardrobePairImageMode, wardrobePairedGridImportKind } from '../src/renderer/src/features/fabricator/wardrobe/wardrobePairedSheetPolicy.ts'

function installCanvasMock(t) {
  const canvases = []
  globalThis.document = {
    createElement(name) {
      assert.equal(name, 'canvas')
      const canvas = {
        width: 0,
        height: 0,
        pixels: new Uint8ClampedArray(),
        transforms: [],
        getContext() {
          return {
            drawImage(source) {
              const pixels = source.pixels ?? source.data
              canvas.pixels = new Uint8ClampedArray(pixels)
            },
            getImageData() {
              return { width: canvas.width, height: canvas.height, data: new Uint8ClampedArray(canvas.pixels) }
            },
            createImageData(width, height) {
              return { width, height, data: new Uint8ClampedArray(width * height * 4) }
            },
            putImageData(imageData) { canvas.pixels = new Uint8ClampedArray(imageData.data) },
            translate(...args) { canvas.transforms.push(['translate', ...args]) },
            scale(...args) { canvas.transforms.push(['scale', ...args]) }
          }
        },
        toDataURL() { return `data:image/png;base64,${Buffer.from(canvas.pixels).toString('base64')}` }
      }
      canvases.push(canvas)
      return canvas
    }
  }
  t.after(() => { delete globalThis.document })
  return canvases
}

function makeSheet() {
  const width = 18, height = 22
  const data = new Uint8ClampedArray(width * height * 4)
  const xPositions = [1, 7, 13]
  const yPositions = [1, 6, 11, 16]
  for (let row = 0; row < 4; row += 1) for (let col = 0; col < 3; col += 1) {
    const cell = row * 3 + col
    for (let y = yPositions[row]; y < yPositions[row] + 2; y += 1) for (let x = xPositions[col]; x < xPositions[col] + 2; x += 1) {
      const offset = (y * width + x) * 4
      data[offset] = 30 + cell
      data[offset + 1] = 90 + cell
      data[offset + 2] = 170 + cell
      data[offset + 3] = 255
    }
  }
  return { width, height, data, closed: false, close() { this.closed = true } }
}

function modelFixture() {
  return { width: 100, height: 100, parts: [] }
}

function decodeDataUrl(dataUrl) {
  return new Uint8ClampedArray(Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64'))
}

test('sapatos: lê uma folha 3×4 e cria 12 pares com a imagem direita sem espelhamento', (t) => {
  const canvases = installCanvasMock(t)
  const image = makeSheet()
  let id = 0
  const components = createWardrobePairedSheetComponents(image, modelFixture(), () => `id-${++id}`, 'shoes')

  assert.equal(image.closed, true)
  assert.equal(components.length, 24)
  assert.equal(new Set(components.map(component => component.sleevePairId)).size, 12)
  for (let pairIndex = 0; pairIndex < 12; pairIndex += 1) {
    const left = components[pairIndex * 2]
    const right = components[pairIndex * 2 + 1]
    assert.equal(left.sleeveSide, 'left')
    assert.equal(right.sleeveSide, 'right')
    assert.equal(left.sleevePairId, right.sleevePairId)
    assert.equal(left.category, 'sapato')
    assert.equal(right.category, 'sapato')
    assert.equal(left.sleeveJointSplit, undefined)
    assert.equal(right.sleeveJointSplit, undefined)
    assert.ok(right.x > left.x)
    assert.deepEqual(decodeDataUrl(right.dataUrl), decodeDataUrl(left.dataUrl))
    assert.equal(decodeDataUrl(right.dataUrl)[0], 30 + pairIndex)
  }
  assert.equal(canvases.some(canvas => canvas.transforms.length > 0), false)
})

test('mangas e calças continuam espelhando os 12 recortes direitos', (t) => {
  const canvases = installCanvasMock(t)
  for (const kind of ['sleeves', 'pants']) {
    createWardrobePairedSheetComponents(makeSheet(), modelFixture(), () => crypto.randomUUID(), kind)
  }

  const scales = canvases.flatMap(canvas => canvas.transforms).filter(([operation]) => operation === 'scale')
  assert.equal(scales.length, 24)
  assert.ok(scales.every(([, x, y]) => x === -1 && y === 1))
})

test('a escolha de sapatos persiste como grade própria e edições copiam a imagem sem inverter', () => {
  assert.equal(wardrobePairedGridImportKind('shoes'), 'shoe-grid-3x4')
  assert.equal(wardrobePairImageMode('shoe-grid-3x4'), 'copy')
  assert.equal(wardrobePairImageMode('pants-grid-3x4'), 'mirror')
  assert.equal(wardrobePairImageMode('sleeve-grid-3x4'), 'mirror')
  assert.equal(wardrobePairImageMode('sleeve-grid-3x4', 'sapato'), 'copy')
  assert.equal(wardrobePairImageMode('pants-grid-3x4', 'sapato'), 'copy')
})

test('Roupas DEV oferece a importação 3×4 de sapatos e informa que o par não será invertido', async () => {
  const page = await readFile(new URL('../src/renderer/src/features/fabricator/wardrobe/WardrobeWorkspace.tsx', import.meta.url), 'utf8')
  const modal = await readFile(new URL('../src/renderer/src/features/fabricator/wardrobe/WardrobeGarmentEditorModal.tsx', import.meta.url), 'utf8')

  assert.match(page, /pairedSheetKindRef\.current = 'shoes'/)
  assert.match(page, /Importar Sapatos \(Sheet\)/)
  assert.match(page, /12 sapatos esquerdos em 3 colunas e 4 linhas/)
  assert.match(page, /wardrobePairImageMode\(current\.importKind,\s*edited\.category\)/)
  assert.match(modal, /A peça duplicada também será atualizada sem inverter a imagem/)
})

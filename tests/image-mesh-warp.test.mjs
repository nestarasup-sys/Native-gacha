import test from 'node:test'
import assert from 'node:assert/strict'
import { applyImageWarpBrushStroke, applyImageWarpSmoothBrush, applyImageWarpSmoothBrushStroke, createImageWarpMesh, drawImageWarp, imageWarpPadding } from '../src/renderer/src/features/fabricator/models/imageMeshWarp.ts'

test('a malha sem deslocamentos desenha a imagem diretamente sem costuras triangulares', () => {
  const calls = { drawImage: 0, clip: 0, beginPath: 0 }
  const context = {
    imageSmoothingEnabled: false,
    imageSmoothingQuality: 'low',
    clearRect() {},
    drawImage() { calls.drawImage += 1 },
    clip() { calls.clip += 1 },
    beginPath() { calls.beginPath += 1 },
    moveTo() {}, lineTo() {}, closePath() {}, save() {}, restore() {}, setTransform() {}
  }
  const canvas = { width: 0, height: 0, getContext: () => context }
  const image = { naturalWidth: 225, naturalHeight: 305 }
  const mesh = createImageWarpMesh()
  assert.equal(imageWarpPadding(mesh), 0, 'an untouched mesh must keep the original image frame')
  const result = drawImageWarp(canvas, image, mesh)
  assert.deepEqual(result, { padding: 0, width: 225, height: 305 })
  assert.deepEqual(calls, { drawImage: 1, clip: 0, beginPath: 0 })
})

test('a malha deformada cobre as bordas antialias dos triângulos sem deixar frestas', () => {
  const calls = { drawImage: 0, clip: 0, operations: [], firstClip: [] }
  const context = {
    imageSmoothingEnabled: false,
    imageSmoothingQuality: 'low',
    globalCompositeOperation: 'source-over',
    state: [],
    clearRect() {},
    drawImage() { calls.drawImage += 1; calls.operations.push(this.globalCompositeOperation) },
    clip() { calls.clip += 1 },
    beginPath() { if (calls.clip === 0) calls.firstClip = [] },
    moveTo(x, y) { if (calls.clip === 0) calls.firstClip.push({ x, y }) },
    lineTo(x, y) { if (calls.clip === 0) calls.firstClip.push({ x, y }) },
    closePath() {},
    save() { this.state.push(this.globalCompositeOperation) },
    restore() { this.globalCompositeOperation = this.state.pop() ?? 'source-over' },
    setTransform() {}
  }
  const canvas = { width: 0, height: 0, getContext: () => context }
  const image = { naturalWidth: 225, naturalHeight: 305 }
  const mesh = createImageWarpMesh()
  mesh.offsetX[mesh.offsetX.length / 2 | 0] = 10
  drawImageWarp(canvas, image, mesh, 0)
  assert.equal(calls.clip, 13 * 15 * 2)
  assert.equal(calls.drawImage, calls.clip)
  assert.ok(calls.operations.every((operation) => operation === 'source-over'), 'adjacent patches must cover antialias pinholes')
  assert.ok(calls.firstClip[0].x < 0 && calls.firstClip[1].x > 225 / 13, 'the raster clip must bleed past shared edges')
  assert.equal(context.globalCompositeOperation, 'source-over', 'the warp must restore the canvas composition state')
})

test('o pincel interpolado distribui a deformação pelo caminho inteiro do mouse', () => {
  const mesh = createImageWarpMesh(10, 10)
  const image = { naturalWidth: 100, naturalHeight: 100 }
  applyImageWarpBrushStroke(mesh, image, { x: 0, y: 0, width: 100, height: 100, rotation: 0 }, { x: 20, y: 50 }, { x: 80, y: 50 }, 20, 0.5)
  const at = (column, row) => row * (mesh.columns + 1) + column
  assert.ok(mesh.offsetX[at(2, 5)] > 0, 'a região inicial do traço foi afetada')
  assert.ok(mesh.offsetX[at(5, 5)] > 0, 'a região central do traço foi afetada')
  assert.ok(mesh.offsetX[at(8, 5)] > 0, 'a região final do traço foi afetada')
})

test('o pincel suavizador reduz picos locais sem apagar a forma ao redor', () => {
  const mesh = createImageWarpMesh(10, 10)
  const image = { naturalWidth: 100, naturalHeight: 100 }
  const at = (column, row) => row * (mesh.columns + 1) + column
  mesh.offsetX[at(5, 5)] = 24
  applyImageWarpSmoothBrush(mesh, image, { x: 0, y: 0, width: 100, height: 100, rotation: 0 }, { x: 50, y: 50 }, 20, 1)
  assert.ok(mesh.offsetX[at(5, 5)] < 24, 'o pico central foi suavizado')
  assert.ok(mesh.offsetX[at(4, 5)] > 0, 'a mudança se distribuiu aos vértices vizinhos')
  assert.ok(mesh.offsetX[at(0, 0)] === 0, 'a área fora do pincel permaneceu intacta')
})

test('o traço suavizador cobre o caminho entre eventos esparsos do mouse', () => {
  const mesh = createImageWarpMesh(10, 10)
  const image = { naturalWidth: 100, naturalHeight: 100 }
  const at = (column, row) => row * (mesh.columns + 1) + column
  for (const column of [2, 5, 8]) mesh.offsetX[at(column, 5)] = 18
  applyImageWarpSmoothBrushStroke(mesh, image, { x: 0, y: 0, width: 100, height: 100, rotation: 0 }, { x: 20, y: 50 }, { x: 80, y: 50 }, 20, 1)
  for (const column of [2, 5, 8]) assert.ok(mesh.offsetX[at(column, 5)] < 18, `o pico da coluna ${column} foi suavizado`)
})

test('a malha mais densa do tronco mantém suas próprias subdivisões', () => {
  const mesh = createImageWarpMesh(20, 26)
  assert.equal(mesh.offsetX.length, 21 * 27)
  assert.equal(mesh.columns, 20)
  assert.equal(mesh.rows, 26)
})

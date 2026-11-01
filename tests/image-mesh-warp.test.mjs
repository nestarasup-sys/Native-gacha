import test from 'node:test'
import assert from 'node:assert/strict'
import { createImageWarpMesh, drawImageWarp } from '../src/renderer/src/features/fabricator/models/imageMeshWarp.ts'

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
  const result = drawImageWarp(canvas, image, createImageWarpMesh(), 0)
  assert.deepEqual(result, { padding: 0, width: 225, height: 305 })
  assert.deepEqual(calls, { drawImage: 1, clip: 0, beginPath: 0 })
})

test('a malha deformada usa sobreposição entre triângulos para esconder frestas de rasterização', () => {
  const calls = { drawImage: 0, clip: 0 }
  const context = {
    imageSmoothingEnabled: false,
    imageSmoothingQuality: 'low',
    clearRect() {},
    drawImage() { calls.drawImage += 1 },
    clip() { calls.clip += 1 },
    beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, save() {}, restore() {}, setTransform() {}
  }
  const canvas = { width: 0, height: 0, getContext: () => context }
  const image = { naturalWidth: 225, naturalHeight: 305 }
  const mesh = createImageWarpMesh()
  mesh.offsetX[mesh.offsetX.length / 2 | 0] = 10
  drawImageWarp(canvas, image, mesh, 0)
  assert.equal(calls.clip, 13 * 15 * 2)
  assert.equal(calls.drawImage, calls.clip)
})

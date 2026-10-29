import assert from 'node:assert/strict'
import { performance } from 'node:perf_hooks'
import { splitEyeSheetPixels } from '../../src/renderer/src/features/fabricator/face/splitEyeSheetPixels.ts'

const width = 2400
const height = 2400
const pixelCount = width * height
const runs = 3

function drawRect(pixels, { x1, x2, y1, y2, color }) {
  for (let y = y1; y <= y2; y += 1) {
    let offset = (y * width + x1) * 4
    for (let x = x1; x <= x2; x += 1, offset += 4) pixels.set(color, offset)
  }
}

function makeSheet() {
  const pixels = new Uint8ClampedArray(pixelCount * 4)
  for (let offset = 0; offset < pixels.length; offset += 4) pixels.set([0, 255, 0, 255], offset)
  drawRect(pixels, { x1: 300, x2: 2100, y1: 200, y2: 600, color: [210, 50, 50, 255] })
  drawRect(pixels, { x1: 700, x2: 1700, y1: 900, y2: 1250, color: [50, 70, 220, 255] })
  drawRect(pixels, { x1: 150, x2: 2250, y1: 1550, y2: 2100, color: [190, 40, 190, 255] })
  return pixels
}

const durations = []
let outputPixels = 0
for (let run = 0; run < runs; run += 1) {
  const pixels = makeSheet()
  const startedAt = performance.now()
  const pieces = splitEyeSheetPixels(pixels, width, height)
  durations.push(performance.now() - startedAt)
  assert.equal(pieces.length, 3)
  outputPixels = pieces.reduce((total, piece) => total + piece.width * piece.height, 0)
}

durations.sort((a, b) => a - b)
const oldFixedQueueBytes = pixelCount * Int32Array.BYTES_PER_ELEMENT
const adaptiveQueueInitialBytes = Math.min(pixelCount, 64 * 1024) * Int32Array.BYTES_PER_ELEMENT
console.log(JSON.stringify({
  benchmark: 'eye-sheet-pixel-processing',
  dimensions: `${width}x${height}`,
  pixels: pixelCount,
  runs,
  medianPixelProcessingMs: Number(durations[Math.floor(durations.length / 2)].toFixed(2)),
  outputPixels,
  oldFixedQueueMiB: Number((oldFixedQueueBytes / 1024 / 1024).toFixed(2)),
  adaptiveQueueInitialMiB: Number((adaptiveQueueInitialBytes / 1024 / 1024).toFixed(2)),
  initialQueueAllocationReductionPercent: Number(((1 - adaptiveQueueInitialBytes / oldFixedQueueBytes) * 100).toFixed(2)),
  note: 'Synthetic pixel path only; excludes image decode, PNG encoding, worker scheduling and Chromium heap.'
}, null, 2))

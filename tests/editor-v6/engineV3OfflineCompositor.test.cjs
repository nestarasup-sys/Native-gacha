'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const sharp = require('sharp')
const { renderOfflineFrame, validateFramePlan } = require('../../scripts/editor-v6/engine-v3/offlineCompositor.cjs')

const W = 8, H = 8
const asset = (id, dataUrl) => ({ id, dataUrl })
const png = async (raw, width, height) => 'data:image/png;base64,' + (await sharp(Buffer.from(raw), { raw: { width, height, channels: 4 } }).png().toBuffer()).toString('base64')
const plan = (commands = [], assets = [], backgroundColor = '#00000000') => ({ width: W, height: H, logicalHeight: 1080, backgroundColor, assets, commands })
const image = (assetId, extra = {}) => ({ kind: 'image', assetId, x: 960, y: 540, width: 1920, height: 1080, rotation: 0, opacity: 1, ...extra })
const pixel = (rgba, x, y) => [...rgba.subarray((y * W + x) * 4, (y * W + x) * 4 + 4)]

test('renders background with straight-alpha RGBA (no Chromium)', async () => {
  const result = await renderOfflineFrame(plan([], [], '#124578'))
  assert.equal(result.length, W * H * 4)
  assert.deepEqual(pixel(result, 3, 3), [18, 69, 120, 255])
})

test('places a solid rectangle using 1920x1080 logical coordinates', async () => {
  const result = await renderOfflineFrame(plan([{ kind: 'solid', x: 480, y: 270, width: 960, height: 540, color: '#ff0000' }]))
  assert.deepEqual(pixel(result, 2, 2), [255, 0, 0, 255])
  assert.deepEqual(pixel(result, 0, 0), [0, 0, 0, 0])
})

test('composites source-over alpha with a PNG asset', async () => {
  const red = await png([255, 0, 0, 128], 1, 1)
  const rgba = await renderOfflineFrame(plan([image('red')], [asset('red', red)], '#0000ff'))
  const middle = pixel(rgba, 4, 4)
  assert.equal(middle[3], 255)
  assert.ok(Math.abs(middle[0] - 128) <= 1 && Math.abs(middle[2] - 127) <= 1, `Unexpected alpha composite ${middle}`)
})

test('samples a source atlas crop rather than the entire sheet', async () => {
  const atlas = await png([255, 0, 0, 255, 0, 255, 0, 255], 2, 1)
  const rgba = await renderOfflineFrame(plan([image('atlas', { source: { x: 1, y: 0, width: 1, height: 1 } })], [asset('atlas', atlas)]))
  assert.deepEqual(pixel(rgba, 3, 3), [0, 255, 0, 255])
})

test('flips the asset horizontally', async () => {
  const atlas = await png([255, 0, 0, 255, 0, 255, 0, 255], 2, 1)
  const rgba = await renderOfflineFrame(plan([image('atlas', { flipX: true })], [asset('atlas', atlas)]))
  const left = pixel(rgba, 1, 3), right = pixel(rgba, 6, 3)
  assert.ok(left[1] > left[0] && right[0] > right[1], `flip mismatch ${left} / ${right}`)
})

test('uses contain for a non-character image', async () => {
  const atlas = await png([0, 255, 0, 255, 0, 255, 0, 255], 1, 2)
  const rgba = await renderOfflineFrame(plan([image('atlas', { contain: true })], [asset('atlas', atlas)]))
  assert.deepEqual(pixel(rgba, 0, 4), [0, 0, 0, 0])
  assert.deepEqual(pixel(rgba, 4, 4), [0, 255, 0, 255])
})

test('cutout removes an alpha region for face patch replacement', async () => {
  const base = await png([255, 0, 0, 255], 1, 1)
  const rgba = await renderOfflineFrame(plan([image('base', { cutout: { x: .25, y: .25, width: .5, height: .5 } })], [asset('base', base)]))
  assert.deepEqual(pixel(rgba, 0, 0), [255, 0, 0, 255])
  assert.deepEqual(pixel(rgba, 4, 4), [0, 0, 0, 0])
})

test('rotation keeps image centred while exchanging portrait axes', async () => {
  const base = await png([0, 255, 0, 255], 1, 1)
  const rgba = await renderOfflineFrame(plan([image('base', { rotation: 90, width: 480, height: 1080 })], [asset('base', base)]))
  assert.deepEqual(pixel(rgba, 2, 4), [0, 255, 0, 255])
  assert.deepEqual(pixel(rgba, 4, 0), [0, 0, 0, 0])
})

test('clips images outside canvas and preserves command order', async () => {
  const red = await png([255, 0, 0, 255], 1, 1)
  const green = await png([0, 255, 0, 255], 1, 1)
  const rgba = await renderOfflineFrame(plan([
    image('red', { x: 0, y: 0, width: 1920, height: 1080 }),
    image('green', { x: 0, y: 0, width: 960, height: 540 })
  ], [asset('red', red), asset('green', green)]))
  assert.deepEqual(pixel(rgba, 0, 0), [0, 255, 0, 255])
  assert.deepEqual(pixel(rgba, 3, 3), [255, 0, 0, 255])
  assert.deepEqual(pixel(rgba, 7, 7), [0, 0, 0, 0])
})

test('rejects unsafe, missing and out-of-range inputs', async () => {
  assert.throws(() => validateFramePlan(plan([], [asset('bad', 'data:text/html;base64,PGh0bWw+')])) , /Asset offline/)
  assert.throws(() => validateFramePlan({ ...plan(), width: 50000 }), /Dimensões/)
  assert.throws(() => validateFramePlan(plan([image('missing')])), /Comando de imagem inválido/)
  const red = await png([255, 0, 0, 255], 1, 1)
  const invalid = plan([image('red', { source: { x: 2, y: 0, width: 1, height: 1 } })], [asset('red', red)])
  await assert.rejects(() => renderOfflineFrame(invalid), /Recorte de atlas/)
})

test('repeated renders with identical input return identical buffers', async () => {
  const red = await png([255, 0, 0, 128], 1, 1)
  const scene = plan([image('red')], [asset('red', red)], '#0000ff')
  const first = await renderOfflineFrame(scene)
  const second = await renderOfflineFrame(scene)
  assert.equal(first.equals(second), true)
})

test('renders stacked V6 background/foreground command coordinates', async () => {
  const red = await png([255, 0, 0, 255], 1, 1)
  const scene = { ...plan([
    { kind: 'solid', x: 0, y: 0, width: 1920, height: 1080, color: '#0000ff' },
    image('red', { y: 1620 })
  ], [asset('red', red)]), width: 8, height: 16, logicalHeight: 2160 }
  const rgba = await renderOfflineFrame(scene)
  assert.deepEqual([...rgba.subarray((2 * 8 + 4) * 4, (2 * 8 + 4) * 4 + 4)], [0, 0, 255, 255])
  assert.deepEqual([...rgba.subarray((12 * 8 + 4) * 4, (12 * 8 + 4) * 4 + 4)], [255, 0, 0, 255])
})

test('applies per-image opacity without hiding the destination', async () => {
  const red = await png([255, 0, 0, 255], 1, 1)
  const rgba = await renderOfflineFrame(plan([image('red', { opacity: .25 })], [asset('red', red)], '#0000ff'))
  const middle = pixel(rgba, 4, 4)
  assert.equal(middle[3], 255)
  assert.ok(Math.abs(middle[0] - 64) <= 1 && Math.abs(middle[2] - 191) <= 1, `opacity mismatch ${middle}`)
})

test('rejects duplicate IDs and unsupported oversize transformed images', async () => {
  const red = await png([255, 0, 0, 255], 1, 1)
  assert.throws(() => validateFramePlan(plan([], [asset('red', red), asset('red', red)])), /repetido/)
  const oversized = plan([image('red', { width: 1920 * 1000 })], [asset('red', red)])
  await assert.rejects(() => renderOfflineFrame(oversized), /excede o limite/)
})

test('smoke harness parses bounds and refuses unexpected flags', () => {
  const { parseArgs } = require('../../scripts/editor-v6/engine-v3/smokeExport.cjs')
  assert.deepEqual(parseArgs(['--frames=2', '--width=320', '--height=180']), { frames: 2, width: 320, height: 180, fps: 30 })
  assert.throws(() => parseArgs(['--width=9999']))
  assert.throws(() => parseArgs(['--frames=301']))
  assert.throws(() => parseArgs(['--output=/home/me/document.mp4']))
  assert.throws(() => parseArgs(['--fps=25']))
})

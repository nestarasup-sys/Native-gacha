import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import sharp from 'sharp'
const require = createRequire(import.meta.url)
const { createCompleteCharacterFixture } = require('../scripts/fabricator/complete-character-fixture.cjs')

// Real PNG fixture with alpha, wardrobe layering, eyebrows/eyes and hair.
// Tests the independent static lower/face/upper compositing law rather than
// mocking drawImage. Browser Canvas golden parity is still a separate gate.
const width = 256, height = 384
const blank = () => sharp({ create: {
  width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 },
}})
const composite = async (layers) =>
  blank().composite(layers.map(({ input, left, top }) => ({ input, left, top }))).png().toBuffer()
const raw = async (png) => sharp(png).ensureAlpha().raw().toBuffer()

test('real PNG layers maintain wardrobe/eye/front-hair order when split into reusable static groups', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'gacha-three-group-pixel-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const fixture = await createCompleteCharacterFixture(dir)
  const load = async (dir, name, left, top) => ({ input: await readFile(join(dir, name)), left, top })
  const behind = [
    await load(join(fixture.model, 'parts'), 'body.png', 74, 118),
    await load(join(fixture.outfit, 'parts'), 'coat.png', 74, 130),
    await load(join(fixture.hair, 'images'), 'back.png', 88, 12),
    await load(join(fixture.model, 'parts'), 'head.png', 90, 20),
  ]
  const eyebrows = await load(fixture.eyebrow, 'asset.png', 100, 56)
  const originalEye = await load(fixture.eye, 'asset.png', 104, 65)
  const upper = [await load(join(fixture.hair, 'images'), 'front.png', 90, 18)]
  const staticBehind = await composite(behind)
  const staticUpper = await composite(upper)
  const firstBehindPixels = await raw(staticBehind)
  let differentExpressions = 0
  for (const eye of [
    originalEye,
    { ...originalEye, input: await sharp(originalEye.input).modulate({ brightness: 0.7 }).png().toBuffer() },
  ]) {
    const face = [eye, eyebrows]
    const oldWhole = await composite([...behind, ...face, ...upper])
    const facialGroup = await composite(face)
    const threeGroups = await composite([
      { input: staticBehind, left: 0, top: 0 },
      { input: facialGroup, left: 0, top: 0 },
      { input: staticUpper, left: 0, top: 0 },
    ])
    const oldPixels = await raw(oldWhole)
    const nextPixels = await raw(threeGroups)
    assert.equal(oldPixels.length, width * height * 4)
    assert.equal(nextPixels.length, oldPixels.length)
    let changed = 0, maxDelta = 0
    for (let index = 0; index < oldPixels.length; index++) {
      const delta = Math.abs(oldPixels[index] - nextPixels[index])
      if (delta) changed++
      if (delta > maxDelta) maxDelta = delta
    }
    // Two 8-bit alpha-compositing stages may round at most a few LSBs.
    assert.ok(maxDelta <= 3,
      'separating layers must not visibly change alpha/color; max delta=' + maxDelta + ', changed=' + changed)
    const pixel = (buffer, x, y) => [...buffer.subarray((y * width + x) * 4, (y * width + x) * 4 + 4)]
    for (const [x,y] of [[80, 150], [102, 59], [115, 40], [120, 68], [0, 0]]) {
      const a = pixel(oldPixels,x,y), b = pixel(nextPixels,x,y)
      assert.ok(a.every((v, i) => Math.abs(v - b[i]) <= 3), 'layer ordering at ('+x+','+y+')')
    }
    assert.deepEqual(await raw(staticBehind), firstBehindPixels,
      'static Gacha body/wardrobe cannot be modified by a face-only frame')
    differentExpressions++
  }
  assert.equal(differentExpressions, 2)
})

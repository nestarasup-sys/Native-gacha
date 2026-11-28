import assert from 'node:assert/strict'
import path from 'node:path'
import sharp from 'sharp'
import { createEditorV6NativeRendererProcess } from '../../electron/domains/editorV6/nativeRendererProcess.ts'

const executable = path.resolve('out/native/editor-v6-renderer/Release/editor-v6-native-renderer.exe')
const process = createEditorV6NativeRendererProcess(executable)
const signal = new AbortController().signal
const encode = async (rgba, width, height) => `data:image/png;base64,${(await sharp(Buffer.from(rgba), { raw: { width, height, channels: 4 } }).png().toBuffer()).toString('base64')}`
const pixel = (buffer, width, x, y) => {
  const offset = (y * width + x) * 4
  return [...buffer.subarray(offset, offset + 4)]
}

try {
  const red = await encode([255, 0, 0, 255], 1, 1)
  await assert.rejects(
    process.render({ width: 4, height: 2, logicalHeight: 1080, backgroundColor: 'transparent', assets: [{ id: 'missing-lifetime', dataUrl: red }], commands: [{ kind: 'image', assetId: 'missing-lifetime', x: 960, y: 540, width: 1920, height: 1080, rotation: 0, opacity: 1 }] }, signal),
    /não informou o ciclo de vida/
  )
  const fullResult = await process.render({ width: 4, height: 2, logicalHeight: 1080, backgroundColor: '#0000ff', assets: [{ id: 'red', dataUrl: red, lifetime: 'process' }], commands: [{ kind: 'image', assetId: 'red', x: 960, y: 540, width: 1920, height: 1080, rotation: 0, opacity: 1 }] }, signal)
  const full = fullResult.bitmap
  assert.deepEqual(pixel(full, 4, 0, 0), [0, 0, 255, 255], 'opaque raster must be returned in BGRA order')
  assert.equal(full.length, 4 * 2 * 4, 'frame byte count must match target dimensions')

  const atlas = await encode([255, 0, 0, 255, 0, 255, 0, 255], 2, 1)
  const cropped = (await process.render({ width: 4, height: 2, logicalHeight: 1080, backgroundColor: 'transparent', assets: [{ id: 'atlas', dataUrl: atlas, lifetime: 'process' }], commands: [{ kind: 'image', assetId: 'atlas', x: 960, y: 540, width: 1920, height: 1080, rotation: 0, opacity: 1, source: { x: 1, y: 0, width: 1, height: 1 } }] }, signal)).bitmap
  assert.deepEqual(pixel(cropped, 4, 2, 1), [0, 255, 0, 255], 'atlas crop must select the requested source pixel')

  const halfRed = await encode([255, 0, 0, 128], 1, 1)
  const alpha = (await process.render({ width: 4, height: 2, logicalHeight: 1080, backgroundColor: '#0000ff', assets: [{ id: 'half-red', dataUrl: halfRed, lifetime: 'process' }], commands: [{ kind: 'image', assetId: 'half-red', x: 960, y: 540, width: 1920, height: 1080, rotation: 0, opacity: 1 }] }, signal)).bitmap
  const blended = pixel(alpha, 4, 1, 1)
  assert.ok(Math.abs(blended[2] - 128) <= 2 && Math.abs(blended[0] - 127) <= 2 && blended[3] === 255, `alpha-over must preserve premultiplied transparency: ${blended}`)

  const stacked = (await process.render({ width: 4, height: 4, logicalHeight: 2160, backgroundColor: 'transparent', assets: [{ id: 'red', dataUrl: red, lifetime: 'process' }], commands: [
    { kind: 'solid', x: 0, y: 0, width: 1920, height: 1080, color: '#0000ff' },
    { kind: 'image', assetId: 'red', x: 960, y: 1620, width: 1920, height: 1080, rotation: 0, opacity: 1 }
  ] }, signal)).bitmap
  assert.deepEqual(pixel(stacked, 4, 1, 0), [255, 0, 0, 255], 'stacked top layer must retain the background color')
  assert.deepEqual(pixel(stacked, 4, 1, 3), [0, 0, 255, 255], 'stacked lower layer must keep foreground alpha composition')
  assert.ok(Number.isFinite(fullResult.processMilliseconds) && fullResult.processMilliseconds >= 0, 'native process timing should be included')

  const rasterWidth = 2048, rasterHeight = 1080
  const rasterPixels = Buffer.alloc(rasterWidth * rasterHeight * 4)
  for (let offset = 0; offset < rasterPixels.length; offset += 4) rasterPixels.set([40, 80, 160, 255], offset)
  const frameHair = await encode(rasterPixels, rasterWidth, rasterHeight)
  const frameScopedDecodedBytes = rasterWidth * rasterHeight * 4 * 64
  assert.ok(frameScopedDecodedBytes > 512 * 1024 * 1024, 'the frame fixture must exceed the former 512 MiB process cache limit')
  for (let frame = 0; frame < 64; frame += 1) {
    const frameAssetId = `hair-frame-${frame}`
    const rendered = await process.render({ width: 4, height: 2, logicalHeight: 1080, backgroundColor: 'transparent', assets: [{ id: frameAssetId, dataUrl: frameHair, lifetime: 'frame' }], commands: [
      { kind: 'image', assetId: frameAssetId, x: 960, y: 540, width: 1920, height: 1080, rotation: 0, opacity: 1 }
    ] }, signal)
    assert.deepEqual(pixel(rendered.bitmap, 4, 1, 1), [160, 80, 40, 255], `temporary hair asset for frame ${frame} must render before being released`)
  }

  const frameRed = await encode([255, 0, 0, 255], 1, 1)
  const frameGreen = await encode([0, 255, 0, 255], 1, 1)
  const dynamicId = 'hair-current-frame'
  const dynamicCommand = [{ kind: 'image', assetId: dynamicId, x: 960, y: 540, width: 1920, height: 1080, rotation: 0, opacity: 1 }]
  const dynamicRed = await process.render({ width: 4, height: 2, logicalHeight: 1080, backgroundColor: 'transparent', assets: [{ id: dynamicId, dataUrl: frameRed, lifetime: 'frame' }], commands: dynamicCommand }, signal)
  const dynamicGreen = await process.render({ width: 4, height: 2, logicalHeight: 1080, backgroundColor: 'transparent', assets: [{ id: dynamicId, dataUrl: frameGreen, lifetime: 'frame' }], commands: dynamicCommand }, signal)
  assert.deepEqual(pixel(dynamicRed.bitmap, 4, 1, 1), [0, 0, 255, 255], 'first version of a reused frame-scoped asset must render')
  assert.deepEqual(pixel(dynamicGreen.bitmap, 4, 1, 1), [0, 255, 0, 255], 'frame-scoped assets must refresh even when the ID is reused')

  console.log(JSON.stringify({ passed: true, checks: 75, executable, firstProcessMs: fullResult.processMilliseconds, frameScopedAssets: 66, frameScopedDecodedMiB: frameScopedDecodedBytes / (1024 * 1024), frames: [full.length, cropped.length, alpha.length, stacked.length] }, null, 2))
} finally {
  await process.close()
}

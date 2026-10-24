import * as PIXI from 'pixi.js'
import { PixiGachaPoseRig, orderedVisiblePoseParts, type GachaPixiPort } from '../../src/renderer/src/features/videoStudio/pixiGachaPoseRig'
import { mixPoseArtwork } from '../../src/shared/videoCharacterInterpolation'
import { compareGachaPixels } from '../../src/renderer/src/features/videoStudio/pixiGachaParity'

// The benchmark runs inside an Electron window with the *same bundled Pixi*
// code used by production (not file:// ES module imports across origins).
// All artwork is synthetic. Nothing is loaded from a user project.
type Report = Record<string, unknown>
declare global { interface Window { __pixiRigBenchmark?: Report } }
window.addEventListener('error', event => {
  window.__pixiRigBenchmark = { ok: false, error: event.message }
})
void (async () => {
  const width = 360, height = 320, frames = 180
  function png(color: string): string {
    const c = document.createElement('canvas')
    c.width = 32; c.height = 32
    const cx = c.getContext('2d')!
    cx.fillStyle = color; cx.fillRect(0, 0, 32, 32)
    cx.fillStyle = '#ffffff'; cx.fillRect(6, 8, 9, 8)
    return c.toDataURL('image/png')
  }
  const urls = [png('#ed5599'), png('#297bdf'), png('#55bd98')]
  const part = (id: string, x: number, y: number, w: number, h: number, angle: number, url: string) =>
    ({ id, x, y, width: w, height: h, rotation: angle, dataUrl: url })
  const from = { width, height, parts: [
    part('body', 110, 80, 110, 170, 0, urls[0]),
    part('arm', 210, 110, 48, 145, -70, urls[1]),
    part('head', 132, 25, 75, 80, 0, urls[2]),
  ], layerOrder: ['body', 'arm', 'head'] }
  const to = { ...from, parts: [
    part('body', 110, 80, 110, 170, 0, urls[0]),
    part('arm', 130, 25, 48, 145, 20, urls[1]),
    part('head', 132, 25, 75, 80, 12, urls[2]),
  ] }
  const images = new Map(await Promise.all(urls.map(async url => {
    const img = new Image(); img.src = url; await img.decode()
    return [url, img] as const
  })))
  await Promise.all(urls.map(url => PIXI.Assets.load(url)))
  const canvas = document.createElement('canvas')
  canvas.width = width; canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  function paintReference(progress: number): void {
    const mixed = mixPoseArtwork(from, to, progress)
    ctx.clearRect(0, 0, width, height)
    for (const item of orderedVisiblePoseParts(mixed)) {
      ctx.save()
      ctx.translate(item.x + item.width / 2, item.y + item.height / 2)
      ctx.rotate(item.rotation * Math.PI / 180)
      ctx.drawImage(images.get(item.dataUrl)!, -item.width / 2, -item.height / 2, item.width, item.height)
      ctx.restore()
    }
  }
  const app = new PIXI.Application()
  await app.init({ width, height, preference: 'webgl', preferWebGLVersion: 2,
    autoStart: false, backgroundAlpha: 0, resolution: 1, antialias: false,
    preserveDrawingBuffer: true })
  const rig = new PixiGachaPoseRig(PIXI as unknown as GachaPixiPort)
  app.stage.addChild(rig.stage as unknown as PIXI.Container)
  const samples = []
  for (const progress of [0, .25, .5, .75, 1]) {
    rig.setInterpolatedPose(from, to, progress)
    app.renderer.render(app.stage)
    paintReference(progress)
    const output = app.renderer.extract.pixels(app.stage)
    const gpu = output.pixels
    const cpu = ctx.getImageData(0, 0, width, height).data
    const parity = compareGachaPixels(cpu, gpu, width, height)
    samples.push({ progress, ...parity, cpuOpaque: cpu.filter((_, i) => i % 4 === 3 && cpu[i] > 0).length,
      gpuOpaque: gpu.filter((_, i) => i % 4 === 3 && gpu[i] > 0).length })
  }
  const canvasStarted = performance.now()
  for (let i = 0; i < frames; i++) paintReference((i % 15) / 15)
  const canvasMs = performance.now() - canvasStarted
  const pixiStarted = performance.now()
  for (let i = 0; i < frames; i++) {
    rig.setInterpolatedPose(from, to, (i % 15) / 15)
    app.renderer.render(app.stage)
  }
  const pixiMs = performance.now() - pixiStarted
  const stats = rig.stats()
  rig.dispose()
  app.destroy(true, { children: true })
  window.__pixiRigBenchmark = {
    ok: true, backend: 'webgl2', frames, width, height, samples, canvasMs, pixiMs, stats,
    // A speedup is merely an observation on these synthetic sprites. Real
    // Gacha requires face/wardrobe/hair parity and an honest Windows profile.
    relativeSpeedup: canvasMs / pixiMs,
  }
})().catch((error: unknown) => {
  window.__pixiRigBenchmark = { ok: false, error: error instanceof Error ? error.stack ?? error.message : String(error) }
})

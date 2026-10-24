import * as PIXI from 'pixi.js'
import { PixiGachaPoseRig, orderedVisiblePoseParts, type GachaPixiPort } from '../../src/renderer/src/features/videoStudio/pixiGachaPoseRig'
import { mixPoseArtwork } from '../../src/shared/videoCharacterInterpolation'
import { compareGachaPixels } from '../../src/renderer/src/features/videoStudio/pixiGachaParity'
import { PixiGachaLayerStack, type PixiLayerPort } from '../../src/renderer/src/features/videoStudio/pixiGachaLayerStack'

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
  app.stage.removeChild(rig.stage as unknown as PIXI.Container)
  rig.dispose()

  // Second proof uses a real three-group Gacha-style composition: body with
  // coat and rear hair / animated face pupils and mouth / front hair. Its
  // transparent overlap exercises occlusion and mutable GPU texture upload.
  const newLayer = (): HTMLCanvasElement => {
    const layer = document.createElement('canvas')
    layer.width = width; layer.height = height
    return layer
  }
  const behind = newLayer(), dynamicFace = newLayer(), inFront = newLayer()
  const body = behind.getContext('2d')!
  body.fillStyle = '#f0bd9a'
  body.fillRect(95, 42, 168, 226)
  body.fillStyle = '#526cc1' // clothes beneath the face
  body.fillRect(106, 162, 147, 98)
  body.fillStyle = '#6c436a'
  body.fillRect(90, 52, 27, 152) // back hair
  const front = inFront.getContext('2d')!
  front.fillStyle = 'rgba(115,58,103,0.87)'
  front.fillRect(107, 35, 165, 31)
  front.fillRect(237, 45, 29, 127)
  const facePaint = dynamicFace.getContext('2d')!
  const full = newLayer()
  const whole = full.getContext('2d', { willReadFrequently: true })!
  const paintFace = (phase: number) => {
    facePaint.clearRect(0, 0, width, height)
    facePaint.fillStyle = '#182142'
    facePaint.fillRect(139, 103, 25, 17)
    facePaint.fillRect(196, 103, 25, 17)
    facePaint.fillStyle = '#ffffff'
    facePaint.fillRect(146 + phase % 4, 106, 9, 9)
    facePaint.fillRect(204 + phase % 4, 106, 9, 9)
    facePaint.fillStyle = '#9d4660'
    facePaint.fillRect(166, 146, 33, 3 + phase % 8)
    facePaint.fillStyle = 'rgba(240,88,133,0.5)'
    facePaint.fillRect(129, 128, 24, 10)
    facePaint.fillRect(207, 128, 24, 10)
  }
  const stack = new PixiGachaLayerStack(PIXI as unknown as PixiLayerPort)
  app.stage.addChild(stack.stage as unknown as PIXI.Container)
  const layeredSamples = []
  for (const phase of [0, 2, 4, 6, 8]) {
    paintFace(phase)
    stack.setLayers({
      behindFace: behind, face: dynamicFace, inFrontOfFace: inFront,
      width, height, outputWidth: width, outputHeight: height,
      shapeScaleX: 1, shapeScaleY: 1,
    })
    app.renderer.render(app.stage)
    whole.clearRect(0, 0, width, height)
    whole.drawImage(behind, 0, 0)
    whole.drawImage(dynamicFace, 0, 0)
    whole.drawImage(inFront, 0, 0)
    const cpu = whole.getImageData(0, 0, width, height).data
    const gpu = app.renderer.extract.pixels(app.stage).pixels
    layeredSamples.push({
      phase,
      ...compareGachaPixels(cpu, gpu, width, height),
      cpuOpaque: cpu.filter((_, index) => index % 4 === 3 && cpu[index] > 0).length,
      gpuOpaque: gpu.filter((_, index) => index % 4 === 3 && gpu[index] > 0).length,
    })
  }
  const layerCpuStart = performance.now()
  for (let i = 0; i < frames; i++) {
    paintFace(i)
    whole.clearRect(0, 0, width, height)
    whole.drawImage(behind, 0, 0)
    whole.drawImage(dynamicFace, 0, 0)
    whole.drawImage(inFront, 0, 0)
  }
  const layerCanvasMs = performance.now() - layerCpuStart
  const layerGpuStart = performance.now()
  for (let i = 0; i < frames; i++) {
    paintFace(i)
    stack.setLayers({
      behindFace: behind, face: dynamicFace, inFrontOfFace: inFront,
      width, height, outputWidth: width, outputHeight: height,
      shapeScaleX: 1, shapeScaleY: 1,
    })
    app.renderer.render(app.stage)
  }
  const layerPixiMs = performance.now() - layerGpuStart
  const layered = {
    samples: layeredSamples, canvasMs: layerCanvasMs,
    pixiMs: layerPixiMs, stats: stack.metrics(),
  }
  app.stage.removeChild(stack.stage as unknown as PIXI.Container)
  stack.dispose()
  app.destroy(true, { children: true })
  window.__pixiRigBenchmark = {
    ok: true, backend: 'webgl2', frames, width, height, samples, canvasMs, pixiMs, stats, layered,
    // A speedup is merely an observation on these synthetic sprites. Real
    // Gacha requires face/wardrobe/hair parity and an honest Windows profile.
    relativeSpeedup: canvasMs / pixiMs,
  }
})().catch((error: unknown) => {
  window.__pixiRigBenchmark = { ok: false, error: error instanceof Error ? error.stack ?? error.message : String(error) }
})

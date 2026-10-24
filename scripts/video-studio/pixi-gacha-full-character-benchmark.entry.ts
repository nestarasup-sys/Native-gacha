import * as PIXI from 'pixi.js'
import { prepareSavedCharacterRenderer } from '../../src/renderer/src/characters/characterRenderer'
import { createVideoCharacterRenderSnapshotProvider, type VideoCharacterRenderAssetSnapshot } from '../../src/shared/videoCharacterRenderAssets'
import type { CustomizerCharacter } from '../../src/shared/customizer'
import { PixiGachaLayerStack, type PixiLayerPort } from '../../src/renderer/src/features/videoStudio/pixiGachaLayerStack'
import { compareGachaPixels } from '../../src/renderer/src/features/videoStudio/pixiGachaParity'
import { PixiGachaVisualGate } from '../../src/renderer/src/features/videoStudio/pixiGachaVisualGate'

declare global {
  interface Window {
    __fullGachaFixture?: { character: CustomizerCharacter; assets: VideoCharacterRenderAssetSnapshot }
    __fullGachaGpuReport?: Record<string, unknown>
  }
}

/**
 * Real canonical Gacha preview -> full GPU compositing A/B.
 * All assets are disposable synthetic PNGs produced in the Electron host.
 * No user's Fabricador or project directory is used.
 */
void (async () => {
  const fixture = window.__fullGachaFixture
  if (!fixture) throw new Error('Fixture Gacha ausente.')
  const provider = createVideoCharacterRenderSnapshotProvider(fixture.assets)
  const character = fixture.character
  const slot = character.customization.modelSlot!
  const [source, pose1, pose2] = await Promise.all([
    provider.loadFabricatorSlot(slot),
    provider.loadFabricatorPose(slot, 1),
    provider.loadFabricatorPose(slot, 2),
  ])
  if (!source || !pose1 || !pose2) throw new Error('Pose/modelo Gacha sintético incompleto.')
  const appearances = [
    { ...character.customization.faceAppearance!, mouthOpen: false },
    { ...character.customization.faceAppearance!, mouthOpen: true },
  ]
  const app = new PIXI.Application()
  const samples = []
  let canvasMs = 0, gpuMs = 0
  let texturesPrepared = 0, frames = 0
  const rendererStats = []
  let previousPrepared: Awaited<ReturnType<typeof prepareSavedCharacterRenderer>> | null = null
  let surfaceWidth = 0, surfaceHeight = 0
  try {
    for (const [pose, poseNumber] of [[pose1, 1], [pose2, 2]] as const) {
      // A fresh body/wardrobe/hair rig is prepared at each authored pose, but
      // eyes, pupils, mouth and effects are drawn through the exact face painter.
      const prepared = await prepareSavedCharacterRenderer(character,
        { artwork: pose, source, assetProvider: provider })
      if (!previousPrepared) {
        surfaceWidth = prepared.width
        surfaceHeight = prepared.height
        await app.init({
          width: prepared.width, height: prepared.height,
          preference: 'webgl', preferWebGLVersion: 2, backgroundAlpha: 0,
          autoStart: false, sharedTicker: false, resolution: 1,
          antialias: false, preserveDrawingBuffer: true,
        })
      }
      if (prepared.width !== surfaceWidth || prepared.height !== surfaceHeight) {
        throw new Error('A fixture variou dimensões entre poses; use a mesma resolução.')
      }
      previousPrepared = prepared
      const stack = new PixiGachaLayerStack(PIXI as unknown as PixiLayerPort)
      app.stage.addChild(stack.stage as unknown as PIXI.Container)
      const gate = new PixiGachaVisualGate()
      for (const [modeIndex, mode] of ['idle', 'talk', 'blink', 'idle'] .entries()) {
        const appearance = appearances[modeIndex % 2]
        const transform = { 'expression-component:pupil-left': {
          x: modeIndex - 2, y: -1, width: 95, height: 105, rotation: 0,
        } }
        const cpuStart = performance.now()
        const layers = await prepared.renderLayersToCanvas(appearance, transform,
          undefined, mode as 'idle' | 'talk' | 'blink')
        canvasMs += performance.now() - cpuStart
        const gpuStart = performance.now()
        stack.setLayers(layers)
        app.renderer.render(app.stage)
        const rgba = app.renderer.extract.pixels(app.stage).pixels
        gpuMs += performance.now() - gpuStart
        // Build a canonical reference with exactly the same composition logic,
        // not a manually approximated drawing of eyes/hair.
        const actual = await prepared.renderToCanvas(appearance, transform,
          undefined, mode as 'idle' | 'talk' | 'blink')
        const reference = actual.canvas.getContext('2d', { willReadFrequently:true })!
          .getImageData(0, 0, actual.width, actual.height).data
        const parity = compareGachaPixels(reference,rgba,actual.width,actual.height)
        let gateAccepted = false
        try { gate.verify(layers,rgba); gateAccepted = true } catch { /* expected gate failure on drift */ }
        samples.push({ pose:poseNumber,mode,pixels:parity.pixels,
          changedRatio:parity.changedRatio,meanWorstChannelError:parity.meanWorstChannelError,
          p99WorstChannelError:parity.p99WorstChannelError,
          gateAccepted, canvasAlpha:reference.reduce((n,v,i)=>n+(i%4===3&&v>0?1:0),0),
          gpuAlpha:rgba.reduce((n,v,i)=>n+(i%4===3&&v>0?1:0),0) })
        frames++
      }
      rendererStats.push({pose:poseNumber,...stack.metrics(),gate:gate.snapshot()})
      app.stage.removeChild(stack.stage as unknown as PIXI.Container)
      stack.dispose()
      gate.dispose()
    }
  } finally {
    if (app.renderer) app.destroy(true,{children:true})
  }
  // Do not require GPU parity to be perfect yet: this is the experimental
  // measurement that determines *whether* we can turn the backend on.
  // A failed gate is a product decision, not a failure of the oracle itself.
  const mismatch = samples.filter(x=>!x.gateAccepted).length
  window.__fullGachaGpuReport = {
    ok:true,backend:'webgl2',fixture:'Gacha actual characterRenderer',
    poses:2,faceModes:['idle','talk','blink'],frames,
    samples,rendererStats,measuredCanvasMs:canvasMs,measuredGpuMs:gpuMs,
    rejectedFrames:mismatch,eligibleForProduction:mismatch===0,
  }
})().catch((error:unknown)=>{
  window.__fullGachaGpuReport = {ok:false,error:error instanceof Error?error.stack??error.message:String(error)}
})

import type { PreparedGachaLayerFrame } from '../../characters/characterRenderer'
import { compareGachaPixels, type GachaPixelParity } from './pixiGachaParity'

/** Conservative defaults: parity must be proven before a GPU canvas is shown. */
export type PixiGachaGateOptions = Readonly<{
  maxChangedRatio: number
  maxMeanError: number
  maxP99Error: number
  channelTolerance: number
  initialSamples: number
  recheckEvery: number
  maxReadbackPixels: number
}>
export const GACHA_GPU_PARITY_DEFAULTS: PixiGachaGateOptions = Object.freeze({
  maxChangedRatio: .003,
  maxMeanError: 1.25,
  maxP99Error: 5,
  channelTolerance: 10,
  initialSamples: 3,
  recheckEvery: 120,
  maxReadbackPixels: 2_000_000,
})
export type GachaGpuGateSnapshot = Readonly<{
  checkedFrames: number
  acceptedFrames: number
  rejected: boolean
  lastParity: GachaPixelParity | null
  reason: string | null
}>

/**
 * Visual admission gate for the experimental full-character GPU surface.
 * Compare against the SAME authored body/face/hair Canvas buffers in the
 * production layer order. Readback runs only during warm-up and occasional
 * rechecks; the hot path never calls getImageData/toDataURL.
 */
export class PixiGachaVisualGate {
  private frames = 0
  private checked = 0
  private accepted = 0
  private reason: string | null = null
  private last: GachaPixelParity | null = null
  private reference: HTMLCanvasElement | null = null
  private context: CanvasRenderingContext2D | null = null
  private lastStaticBehind: HTMLCanvasElement | null = null
  private lastStaticAbove: HTMLCanvasElement | null = null

  constructor(private readonly options: PixiGachaGateOptions = GACHA_GPU_PARITY_DEFAULTS) {}

  shouldCheck(frame: PreparedGachaLayerFrame): boolean {
    if (this.reason) throw new Error(this.reason)
    const changed = frame.behindFace !== this.lastStaticBehind || frame.inFrontOfFace !== this.lastStaticAbove
    return changed || this.checked < this.options.initialSamples
      || this.frames % this.options.recheckEvery === 0
  }

  /**
   * Consume actual Pixi RGBA output from renderer.extract.pixels, not a
   * rescaled DOM screenshot. A mismatch permanently rejects this surface.
   */
  verify(frame: PreparedGachaLayerFrame, actual: Uint8Array | Uint8ClampedArray): GachaPixelParity {
    if (this.reason) throw new Error(this.reason)
    const pixelCount = frame.outputWidth * frame.outputHeight
    if (!Number.isSafeInteger(pixelCount) || pixelCount <= 0 || pixelCount > this.options.maxReadbackPixels) {
      this.reason = 'Amostra GPU excede orçamento seguro de leitura de pixels.'
      throw new Error(this.reason)
    }
    if (!this.reference || this.reference.width !== frame.outputWidth || this.reference.height !== frame.outputHeight) {
      this.reference = document.createElement('canvas')
      this.reference.width = frame.outputWidth
      this.reference.height = frame.outputHeight
      this.context = this.reference.getContext('2d', { willReadFrequently: true })
      if (!this.context) {
        this.reason = 'Canvas de referência para a validação GPU indisponível.'
        throw new Error(this.reason)
      }
    }
    const ctx = this.context!
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, frame.outputWidth, frame.outputHeight)
    ctx.save()
    ctx.translate(frame.outputWidth / 2, frame.outputHeight / 2)
    ctx.scale(frame.shapeScaleX, frame.shapeScaleY)
    for (const layer of [frame.behindFace, frame.face, frame.inFrontOfFace]) {
      if (layer) ctx.drawImage(layer, -frame.width / 2, -frame.height / 2, frame.width, frame.height)
    }
    ctx.restore()
    const baseline = ctx.getImageData(0, 0, frame.outputWidth, frame.outputHeight).data
    const result = compareGachaPixels(baseline, actual,
      frame.outputWidth, frame.outputHeight, this.options.channelTolerance)
    this.last = result
    this.checked++
    this.frames++
    this.lastStaticBehind = frame.behindFace
    this.lastStaticAbove = frame.inFrontOfFace
    if (result.changedRatio > this.options.maxChangedRatio
      || result.meanWorstChannelError > this.options.maxMeanError
      || result.p99WorstChannelError > this.options.maxP99Error) {
      this.reason = 'A GPU alterou pixels do personagem Gacha; restaurando o Canvas original.'
      throw new Error(this.reason)
    }
    this.accepted++
    return result
  }

  /** Frame drawn without a parity readback: no CPU/GPU copy in hot path. */
  noteFastFrame(): void {
    if (this.reason) throw new Error(this.reason)
    this.frames++
  }

  snapshot(): GachaGpuGateSnapshot {
    return { checkedFrames: this.checked, acceptedFrames: this.accepted,
      rejected: Boolean(this.reason), lastParity: this.last, reason: this.reason }
  }

  dispose(): void {
    this.reference = null
    this.context = null
    this.lastStaticBehind = null
    this.lastStaticAbove = null
  }
}

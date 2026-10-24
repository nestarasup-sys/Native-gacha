import type { CustomizerCharacter } from '../../../../shared/customizer'
import type { VideoCharacterState } from '../../../../shared/studio'
import type { CharacterTransition } from './characterTransitions'
import { transitionSampleFrames } from './characterTransitions'
import { TransitionRenderer } from './transitionRenderer'

type CachedFrame = Readonly<{ state: VideoCharacterState; bytes: number }>
type Plan = Readonly<{
  kind: 'ahead' | 'paused'
  spans: readonly CharacterTransition[]
  characters: readonly CustomizerCharacter[]
  boundary: number | null
  anchorFrame: number
}>
export type PreviewTransitionMetrics = Readonly<{
  rendered: number
  cacheHits: number
  discarded: number
  renderMs: number
  lastRenderMs: number
  cachedBytes: number
  cachedFrames: number
  inFlight: number
}>
export type PreviewTransitionRenderer = Pick<TransitionRenderer, 'render' | 'dispose'> & Partial<Pick<TransitionRenderer, 'renderPreview'>>

/**
 * Session-local PNG compatibility path for the existing DOM stage.
 *
 * One renderer runs at a time: prepared canvases can be mutable. New seeks,
 * stopped playback and scene revisions abort obsolete queued work. Renderer
 * cancellation is cooperative at await checkpoints; a synchronous raster
 * already in progress needs a separate worker/process for preemption.
 *
 * Decoding PNG into a throwaway Image before <img> uses it was redundant:
 * this queue retains the encoded PNG and lets Chromium decode only on display.
 */
export class PreviewTransitionSession {
  private readonly cache = new Map<string, CachedFrame>()
  private readonly identities = new WeakMap<object, number>()
  private nextIdentity = 0
  private bytes = 0
  private queue: Promise<void> = Promise.resolve()
  private pending = new Map<string, Promise<void>>()
  private abort = new AbortController()
  private generation = 0
  private plan: Plan | null = null
  private disposed = false
  private playbackRequested = false
  private rendered = 0
  private cacheHits = 0
  private discarded = 0
  private renderMs = 0
  private lastRenderMs = 0

  constructor(readonly studioId: string, private readonly renderer: PreviewTransitionRenderer = new TransitionRenderer()) {}

  activate(): void { this.disposed = false }

  private identity(state: object): number {
    if (!this.identities.has(state)) this.identities.set(state, ++this.nextIdentity)
    return this.identities.get(state)!
  }

  private key(span: CharacterTransition, frame: number, character: CustomizerCharacter): string {
    return `${span.elementId}:${span.boundaryFrame}:${this.identity(span.from)}:${this.identity(span.to)}:${character.updatedAt}:${frame}`
  }

  get(span: CharacterTransition, frame: number, character: CustomizerCharacter): VideoCharacterState | undefined {
    const key = this.key(span, frame, character)
    const cached = this.cache.get(key)
    if (cached) {
      this.cache.delete(key)
      this.cache.set(key, cached)
      this.cacheHits++
    }
    return cached?.state
  }

  metrics(): PreviewTransitionMetrics {
    return {
      rendered: this.rendered, cacheHits: this.cacheHits, discarded: this.discarded,
      renderMs: this.renderMs, lastRenderMs: this.lastRenderMs,
      cachedBytes: this.bytes, cachedFrames: this.cache.size, inFlight: this.pending.size,
    }
  }

  /** Cancel all not-yet-completed requests, including stale work from an old seek. */
  cancelPending(): void {
    this.generation++
    this.abort.abort()
    this.abort = new AbortController()
    this.pending.clear()
    this.plan = null
    this.playbackRequested = false
  }

  private setPlan(next: Plan): void {
    const prev = this.plan
    if (prev && prev.kind === next.kind && prev.spans === next.spans
      && prev.characters === next.characters && prev.boundary === next.boundary
      && (next.kind === 'ahead' || prev.anchorFrame === next.anchorFrame)) return
    this.cancelPending()
    this.plan = next
  }

  private prepare(span: CharacterTransition, frame: number, character: CustomizerCharacter): Promise<void> {
    if (this.disposed) return Promise.resolve()
    const key = this.key(span, frame, character)
    if (this.cache.has(key)) return Promise.resolve()
    const existing = this.pending.get(key)
    if (existing) return existing
    const generation = this.generation
    const signal = this.abort.signal
    const job = this.queue.catch(() => undefined).then(async () => {
      if (this.disposed || signal.aborted || generation !== this.generation) {
        this.discarded++
        return
      }
      const start = performance.now()
      let state: VideoCharacterState
      try {
        // Prefer the same direct-Canvas Gacha raster used by export. A renderer
        // without that capability remains compatible with the legacy PNG path.
        state = await (this.renderer.renderPreview
          ? this.renderer.renderPreview(span, frame, character, signal)
          : this.renderer.render(span, frame, character, signal))
      } catch (reason) {
        if (this.disposed || signal.aborted || generation !== this.generation) {
          this.discarded++
          return
        }
        throw reason
      }
      if (this.disposed || signal.aborted || generation !== this.generation) {
        this.discarded++
        return
      }
      // Full PNG is an existing DOM contract; account UTF-16 conservatively.
      const bytes = state.imageDataUrl.length * 2
      this.cache.set(key, { state, bytes })
      this.bytes += bytes
      this.rendered++
      this.lastRenderMs = performance.now() - start
      this.renderMs += this.lastRenderMs
      while ((this.bytes > 128 * 1024 ** 2 || this.cache.size > 240) && this.cache.size > 1) {
        const oldest = this.cache.keys().next().value!
        const cached = this.cache.get(oldest)!
        this.bytes -= cached.bytes
        this.cache.delete(oldest)
      }
    }).finally(() => {
      if (this.pending.get(key) === job) this.pending.delete(key)
    })
    this.pending.set(key, job)
    this.queue = job.catch(() => undefined)
    return job
  }

  private characterFor(span: CharacterTransition, characters: readonly CustomizerCharacter[]): CustomizerCharacter {
    const character = characters.find(item => item.id === span.from.element.characterId)
    if (!character) throw new Error('Um personagem da animação não foi encontrado na biblioteca.')
    return character
  }

  /** A paused seek renders only its actual intermediate sample (never the next whole transition). */
  async prepareAtFrame(spans: readonly CharacterTransition[], frame: number, characters: readonly CustomizerCharacter[]): Promise<void> {
    if (this.disposed) return
    // A Play request on this very frame owns its longer preparation.
    if (this.playbackRequested && this.plan?.kind === 'ahead' && this.plan.anchorFrame === frame
      && this.plan.spans === spans && this.plan.characters === characters) return
    this.setPlan({ kind: 'paused', spans, characters, boundary: null, anchorFrame: frame })
    const relevant = spans.filter(span => frame > span.startFrame && frame < span.boundaryFrame)
    for (const span of relevant) {
      if (this.disposed || this.plan?.kind !== 'paused' || this.plan.anchorFrame !== frame) return
      await this.prepare(span, frame, this.characterFor(span, characters))
    }
  }

  /** Prepare exactly the nearest upcoming transition boundary, not every future key. */
  async prepareAhead(spans: readonly CharacterTransition[], frame: number, characters: readonly CustomizerCharacter[]): Promise<void> {
    if (this.disposed) return
    const boundary = spans.reduce<number | null>((nearest, span) =>
      span.boundaryFrame > frame && (nearest === null || span.boundaryFrame < nearest)
        ? span.boundaryFrame : nearest, null)
    this.setPlan({ kind: 'ahead', spans, characters, boundary, anchorFrame: frame })
    this.playbackRequested = true
    if (boundary === null) return
    const signal = this.abort.signal
    const relevant = spans.filter(span => span.boundaryFrame === boundary)
    for (const span of relevant) {
      const character = this.characterFor(span, characters)
      for (const sample of transitionSampleFrames(span)) {
        if (this.disposed || signal.aborted) return
        await this.prepare(span, sample, character)
      }
    }
  }

  dispose(): void {
    this.cancelPending()
    this.disposed = true
    this.cache.clear()
    this.bytes = 0
    this.renderer.dispose()
  }
}

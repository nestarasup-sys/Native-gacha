type MutableValue<T> = { current: T }
export type MixerStrokeState = { pointerId: number; x: number; y: number }
type MixerSegmentPainter = (
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  touchedPixels: Map<string, Uint8Array>,
  session: number
) => Promise<void>

export type SeamMixerSessionState = {
  stroke: MutableValue<MixerStrokeState | null>
  touchedPixels: MutableValue<Map<string, Uint8Array>>
  queue: MutableValue<Promise<void>>
  generation: MutableValue<number>
}

/** Serializes brush work and prevents queued segments from crossing model sessions. */
export function createSeamMixerSession(state: SeamMixerSessionState, paintSegment: MixerSegmentPainter, reportError: (message: string) => void) {
  const queueSegment = (fromX: number, fromY: number, toX: number, toY: number) => {
    const touchedPixels = state.touchedPixels.current
    const generation = state.generation.current
    state.queue.current = state.queue.current
      .then(() => generation === state.generation.current
        ? paintSegment(fromX, fromY, toX, toY, touchedPixels, generation)
        : undefined)
      .catch((reason: unknown) => {
        if (generation === state.generation.current) {
          reportError(reason instanceof Error ? `Misturador: ${reason.message}` : 'O misturador não conseguiu editar essa peça.')
        }
      })
  }

  const reset = () => {
    state.generation.current += 1
    state.stroke.current = null
    state.touchedPixels.current = new Map()
  }

  return { queueSegment, reset }
}

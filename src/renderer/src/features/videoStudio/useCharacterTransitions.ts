import { useEffect, useMemo, useState } from 'react'
import type { CustomizerCharacter } from '../../../../shared/customizer'
import type { StudioDocument } from '../../../../shared/studio'
import type { VideoGachaCanvasState } from './videoGachaCanvasFrame'
import { compileCharacterTransitions, transitionSampleFrames, type CharacterTransition } from './characterTransitions'
import { PreviewTransitionSession } from './previewTransitionSession'
import { PreviewEndpointWarmup } from './previewEndpointWarmup'

export function useCharacterTransitions(
  studio: StudioDocument | null,
  characters: CustomizerCharacter[],
  frame: number,
  playing: boolean,
  onError: (message: string) => void,
  enabled = true,
  backendRevision = 0,
) {
  const timeline = studio?.videoTimeline
  const spans = useMemo(
    () => studio ? compileCharacterTransitions(studio) : [],
    [studio?.id, studio?.elements, timeline?.characterKeys, timeline?.characterBases, timeline?.characterGaps, timeline?.durationFrames],
  )
  // A GPU/Canvas switch must allocate a completely fresh session, not reuse
  // cached frames produced by the previous renderer or an aborted seek.
  const session = useMemo(() => new PreviewTransitionSession(studio?.id ?? ''), [studio?.id, backendRevision])
  const endpointWarmup = useMemo(() => new PreviewEndpointWarmup(), [studio?.id])
  const [revision, setRevision] = useState(0)
  useEffect(() => { session.activate(); return () => session.dispose() }, [session])
  useEffect(() => () => endpointWarmup.clear(), [endpointWarmup])
  const endpointWarmupBucket = Math.floor(frame / 30)
  useEffect(() => {
    if (studio && enabled) endpointWarmup.prepare(spans, frame)
  // Warmup is intentionally updated twice per second, not on every RAF.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studio?.id, enabled, spans, endpointWarmupBucket, endpointWarmup])

  // The full Gacha compositor (pose joints, clothing, hair, eyes and facial
  // transforms) produces the *actual* animation samples. Prepare just the
  // nearest boundary in the background, without gating Play on completion.
  const nextBoundary = useMemo(
    () => spans.find(span => span.boundaryFrame > frame)?.boundaryFrame ?? null,
    [spans, frame],
  )
  const warmupBucket = Math.floor(frame / 120)
  const withinTransition = spans.some(span => frame > span.startFrame && frame < span.boundaryFrame)
  useEffect(() => {
    if (!studio || !enabled || (withinTransition && !playing) || nextBoundary === null || nextBoundary - frame > 360) return
    let live = true
    void session.prepareAhead(spans, frame, characters).then(() => {
      if (live) setRevision(value => value + 1)
    }).catch((error: unknown) => {
      if (live) onError(error instanceof Error ? error.message : 'Erro ao preparar a animação Gacha real.')
    })
    return () => { live = false }
  // Recalculate on boundary or every two timeline seconds, not every RAF.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studio?.id, enabled, session, spans, characters, nextBoundary, warmupBucket, playing, onError])

  // Paused seek requests its exact sample immediately; never queue an entire
  // future transition in front of a direct user seek.
  useEffect(() => {
    if (!studio || !enabled || playing) return
    session.requestFrame(spans, frame, characters,
      () => setRevision(value => value + 1),
      (error) => onError(error instanceof Error ? error.message : 'Erro ao renderizar a prévia de personagem.'),
    )
  }, [studio?.id, enabled, playing, session, spans, frame, characters, onError])

  const samplesByFrame = useMemo(() => {
    const result = new Map<number, CharacterTransition[]>()
    for (const span of spans) for (const sample of transitionSampleFrames(span)) {
      result.set(sample, [...(result.get(sample) ?? []), span])
    }
    return result
  }, [spans])

  const samples = useMemo(() => {
    const result = new Map<string, VideoGachaCanvasState>()
    if (enabled) for (const span of samplesByFrame.get(frame) ?? []) {
      const character = characters.find(item => item.id === span.from.element.characterId)
      if (!character) continue
      // Prefer a genuine Gacha rig raster. A delayed sample repeats the last
      // correctly rendered pose for this transition; it NEVER overlays ghost
      // copies of incompatible preset/pose art.
      const state = session.getBestAvailable(span, frame, character)
      result.set(span.elementId, state)
    }
    return result
  }, [samplesByFrame, frame, session, characters, revision, enabled])
  const cancelPlayback = () => session.cancelPending()
  return { samples, cancelPlayback, transitionMetrics: session.metrics() }
}

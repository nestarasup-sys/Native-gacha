import { useEffect, useMemo, useState } from 'react'
import type { CustomizerCharacter } from '../../../../shared/customizer'
import type { StudioDocument } from '../../../../shared/studio'
import type { VideoGachaCanvasState } from './videoGachaCanvasFrame'
import { compileCharacterTransitions, transitionSampleFrames, type CharacterTransition } from './characterTransitions'
import { evaluateRealtimeTransitionFallback, type RealtimeTransitionFallback } from './realtimeTransitionFallback'
import { PreviewTransitionSession } from './previewTransitionSession'

export function useCharacterTransitions(
  studio: StudioDocument | null,
  characters: CustomizerCharacter[],
  frame: number,
  playing: boolean,
  onError: (message: string) => void,
  enabled = true,
) {
  const timeline = studio?.videoTimeline
  const spans = useMemo(
    () => studio ? compileCharacterTransitions(studio) : [],
    [studio?.id, studio?.elements, timeline?.characterKeys, timeline?.characterBases, timeline?.characterGaps, timeline?.durationFrames],
  )
  const session = useMemo(() => new PreviewTransitionSession(studio?.id ?? ''), [studio?.id])
  const [revision, setRevision] = useState(0)
  useEffect(() => { session.activate(); return () => session.dispose() }, [session])

  // During Play, use an immediate GPU cross-dissolve of the authored endpoint
  // snapshots. A full Gacha raster may take longer than all 15 timeline frames;
  // requesting it every RAF can starve the interface without showing one frame.
  useEffect(() => {
    if (playing || !enabled) session.cancelPending()
  }, [playing, enabled, session])

  // Paused seek asks for just ONE precise Gacha frame asynchronously. The
  // fallback remains visible until that expensive render finishes.
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
    // Never mix sporadically cached accurate rasters with the fast playback
    // dissolve: doing so causes visible flashes and temporal discontinuities.
    if (!playing && enabled) for (const span of samplesByFrame.get(frame) ?? []) {
      const character = characters.find(item => item.id === span.from.element.characterId)
      const state = character && session.get(span, frame, character)
      if (state) result.set(span.elementId, state)
    }
    return result
  }, [samplesByFrame, frame, session, characters, revision, enabled, playing])

  const fallbackTransitions = useMemo(() => {
    const result = new Map<string, RealtimeTransitionFallback>()
    if (enabled) for (const span of samplesByFrame.get(frame) ?? []) {
      if (samples.has(span.elementId)) continue
      const fallback = evaluateRealtimeTransitionFallback(span, frame)
      if (fallback) result.set(span.elementId, fallback)
    }
    return result
  }, [samplesByFrame, frame, samples, enabled])

  const cancelPlayback = () => session.cancelPending()
  return { samples, fallbackTransitions, cancelPlayback, transitionMetrics: session.metrics() }
}

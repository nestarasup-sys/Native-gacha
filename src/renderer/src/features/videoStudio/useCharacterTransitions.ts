import { useEffect, useMemo, useState } from 'react'
import type { CustomizerCharacter } from '../../../../shared/customizer'
import type { StudioDocument } from '../../../../shared/studio'
import type { VideoGachaCanvasState } from './videoGachaCanvasFrame'
import { compileCharacterTransitions, transitionSampleFrames, type CharacterTransition } from './characterTransitions'
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
    [studio?.id, timeline?.characterKeys, timeline?.characterBases, timeline?.characterGaps, timeline?.durationFrames],
  )
  const session = useMemo(() => new PreviewTransitionSession(studio?.id ?? ''), [studio?.id])
  const [revision, setRevision] = useState(0)
  useEffect(() => () => session.dispose(), [session])

  // Every render asks for only the absolute frame on screen; no await and no
  // preparation of a complete 15-frame segment before enabling playback.
  useEffect(() => {
    if (!studio || !enabled) {
      session.cancelPending()
      return
    }
    session.requestFrame(spans, frame, characters,
      () => setRevision(value => value + 1),
      (error) => onError(error instanceof Error ? error.message : 'Erro ao renderizar a prévia de personagem.'),
    )
  }, [studio?.id, enabled, session, spans, frame, characters, onError])

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
      const state = character && session.get(span, frame, character, playing)
      if (state) result.set(span.elementId, state)
    }
    return result
  }, [samplesByFrame, frame, session, characters, revision, enabled, playing])

  const cancelPlayback = () => session.cancelPending()
  return { samples, cancelPlayback, transitionMetrics: session.metrics() }
}

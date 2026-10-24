import { useEffect, useMemo, useRef, useState } from 'react'
import type { CustomizerCharacter } from '../../../../shared/customizer'
import type { StudioDocument, VideoCharacterState } from '../../../../shared/studio'
import { compileCharacterTransitions, transitionSampleFrames, type CharacterTransition } from './characterTransitions'
import { PreviewTransitionSession } from './previewTransitionSession'

export function useCharacterTransitions(studio: StudioDocument | null, characters: CustomizerCharacter[], frame: number, playing: boolean, onError: (message: string) => void, enabled = true) {
  const timeline = studio?.videoTimeline
  const spans = useMemo(() => studio ? compileCharacterTransitions(studio) : [], [studio?.id, timeline?.characterKeys, timeline?.characterBases, timeline?.characterGaps, timeline?.durationFrames])
  const session = useMemo(() => new PreviewTransitionSession(studio?.id ?? ''), [studio?.id])
  const [revision, setRevision] = useState(0)
  const activeSession = useRef(session)
  activeSession.current = session
  const activePlan = useRef({ spans, characters })
  activePlan.current = { spans, characters }
  const bucket = Math.floor(frame / 60)
  const nextBoundary = spans.find((span) => span.boundaryFrame > frame)?.boundaryFrame
  useEffect(() => { session.activate(); return () => session.dispose() }, [session])
  // Scrubbing a paused playhead asks for one intermediate frame; playback
  // prepares the next transition boundary and keeps the original 15-frame contract.
  const pausedFrame = playing ? null : frame
  useEffect(() => {
    if (!studio || !enabled) return
    let cancelled = false
    const work = playing
      ? session.prepareAhead(spans, frame, characters)
      : session.prepareAtFrame(spans, frame, characters)
    void work.then(() => {
      if (!cancelled) setRevision((value) => value + 1)
    }).catch((reason: unknown) => {
      if (!cancelled) onError(reason instanceof Error ? reason.message : 'Não foi possível preparar uma animação de personagem.')
    })
    return () => { cancelled = true }
  }, [session, spans, bucket, nextBoundary, pausedFrame, characters, onError, enabled, playing])


  const samplesByFrame = useMemo(() => {
    const result = new Map<number, CharacterTransition[]>()
    for (const span of spans) for (const sample of transitionSampleFrames(span)) result.set(sample, [...(result.get(sample) ?? []), span])
    return result
  }, [spans])
  const samples = useMemo(() => {
    const result = new Map<string, VideoCharacterState>()
    // A paused seek is still an absolute timeline frame; show its authored transition sample too.
    if (enabled) for (const span of samplesByFrame.get(frame) ?? []) {
      if (!(frame > span.startFrame && frame < span.boundaryFrame)) continue
      const character = characters.find((item) => item.id === span.from.element.characterId)
      const state = character && session.get(span, frame, character)
      if (state) result.set(span.elementId, state)
    }
    return result
  }, [samplesByFrame, frame, session, characters, revision, enabled])

  const preparePlayback = async (startFrame = frame) => {
    if (!enabled) return true
    await session.prepareAhead(spans, startFrame, characters)
    const current = activeSession.current === session && activePlan.current.spans === spans && activePlan.current.characters === characters
    if (current) setRevision(value => value + 1)
    return current
  }
  const cancelPlayback = () => session.cancelPending()
  const missing = enabled && playing && (samplesByFrame.get(frame) ?? []).some((span) => !samples.has(span.elementId))
  return { samples, missing, preparePlayback, cancelPlayback, transitionMetrics: session.metrics() }
}

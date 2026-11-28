import { useEffect, useMemo, useRef, useState } from 'react'
import type { CustomizerCharacter } from '../../../../../shared/customizer'
import type { EditorV6Document } from '../../../../../shared/editorV6'
import { attachEditorV6Motion, editorV6MotionPlans, type EditorV6MotionBakeResult } from '../../../../../shared/editorV6Motion'
import { editorV6UpperBound } from '../../../../../shared/editorV6SortedSearch'
import { EDITOR_V6_TIMELINE_FPS } from '../../../../../shared/editorV6Timing'
import { parseEditorV6MotionAtlasBudgetError } from '../../../../../shared/editorV6MotionBudget'

const PREVIEW_BATCH_SIZE = 6

/** Keep a small window of shared motion atlases ready for playback or scrubbing. */
export function useEditorV6PreviewMotion(
  project: EditorV6Document,
  frame: number,
  characters: readonly CustomizerCharacter[],
  enabled: boolean
): EditorV6Document {
  const plans = useMemo(() => editorV6MotionPlans(project).slice().sort((a, b) => a.endFrame - b.endFrame), [project.timeline])
  const characterIndex = useMemo(() => new Map(characters.map(character => [character.id, character])), [characters])
  const first = editorV6UpperBound(plans, frame, plan => plan.endFrame)
  const limit = Math.min(first + PREVIEW_BATCH_SIZE, editorV6UpperBound(plans, frame + 3 * EDITOR_V6_TIMELINE_FPS, plan => plan.endFrame))
  const candidates = useMemo(() => plans.slice(first, limit), [plans, first, limit])
  type PreviewCache = { projectId: string; characters: typeof characterIndex; results: ReadonlyMap<string, EditorV6MotionBakeResult> }
  type Request = { id: string; pending: boolean }
  type Session = { requests: Map<string, Request>; results: Map<string, EditorV6MotionBakeResult> }
  const [prepared, setPrepared] = useState<PreviewCache>()
  const session = useRef<Session | undefined>(undefined)

  useEffect(() => {
    if (!enabled) return
    const active: Session = { requests: new Map(), results: new Map() }
    session.current = active
    return () => {
      session.current = undefined
      setPrepared(undefined)
      for (const request of active.requests.values()) {
        if (request.pending) void window.desktop.editorV6.cancelEditorV6Motion(request.id).catch(() => {})
      }
    }
  }, [project.id, characterIndex, enabled])

  useEffect(() => {
    const active = session.current
    if (!active) return
    const activeKeys = new Set(candidates.map(plan => plan.key))
    const publish = () => setPrepared({ projectId: project.id, characters: characterIndex, results: new Map(active.results) })
    let pruned = false
    for (const [key, request] of active.requests) {
      if (activeKeys.has(key)) continue
      active.requests.delete(key)
      pruned = active.results.delete(key) || pruned
      if (request.pending) void window.desktop.editorV6.cancelEditorV6Motion(request.id).catch(() => {})
    }
    if (pruned) publish()
    for (const plan of candidates) {
      if (active.requests.has(plan.key)) continue
      const character = characterIndex.get(plan.characterId)
      if (!character) continue
      const request = { id: crypto.randomUUID(), pending: true }
      active.requests.set(plan.key, request)
      const current = () => session.current === active && active.requests.get(plan.key) === request
      void window.desktop.editorV6.bakeEditorV6Motion({ id: request.id, plan, character }).then(result => {
        if (!current() || !result) return
        active.results.set(plan.key, result)
        publish()
      }).catch((error: unknown) => {
        if (current() && !parseEditorV6MotionAtlasBudgetError(error)) console.warn('Não foi possível preparar a transição na prévia:', error)
      }).finally(() => { request.pending = false })
    }
  }, [project.id, candidates, characterIndex, enabled])

  return useMemo(() => {
    if (!enabled || prepared?.projectId !== project.id || prepared.characters !== characterIndex) return project
    return candidates.reduce((document, plan) => {
      const result = prepared.results.get(plan.key)
      return result ? attachEditorV6Motion(document, plan.blockId, result) : document
    }, project)
  }, [project, candidates, characterIndex, enabled, prepared])
}

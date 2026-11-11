import type { EditorV6Document, EditorV6Element, EditorV6FaceRenderMode } from '../../../../shared/editorV6'

export type EditorV6HairMotionTarget = { elementId: string; state: EditorV6Element; assetId: string; faceMode: EditorV6FaceRenderMode }

function resolveFaceMode(value: EditorV6Element['activeFaceMode']): EditorV6FaceRenderMode {
  return value === 'blink' || value === 'talk' ? value : 'idle'
}

function targetsForState(elementId: string, state: EditorV6Element): EditorV6HairMotionTarget[] {
  if (state.kind !== 'character' || !state.characterId || !state.assetId) return []
  const targets: EditorV6HairMotionTarget[] = [{ elementId, state, assetId: state.assetId, faceMode: resolveFaceMode(state.activeFaceMode) }]
  for (const [mode, assetId] of Object.entries(state.faceModeAssetIds ?? {})) {
    if (!assetId || !['idle', 'blink', 'talk', 'talk-blink'].includes(mode)) continue
    targets.push({ elementId, state, assetId, faceMode: mode as EditorV6FaceRenderMode })
  }
  return targets
}

/**
 * Keep the historical full-document behavior for calls without an export range.
 * For an MP4 range, the initial scene is always retained (legacy fallback),
 * while only timeline states whose effective interval touches the export are
 * prepared. Character states hold until the next character state, even if an
 * older file has a short stored durationFrames. An in-progress transition
 * therefore keeps both endpoint portraits.
 *
 * This selection never changes the timeline or saved character snapshots.
 */
export function selectEditorV6HairTargetStates(
  project: EditorV6Document,
  range?: Readonly<{ startFrame: number; endFrame: number }>
): EditorV6Element[] {
  const states: EditorV6Element[] = [...project.elements]
  for (const track of project.timeline.tracks) {
    if (!range) {
      for (const block of track.blocks) if (block.state) states.push(block.state)
      continue
    }
    const blocks = track.kind === 'character'
      ? [...track.blocks].sort((a, b) => a.startFrame - b.startFrame || a.id.localeCompare(b.id))
      : track.blocks
    for (let index = 0; index < blocks.length; index += 1) {
      const block = blocks[index]
      if (!block.state || block.startFrame >= range.endFrame) continue
      const end = track.kind === 'character'
        ? blocks[index + 1]?.startFrame ?? project.timeline.durationFrames
        : block.startFrame + block.durationFrames
      if (end > range.startFrame) states.push(block.state)
    }
  }
  return states
}

export function collectEditorV6HairMotionTargets(
  project: EditorV6Document,
  range?: Readonly<{ startFrame: number; endFrame: number }>
): EditorV6HairMotionTarget[] {
  const targets = new Map<string, EditorV6HairMotionTarget>()
  const states = selectEditorV6HairTargetStates(project, range)
  for (const state of states) {
    for (const target of targetsForState(state.id, state)) {
      const key = `${target.elementId}:${target.assetId}`
      const existing = targets.get(key)
      if (existing && existing.state.characterId !== target.state.characterId) throw Error('Um retrato do Editor V6 está associado a mais de um personagem.')
      if (!existing) targets.set(key, target)
    }
  }
  return [...targets.values()]
}

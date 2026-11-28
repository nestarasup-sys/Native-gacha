import type { EditorV6Element, EditorV6TimelineTrack } from './editorV6'
import type { EditorV6IntroClip } from './editorV6Intro'

/** Version 11 stores the full pose source frame instead of an expression-dependent alpha crop. */
export const EDITOR_V6_SOURCE_FRAME_VERSION = 11

type StableGeometry = Pick<EditorV6Element, 'width' | 'height' | 'characterCanvasWidth' | 'x' | 'y'>

function geometryKey(state: EditorV6Element): string {
  return JSON.stringify([
    state.characterId ?? null,
    state.poseSlot ?? null,
    state.poseSourceRevision ?? null,
    state.modelSourceRevision ?? null,
    state.characterScale ?? 100,
    state.characterWidthScale ?? 100,
    state.characterHeightScale ?? 100
  ])
}

/**
 * Face variants of the same actor/pose share one source-frame rectangle.
 * Older V6 projects may have baked expression-specific crops into each block's
 * dimensions. Restore a common rectangle on load; keep meaningful per-block
 * position edits, treating only sub-quarter-pixel position drift as rounding.
 */
export function stabilizeEditorV6CharacterTrackFaceGeometry(track: EditorV6TimelineTrack): EditorV6TimelineTrack {
  if (track.kind === 'intro') return stabilizeEditorV6IntroFaceGeometry(track)
  if (track.kind !== 'character') return track
  const canonical = new Map<string, StableGeometry>()
  let changed = false
  const blocks = [...track.blocks].sort((a, b) => a.startFrame - b.startFrame).map((block) => {
    const state = block.state
    if (state?.kind !== 'character') return block
    const key = geometryKey(state)
    const reference = canonical.get(key)
    if (!reference) {
      canonical.set(key, { width: state.width, height: state.height, characterCanvasWidth: state.characterCanvasWidth, x: state.x, y: state.y })
      return block
    }
    const x = Math.abs(state.x - reference.x) * 19.2 <= 0.25 ? reference.x : state.x
    const y = Math.abs(state.y - reference.y) * 10.8 <= 0.25 ? reference.y : state.y
    if (state.width === reference.width && state.height === reference.height
      && state.characterCanvasWidth === reference.characterCanvasWidth && x === state.x && y === state.y) return block
    changed = true
    return { ...block, state: { ...state, width: reference.width, height: reference.height,
      ...(reference.characterCanvasWidth === undefined ? { characterCanvasWidth: undefined } : { characterCanvasWidth: reference.characterCanvasWidth }), x, y } }
  })
  return changed ? { ...track, blocks } : track
}

/** Intro portraits store the rendered frame on the clip instead of a character state. */
function stabilizeEditorV6IntroFaceGeometry(track: EditorV6TimelineTrack): EditorV6TimelineTrack {
  const canonical = new Map<string, { aspect?: number; frame?: Extract<EditorV6IntroClip, { kind: 'character' }>['portraitFrame'] }>()
  let changed = false
  const blocks = [...track.blocks].sort((a, b) => a.startFrame - b.startFrame).map((block) => {
    const intro = block.intro
    if (intro?.kind !== 'character') return block
    const layout = intro.portraitLayout
    const key = JSON.stringify([intro.characterId, intro.poseSlot ?? null,
      layout?.characterScale ?? 100, layout?.characterWidthScale ?? 100, layout?.characterHeightScale ?? 100])
    const reference = canonical.get(key)
    if (!reference) {
      canonical.set(key, { aspect: intro.portraitAspect, frame: intro.portraitFrame })
      return block
    }
    if (!reference.frame && !intro.portraitFrame && intro.portraitAspect === reference.aspect) return block
    const fitted = (aspect?: number) => ({ width: (aspect ? Math.min(848, 984 * aspect) : 848) / 19.2,
      height: (aspect ? Math.min(984, 848 / aspect) : 984) / 10.8 })
    const dimensions = reference.frame ?? fitted(reference.aspect)
    const frame = reference.frame || intro.portraitFrame
      ? { ...dimensions,
          x: intro.portraitFrame && Math.abs(intro.portraitFrame.x - (reference.frame?.x ?? 0)) * 19.2 <= 0.25
            ? reference.frame?.x ?? 0 : intro.portraitFrame?.x ?? reference.frame?.x ?? 0,
          y: intro.portraitFrame && Math.abs(intro.portraitFrame.y - (reference.frame?.y ?? 0)) * 10.8 <= 0.25
            ? reference.frame?.y ?? 0 : intro.portraitFrame?.y ?? reference.frame?.y ?? 0 }
      : undefined
    const sameFrame = JSON.stringify(frame) === JSON.stringify(intro.portraitFrame)
    if (intro.portraitAspect === reference.aspect && sameFrame) return block
    changed = true
    return { ...block, intro: { ...intro, portraitAspect: reference.aspect, portraitFrame: frame } }
  })
  return changed ? { ...track, blocks } : track
}

export function stabilizeEditorV6TimelineCharacterFaceGeometry(tracks: EditorV6TimelineTrack[]): EditorV6TimelineTrack[] {
  let changed = false
  const next = tracks.map((track) => {
    const normalized = stabilizeEditorV6CharacterTrackFaceGeometry(track)
    if (normalized !== track) changed = true
    return normalized
  })
  return changed ? next : tracks
}

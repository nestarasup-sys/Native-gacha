import type { CustomizerFaceAppearance } from '../../../../shared/customizer'
import type { EditorV6Element } from '../../../../shared/editorV6'
import { editorV6CharacterSnapshotIsCurrent } from '../../../../shared/editorV6CharacterSource'

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** Reapply only scene-specific changes over the latest Customizer appearance. */
function rebaseValue(previous: unknown, scene: unknown, current: unknown): unknown {
  if (JSON.stringify(previous) === JSON.stringify(scene)) return current
  if (!isRecord(previous) || !isRecord(scene) || !isRecord(current)) return scene
  const result: Record<string, unknown> = { ...current }
  for (const key of new Set([...Object.keys(previous), ...Object.keys(scene)])) {
    if (!(key in scene)) { if (key in previous) delete result[key]; continue }
    if (!(key in previous)) { result[key] = scene[key]; continue }
    result[key] = rebaseValue(previous[key], scene[key], current[key])
  }
  return result
}

export function resolveRefreshedFaceAppearance(
  state: Pick<EditorV6Element, 'characterSourceUpdatedAt' | 'faceAppearance' | 'expressionBase'>,
  character: { updatedAt: string; customization: { faceAppearance?: CustomizerFaceAppearance } }
): CustomizerFaceAppearance | undefined {
  const source = character.customization.faceAppearance
  if (!source) return state.faceAppearance ?? state.expressionBase?.appearance
  if (editorV6CharacterSnapshotIsCurrent(state, character)) return state.faceAppearance ?? source
  if (!state.faceAppearance || !state.expressionBase?.appearance) return source
  return rebaseValue(state.expressionBase.appearance, state.faceAppearance, source) as CustomizerFaceAppearance
}

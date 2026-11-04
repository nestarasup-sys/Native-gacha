/**
 * Deduplicate identical transition bakes only within ONE export preparation.
 *
 * This is not a cache of exports, projects or sessions. The caller owns this
 * batch, and drops it immediately after completion/cancellation. Sharing the
 * in-flight promise also avoids scheduling duplicate expensive canvas work.
 */
export function createEditorV6HairBakeBatch<T>() {
  const byKey = new Map<string, Promise<T>>()
  let realBakes = 0
  let reusedBakes = 0
  return {
    run(key: string, bake: () => Promise<T>): Promise<T> {
      const previous = byKey.get(key)
      if (previous) {
        reusedBakes++
        return previous
      }
      realBakes++
      const next = Promise.resolve().then(bake)
      byKey.set(key, next)
      return next
    },
    clear() { byKey.clear() },
    metrics() { return { realBakes, reusedBakes } }
  }
}

/**
 * A one-shot POSTERIOR reaction starts AFTER a pose transition. The normal
 * export already creates/verifies the complete full-character motion atlas,
 * so generating a second hairless atlas for those same 7 pose samples would
 * duplicate expensive body/face rendering without changing the final effect.
 *
 * All other hair modes must retain their existing hairless animation atlases.
 * The selection is scoped to the requested export range, never cached between
 * exports. Use the original motion renderer in the one-shot transition.
 */
export function selectEditorV6HairlessTransitionBakes<T extends { startFrame: number; endFrame: number }>(
  plans: readonly T[],
  options: { startFrame: number; endFrame: number; hairPoseReactionOnly?: boolean }
): T[] {
  if (options.hairPoseReactionOnly) return []
  return plans.filter(plan => plan.startFrame < options.endFrame && plan.endFrame > options.startFrame)
}

/** Include the current character snapshot, both prepared rig dimensions/crops,
 * the canonical motion key and the absolute-frame mouth scale sequence.
 * Identical plan keys alone are insufficient for looped speech.
 */
export function editorV6HairBakeContentKey(input: {
  planKey: string
  characterId: string
  characterRevision?: string
  source: unknown
  fromCrop: unknown
  toCrop: unknown
  fromDimensions: readonly number[]
  toDimensions: readonly number[]
  mouthScaleSamples?: readonly number[]
}): string {
  return JSON.stringify([
    input.planKey, input.characterId, input.characterRevision ?? null, input.source,
    input.fromCrop, input.toCrop, input.fromDimensions, input.toDimensions,
    input.mouthScaleSamples ?? null
  ])
}

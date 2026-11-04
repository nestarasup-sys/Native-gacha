/**
 * Reduces session thrash in the reusable Electron motion baker. The heavy
 * Fabricator source/wardrobe caches and rendered endpoint poses are scoped to
 * one character revision, so favor consecutive plans from the same character.
 *
 * This changes scheduling ONLY. The caller stores results in their original
 * indexes, so timeline order, asset/frame data and output order stay intact.
 * No persistence and no merging of visually distinct transitions.
 */
export function editorV6MotionBakeGroupOrder(
  groups: readonly (readonly { characterId: string }[])[]
): number[] {
  return groups.map((_, index) => index).sort((a, b) => {
    const left = groups[a][0]?.characterId ?? ''
    const right = groups[b][0]?.characterId ?? ''
    return left < right ? -1 : left > right ? 1 : a - b
  })
}

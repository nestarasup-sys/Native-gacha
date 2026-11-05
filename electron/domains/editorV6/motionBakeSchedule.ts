/**
 * Assigns complete per-character bake sequences to stable worker lanes.
 * The motion baker owns reusable renderers per Electron window, so keeping a
 * character's sequence on one lane can reuse exact endpoints without changing
 * timeline/result ordering.
 */
export function editorV6MotionBakeLaneAssignments(
  groups: readonly (readonly { characterId: string }[])[],
  laneCount: number
): number[][] {
  const count = Math.max(1, Math.floor(laneCount))
  const byCharacter = new Map<string, number[]>()
  groups.forEach((group, index) => {
    const characterId = group[0]?.characterId ?? ''
    const sequence = byCharacter.get(characterId)
    if (sequence) sequence.push(index)
    else byCharacter.set(characterId, [index])
  })

  const lanes = Array.from({ length: count }, () => [] as number[])
  const workloads = Array.from({ length: count }, () => 0)
  const characters = [...byCharacter.entries()].sort((a, b) => b[1].length - a[1].length || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
  for (const [, sequence] of characters) {
    let lane = 0
    for (let candidate = 1; candidate < count; candidate++) {
      if (workloads[candidate] < workloads[lane]) lane = candidate
    }
    lanes[lane].push(...sequence)
    workloads[lane] += sequence.length
  }
  return lanes
}

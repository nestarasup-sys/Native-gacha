export type ImportedModelBounds = {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export type ImportedModelPartNamingInput = {
  partBounds: ImportedModelBounds
  sourceWidth: number
  sourceHeight: number
  foregroundBounds: ImportedModelBounds
  componentPixelCount: number
  foregroundPixelCount: number
}

export type ImportedModelPartFrame = {
  id: string
  name: string
  x: number
  y: number
  width: number
  height: number
}

/** Keep the existing anatomy names; small top-side regions are merged into the head image. */
export function inferImportedModelPartName(input: ImportedModelPartNamingInput): string {
  const { partBounds, sourceWidth, sourceHeight } = input
  const centerX = (partBounds.minX + partBounds.maxX) / 2 / sourceWidth
  const centerY = (partBounds.minY + partBounds.maxY) / 2 / sourceHeight

  if (centerY < 0.27) return 'Cabeça'
  if (centerY > 0.70) return `Canela ${centerX < 0.5 ? 'esquerda' : 'direita'}`
  if (centerY > 0.52) return `Coxa ${centerX < 0.5 ? 'esquerda' : 'direita'}`
  if (centerY > 0.23 && centerY < 0.52 && centerX > 0.31 && centerX < 0.69) return 'Tronco'
  if (centerX < 0.35 || centerX > 0.65) return centerY < 0.40 ? `Braço ${centerX < 0.5 ? 'esquerdo' : 'direito'}` : `Antebraço ${centerX < 0.5 ? 'esquerdo' : 'direito'}`
  return 'Peça do modelo'
}

/** Identify small side fragments that should be composed into a nearby head part. */
export function isHeadFragmentCandidate(input: ImportedModelPartNamingInput): boolean {
  const centerY = (input.partBounds.minY + input.partBounds.maxY) / 2 / input.sourceHeight
  return centerY < 0.27 && isSmallUpperSideComponent(input)
}

/** Resolve nearby top-side fragments to their head without creating a second rig part. */
export function findHeadFragmentMergeTargets(parts: ImportedModelPartFrame[], fragmentIds: Iterable<string>): Map<string, string> {
  const fragments = new Set(fragmentIds)
  const heads = parts.filter((part) => part.name === 'Cabeça' && !fragments.has(part.id))
  const targets = new Map<string, string>()
  for (const fragmentId of fragments) {
    const fragment = parts.find((part) => part.id === fragmentId)
    if (!fragment) continue
    const nearestHead = heads
      .filter((head) => head.id !== fragment.id)
      .map((head) => ({ head, gap: partBoxGap(fragment, head) }))
      .filter(({ head, gap }) => gap <= Math.max(6, Math.min(head.width, head.height) * 0.15))
      .sort((a, b) => a.gap - b.gap)[0]?.head
    if (nearestHead) targets.set(fragment.id, nearestHead.id)
  }
  return targets
}

export async function mergeHeadFragments<T extends ImportedModelPartFrame>(
  parts: T[],
  fragmentIds: Iterable<string>,
  composeParts: (parts: T[]) => Promise<T>
): Promise<T[]> {
  const targets = findHeadFragmentMergeTargets(parts, fragmentIds)
  if (!targets.size) return parts

  const fragmentsByHead = new Map<string, T[]>()
  for (const [fragmentId, headId] of targets) {
    const fragments = fragmentsByHead.get(headId) ?? []
    const fragment = parts.find((part) => part.id === fragmentId)
    if (fragment) fragments.push(fragment)
    fragmentsByHead.set(headId, fragments)
  }

  const replacements = new Map<string, T>()
  const removedIds = new Set<string>()
  for (const [headId, fragments] of fragmentsByHead) {
    const head = parts.find((part) => part.id === headId)
    if (!head || !fragments.length) continue
    replacements.set(headId, await composeParts([head, ...fragments]))
    for (const fragment of fragments) removedIds.add(fragment.id)
  }

  return parts.flatMap((part) => {
    if (removedIds.has(part.id)) return []
    return [replacements.get(part.id) ?? part]
  })
}

function partBoxGap(a: ImportedModelPartFrame, b: ImportedModelPartFrame): number {
  const horizontalGap = Math.max(0, a.x - (b.x + b.width), b.x - (a.x + a.width))
  const verticalGap = Math.max(0, a.y - (b.y + b.height), b.y - (a.y + a.height))
  return Math.hypot(horizontalGap, verticalGap)
}

function isSmallUpperSideComponent(input: ImportedModelPartNamingInput): boolean {
  const { partBounds, foregroundBounds, componentPixelCount, foregroundPixelCount } = input
  if (foregroundPixelCount <= 0) return false

  const foregroundWidth = Math.max(1, foregroundBounds.maxX - foregroundBounds.minX + 1)
  const foregroundHeight = Math.max(1, foregroundBounds.maxY - foregroundBounds.minY + 1)
  const partWidth = partBounds.maxX - partBounds.minX + 1
  const partHeight = partBounds.maxY - partBounds.minY + 1
  const partCenterX = (partBounds.minX + partBounds.maxX) / 2
  const relativeCenterX = (partCenterX - foregroundBounds.minX) / foregroundWidth

  const isUpperSide = relativeCenterX < 0.42 || relativeCenterX > 0.58
  const isSmall = partWidth / foregroundWidth <= 0.14
    && partHeight / foregroundHeight <= 0.18
    && componentPixelCount / foregroundPixelCount <= 0.025

  return isUpperSide && isSmall
}

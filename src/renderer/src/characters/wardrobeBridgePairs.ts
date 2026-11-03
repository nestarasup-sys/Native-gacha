import type { WardrobeComponent } from '../../../shared/fabricator'

type Garment = { group: { modelSlot: number; setId: string }; component: WardrobeComponent }
type BodyPair = { upper: { id: string }; lower: { id: string }; family: 'arm' | 'leg' }

/** Preserve explicit pairs and infer only unambiguous pairs on a model joint. */
export function findWardrobeBridgePairs<T extends Garment>(garments: T[], joints: BodyPair[]): Array<{ upper: T; lower: T }> {
  const explicit = new Map<string, { upper?: T; lower?: T }>()
  for (const item of garments) {
    const { sleevePairId, sleeveSide, sleeveSegment } = item.component
    if (!sleevePairId || !sleeveSide || (sleeveSegment !== 'upper' && sleeveSegment !== 'lower')) continue
    const key = JSON.stringify([item.group.modelSlot, item.group.setId, sleevePairId, sleeveSide])
    const pair = explicit.get(key) ?? {}
    pair[sleeveSegment] = item
    explicit.set(key, pair)
  }
  const result: Array<{ upper: T; lower: T }> = []
  for (const pair of explicit.values()) if (pair.upper && pair.lower) result.push({ upper: pair.upper, lower: pair.lower })

  const sets = new Map<string, T[]>()
  for (const item of garments) {
    if (item.component.sleevePairId) continue
    const key = JSON.stringify([item.group.modelSlot, item.group.setId])
    const entries = sets.get(key) ?? []
    entries.push(item)
    sets.set(key, entries)
  }
  for (const entries of sets.values()) for (const joint of joints) {
    const upperCategory = joint.family === 'arm' ? 'manga-superior' : 'calca-coxa'
    const lowerCategory = joint.family === 'arm' ? 'manga-inferior' : 'calca-canela'
    const upper = entries.filter((item) => item.component.attachedPartId === joint.upper.id && item.component.category === upperCategory)
    const lower = entries.filter((item) => item.component.attachedPartId === joint.lower.id && item.component.category === lowerCategory)
    if (upper.length === 1 && lower.length === 1) result.push({ upper: upper[0], lower: lower[0] })
  }
  return result
}

import type { EditorV6TimelineBlock } from './editorV6'
import { editorV6CardRoles, emptyEditorV6CardComponents, editorV6CardContextSchema, type EditorV6UnifiedCard } from './editorV6Cards'

/** Pair overlapping legacy clips of different roles without cutting or duplicating their schedules. */
export function migrateEditorV6CardBlocks(blocks: EditorV6TimelineBlock[]): EditorV6TimelineBlock[] {
  type Pending = EditorV6TimelineBlock & { videoCard: EditorV6UnifiedCard; roles: Set<string> }
  const groups = new Map<string, Pending[]>()
  for (const block of blocks) {
    const card = block.videoCard
    if (!card || 'components' in card) continue
    const role = card.position === 'top' ? 'temporal' : 'portuguese'
    const end = block.startFrame + block.durationFrames
    const candidates = groups.get(card.videoBlockId) ?? []
    const partner = candidates.find(candidate => !candidate.roles.has(role) &&
      candidate.startFrame < end && block.startFrame < candidate.startFrame + candidate.durationFrames)
    const start = Math.min(block.startFrame, partner?.startFrame ?? block.startFrame)
    const durationFrames = Math.max(end, partner ? partner.startFrame + partner.durationFrames : end) - start
    const components = emptyEditorV6CardComponents(durationFrames)
    if (partner) for (const existingRole of editorV6CardRoles) {
      if (!partner.roles.has(existingRole)) continue
      const slot = partner.videoCard.components[existingRole]
      Object.assign(components[existingRole], slot, {
        startFrame: slot.startFrame + partner.startFrame - start,
        endFrame: slot.endFrame + partner.startFrame - start
      })
    }
    const timing = { enabled: true, startFrame: block.startFrame - start, endFrame: end - start }
    if (role === 'temporal') components.temporal = { ...timing, text: editorV6CardContextSchema.safeParse(card.text).data ?? 'Past' }
    else components.portuguese = { ...timing, text: card.text }
    const unified = {
      ...(partner ?? block), startFrame: start, durationFrames,
      roles: new Set([...(partner?.roles ?? []), role]),
      videoCard: { videoBlockId: card.videoBlockId,
        fallbackLayout: partner?.videoCard.fallbackLayout ?? card.fallbackLayout,
        aspect: partner?.videoCard.aspect ?? card.aspect, components }
    }
    if (partner) candidates[candidates.indexOf(partner)] = unified
    else candidates.push(unified)
    groups.set(card.videoBlockId, candidates)
  }
  if (!groups.size) return blocks
  const migrated = new Map([...groups.values()].flat().map(({ roles: _roles, ...block }) => [block.id, block]))
  return blocks.flatMap(block => {
    if (!block.videoCard || 'components' in block.videoCard) return [block]
    const replacement = migrated.get(block.id)
    return replacement ? [replacement] : []
  })
}

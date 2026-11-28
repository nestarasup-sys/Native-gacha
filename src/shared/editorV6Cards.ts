import { z } from 'zod'
import type { EditorV6Document, EditorV6TimelineBlock, EditorV6VideoLayout } from './editorV6'
import { EDITOR_V6_TIMELINE_FPS, secondsToFrame } from './editorV6Timing.ts'

export const editorV6CardRoles = ['temporal', 'english', 'portuguese'] as const
export type EditorV6CardRole = typeof editorV6CardRoles[number]
export const editorV6CardContextSchema = z.enum(['Past', 'Future', 'Indecipherable'])
const cardText = z.string().max(240)
const frame = z.number().int().min(0).max(1_000_000)
const component = { enabled: z.boolean(), startFrame: frame, endFrame: frame.positive() }
export const editorV6CardComponentsSchema = z.object({
  temporal: z.object({ ...component, text: editorV6CardContextSchema }),
  english: z.object({ ...component, text: cardText }),
  portuguese: z.object({ ...component, text: cardText })
}).superRefine((slots, ctx) => {
  for (const role of editorV6CardRoles) {
    if (slots[role].endFrame <= slots[role].startFrame)
      ctx.addIssue({ code: 'custom', path: [role, 'endFrame'], message: 'O componente precisa ocupar pelo menos um quadro.' })
  }
})

export type EditorV6CardComponents = z.infer<typeof editorV6CardComponentsSchema>
type CardLink = { videoBlockId: string; fallbackLayout?: EditorV6VideoLayout; aspect?: number }
export type EditorV6UnifiedCard = CardLink & { components: EditorV6CardComponents }
export type EditorV6LegacyCard = CardLink & { position: 'top' | 'bottom'; text: string }

const seconds = z.number().finite().min(0).max(1_000_000 / EDITOR_V6_TIMELINE_FPS)
const scriptTiming = { startSeconds: seconds, endSeconds: seconds }
const scriptComponent = { ...scriptTiming, enabled: z.boolean().default(true) }
export const editorV6ScriptCardSchema = z.object({
  ...scriptTiming,
  temporal: z.object({ ...scriptComponent, text: editorV6CardContextSchema }).strict().optional(),
  english: z.object({ ...scriptComponent, text: cardText }).strict().optional(),
  portuguese: z.object({ ...scriptComponent, text: cardText }).strict().optional()
}).strict().superRefine((card, ctx) => {
  const start = secondsToFrame(card.startSeconds), end = secondsToFrame(card.endSeconds)
  if (end <= start || !editorV6CardRoles.some(role => card[role]))
    ctx.addIssue({ code: 'custom', message: 'O bloco de card precisa de um intervalo positivo e pelo menos um componente.' })
  for (const role of editorV6CardRoles) {
    const item = card[role]
    if (!item) continue
    const from = secondsToFrame(item.startSeconds), to = secondsToFrame(item.endSeconds)
    if (from < start || to > end || to <= from)
      ctx.addIssue({ code: 'custom', path: [role], message: 'O intervalo do componente precisa caber no bloco e ocupar pelo menos um quadro.' })
  }
})
export type EditorV6ScriptCard = z.infer<typeof editorV6ScriptCardSchema>

export function emptyEditorV6CardComponents(endFrame: number): EditorV6CardComponents {
  const timing = { startFrame: 0, endFrame, enabled: false }
  return {
    temporal: { ...timing, text: 'Past' },
    english: { ...timing, text: '' },
    portuguese: { ...timing, text: '' }
  }
}

export function editorV6CardSegment(card: EditorV6TimelineBlock['videoCard'], from: number, to: number) {
  if (!card) return undefined
  if (!('components' in card)) return { ...card }
  const segment = <T extends EditorV6CardComponents[EditorV6CardRole]>(item: T): T => {
    const startFrame = Math.max(item.startFrame, from) - from
    const endFrame = Math.min(item.endFrame, to) - from
    return endFrame > startFrame
      ? { ...item, startFrame, endFrame }
      : { ...item, startFrame: 0, endFrame: to - from, enabled: false }
  }
  const { temporal, english, portuguese } = card.components
  return { ...card, components: { temporal: segment(temporal), english: segment(english), portuguese: segment(portuguese) } }
}

export function editorV6CardMatchesVideo(card: CardLink, video: EditorV6TimelineBlock) {
  return card.videoBlockId === video.id || card.videoBlockId === video.videoCardOriginBlockId
}

/** Create a new block at the playhead on the destination video's card track. */
export function pasteEditorV6CardBlock(document: EditorV6Document, source: EditorV6TimelineBlock, frame: number, id: string) {
  if (!source.videoCard || frame >= 1_000_000) return
  const track = document.timeline.tracks.find(item => item.kind === 'card')
  if (!track || track.locked) return
  const video = document.timeline.tracks.filter(item => item.kind === 'video' && !item.hidden && !item.muted)
    .flatMap(item => item.blocks)
    .filter(item => item.mediaId && frame >= item.startFrame && frame < item.startFrame + item.durationFrames)
    .sort((a, b) => b.startFrame - a.startFrame || b.id.localeCompare(a.id))[0]
  if (!video) return
  const { fallbackLayout: _layout, aspect: _aspect, ...card } = structuredClone(source.videoCard)
  const block = { ...source, id, startFrame: frame, durationFrames: Math.min(source.durationFrames, 1_000_000 - frame),
    videoCard: { ...card, videoBlockId: video.id } }
  const timeline = {
    ...document.timeline,
    durationFrames: Math.max(document.timeline.durationFrames, frame + block.durationFrames),
    tracks: document.timeline.tracks.map(item => item.id === track.id ? { ...item, blocks: [...item.blocks, block] } : item)
  }
  return { timeline, block }
}

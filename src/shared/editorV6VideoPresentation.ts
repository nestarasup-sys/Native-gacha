import { z } from 'zod'
import { EDITOR_V6_TIMELINE_FPS, secondsToFrame } from './editorV6Timing.ts'

import { editorV6ScriptCardSchema } from './editorV6Cards.ts'

export const EDITOR_V6_VIDEO_LOADING_FRAMES = 3 * EDITOR_V6_TIMELINE_FPS
const cardInterval = { startSeconds: z.number().finite().min(0).max(33333), endSeconds: z.number().finite().positive().max(33333) }
const schedule = <T extends z.ZodTypeAny>(value: T) => z.array(z.object({ ...cardInterval, text: value }).strict()).max(1000)
  .superRefine((items, context) => {
    const ordered = [...items].sort((a, b) => a.startSeconds - b.startSeconds)
    ordered.forEach((item, index) => {
      if (item.endSeconds <= item.startSeconds || (index > 0 && item.startSeconds < ordered[index - 1].endSeconds))
        context.addIssue({ code: 'custom', message: 'Os intervalos dos cards devem ter duração positiva e não podem se sobrepor.' })
    })
  })
export const editorV6VideoPresentationSchema = z.object({
  bottomCard: z.string().trim().min(1).max(240).optional(),
  timeCard: z.enum(['Past', 'Future', 'Indecipherable']).optional(),
  bottomCards: schedule(z.string().trim().min(1).max(240)).optional(),
  timeCards: schedule(z.enum(['Past', 'Future', 'Indecipherable'])).optional(),
  cards: z.array(editorV6ScriptCardSchema).max(1000).optional(),
  loadingGif: z.boolean().optional()
}).strict().refine(value => !(value.bottomCard && value.bottomCards) && !(value.timeCard && value.timeCards)
  && !(value.cards && (value.timeCard || value.timeCards || value.bottomCard || value.bottomCards)),
  'Use o card fixo ou a lista de intervalos para cada posição.')

/** New script imports must not silently accept intervals that cannot occupy a timeline frame. */
export const editorV6VideoPresentationImportSchema = editorV6VideoPresentationSchema.superRefine((presentation, context) => {
  for (const items of [presentation.bottomCards, presentation.timeCards]) {
    items?.forEach((item, index) => {
      if (secondsToFrame(item.endSeconds) <= secondsToFrame(item.startSeconds))
        context.addIssue({ code: 'custom', path: [presentation.bottomCards === items ? 'bottomCards' : 'timeCards', index],
          message: 'Cada intervalo de card precisa ocupar pelo menos um quadro da timeline (30 fps).' })
    })
  }
})

export type EditorV6VideoPresentation = z.infer<typeof editorV6VideoPresentationSchema>

export function hasEditorV6VideoCards(presentation?: EditorV6VideoPresentation): boolean {
  return Boolean(presentation?.cards?.length || presentation?.bottomCard || presentation?.timeCard || presentation?.bottomCards?.length || presentation?.timeCards?.length)
}

export function resolveEditorV6VideoCards(presentation: EditorV6VideoPresentation, relativeFrame: number) {
  const active = <T extends string>(items?: Array<{ startSeconds: number; endSeconds: number; text: T }>): T | undefined =>
    items?.find(item => relativeFrame >= secondsToFrame(item.startSeconds)
      && relativeFrame < secondsToFrame(item.endSeconds))?.text
  return { bottomCard: presentation.bottomCards ? active(presentation.bottomCards) : presentation.bottomCard,
    timeCard: presentation.timeCards ? active(presentation.timeCards) : presentation.timeCard }
}

/** The supplied 360 × 120 GIF has four frames of 300 ms each. */
export function editorV6LoadingGifFrame(elapsedFrames: number): number {
  return Math.floor(elapsedFrames / (EDITOR_V6_TIMELINE_FPS * 0.3)) % 4
}

/** Size of the visible, aspect-fitted video before local rotation. */
export function editorV6CardVideoSize(boxWidth: number, boxHeight: number, aspect?: number, evenPixels = false) {
  const width = aspect ? Math.min(boxWidth, boxHeight * aspect) : boxWidth
  const height = aspect ? Math.min(boxHeight, boxWidth / aspect) : boxHeight
  const even = (value: number) => Math.max(2, Math.floor(value / 2) * 2)
  return evenPixels ? { width: even(width), height: even(height) } : { width, height }
}

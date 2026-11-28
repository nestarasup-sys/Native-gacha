import { z } from 'zod'
import { orderedEditorV6TimelineBlocks } from './editorV6TimelineCore'
import { secondsToFrame } from './editorV6Timing.ts'
import type { EditorV6Document, EditorV6Element, EditorV6TimelineBlock, EditorV6TimelineTrack } from './editorV6'
import { isValidCustomizerFaceAppearance } from './customizerValidation.ts'
import { isSceneFaceExpressionEffects, isSceneFaceTransforms } from './sceneFaceValidation.ts'
import type { CustomizerFaceAppearance } from './customizer'
import type { SceneFaceTransforms } from './sceneFaceValidation'
import type { FaceExpressionEffects } from './fabricator'

export const EDITOR_V6_INTRO_CHARACTER_SECONDS = 8
export const EDITOR_V6_INTRO_BLACK_SECONDS = 3.5
const text = z.string().trim().min(1).max(800)
const reference = z.string().trim().min(1).max(120)
const seconds = z.number().finite().min(0).max(33_333)
const duration = seconds.gt(0).optional()
export const EDITOR_V6_INTRO_PORTRAIT_DEFAULTS = {
  x: -25, y: 0, characterScale: 100, characterWidthScale: 100, characterHeightScale: 100,
  rotation: 0, zIndex: 0, positionLocked: false
}
const scale = z.number().min(1).max(300)
const coordinate = z.number().min(-100).max(100)
const portraitLayout = z.object({
  x: coordinate, y: coordinate, characterScale: scale, characterWidthScale: scale, characterHeightScale: scale,
  rotation: z.number().min(-180).max(180), zIndex: z.union([z.literal(0), z.literal(1)]),
  positionLocked: z.boolean()
}).partial().strict()

const introFace = z.object({
  faceAppearance: z.custom<CustomizerFaceAppearance>(isValidCustomizerFaceAppearance).optional(),
  faceTransforms: z.custom<SceneFaceTransforms>(isSceneFaceTransforms).optional(),
  expressionBase: z.object({ appearance: z.custom<CustomizerFaceAppearance>(isValidCustomizerFaceAppearance), transforms: z.custom<SceneFaceTransforms>(isSceneFaceTransforms) }).optional(),
  activeExpressionEffects: z.custom<FaceExpressionEffects>(isSceneFaceExpressionEffects).optional(),
  activeExpressionGaze: z.enum(['left', 'right']).optional(),
  activeExpressionCollectionId: reference.optional(),
  activeFaceMode: z.enum(['idle', 'blink', 'talk']).optional(),
  characterCanvasWidth: z.number().positive().optional()
}).strict()

export const editorV6ReactIntroSchema = z.array(z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('character'),
    character: reference,
    startSeconds: seconds.optional(),
    durationSeconds: duration,
    parts: z.array(z.object({
      startSeconds: seconds,
      text,
      englishText: text,
      expression: reference.nullable().optional(),
      face: introFace.optional(),
      poseSlot: z.number().int().min(1).max(999).nullable().optional(),
      poseCategory: z.string().trim().min(1).max(32).optional(),
      flipX: z.boolean().optional(),
      portraitLayout: portraitLayout.optional()
    }).strict().superRefine((part, context) => {
      if (part.poseCategory !== undefined && part.poseSlot !== undefined) context.addIssue({
        code: 'custom', path: ['poseCategory'], message: 'Use poseCategory ou poseSlot na mesma parte da Intro, não ambos.'
      })
    })).min(1).max(100)
  }).strict(),
  z.object({ kind: z.literal('black'), startSeconds: seconds.optional(), durationSeconds: duration, text }).strict()
])).min(1).max(1000).superRefine((entries, context) => {
  let end = 0
  let blocks = 0
  entries.forEach((entry, index) => {
    const start = entry.startSeconds === undefined ? end : secondsToFrame(entry.startSeconds)
    const duration = editorV6IntroDurationFrames(entry)
    if (start < end) context.addIssue({ code: 'custom', path: [index, 'startSeconds'], message: 'A Intro deve seguir a ordem da lista, sem sobreposição.' })
    end = start + duration
    blocks += entry.kind === 'character' ? entry.parts.length : 1
    if (entry.kind !== 'character') return
    let previous = -1
    entry.parts.forEach((part, partIndex) => {
      const frame = secondsToFrame(part.startSeconds)
      if ((partIndex === 0 && frame !== 0) || frame <= previous || frame >= duration) context.addIssue({
        code: 'custom', path: [index, 'parts', partIndex, 'startSeconds'],
        message: 'A primeira parte começa em 0. As seguintes precisam aumentar pelo menos um quadro e começar antes do fim da apresentação.'
      })
      previous = frame
    })
  })
  if (blocks > 1000 || end >= 1_000_000) context.addIssue({ code: 'custom', message: 'A Intro excede o limite de quadros ou de 1.000 blocos.' })
})

export function editorV6IntroDurationFrames(entry: { kind: 'character' | 'black'; durationSeconds?: number }): number {
  const fallback = entry.kind === 'character' ? EDITOR_V6_INTRO_CHARACTER_SECONDS : EDITOR_V6_INTRO_BLACK_SECONDS
  return Math.max(1, secondsToFrame(entry.durationSeconds ?? fallback))
}

export const editorV6IntroClipSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('character'),
    characterId: reference,
    assetId: z.string().uuid(),
    faceModeAssetIds: z.object({
      idle: z.string().uuid().optional(), blink: z.string().uuid().optional(),
      talk: z.string().uuid().optional(), 'talk-blink': z.string().uuid().optional()
    }).optional(),
    portraitAspect: z.number().finite().positive().optional(),
    faceRendererVersion: z.number().int().positive().optional(),
    portraitFrame: z.object({ x: z.number().finite(), y: z.number().finite(),
      width: z.number().finite().positive(), height: z.number().finite().positive() }).strict().optional(),
    text,
    englishText: text,
    expression: reference.optional(),
    poseSlot: z.number().int().min(1).max(999).nullable().optional(),
    face: introFace.optional(),
    flipX: z.boolean(),
    portraitLayout: portraitLayout.optional()
  }).strict(),
  z.object({ kind: z.literal('black'), text }).strict()
])

export type EditorV6IntroClip = z.infer<typeof editorV6IntroClipSchema>
export type EditorV6ReactIntro = z.infer<typeof editorV6ReactIntroSchema>
export type EditorV6IntroPortraitUpdate = Partial<typeof EDITOR_V6_INTRO_PORTRAIT_DEFAULTS> & { flipX?: boolean }

export function resolveEditorV6IntroPortrait(intro: Extract<EditorV6IntroClip, { kind: 'character' }>) {
  return { ...EDITOR_V6_INTRO_PORTRAIT_DEFAULTS, ...intro.portraitLayout, flipX: intro.flipX }
}

export function editorV6IntroPortraitAssetIds(intro: EditorV6IntroClip | undefined): string[] {
  return intro?.kind === 'character' ? [intro.assetId, ...Object.values(intro.faceModeAssetIds ?? {}).filter((id): id is string => Boolean(id))] : []
}

export function editorV6IntroFittedSize(aspect?: number) {
  return {
    width: (aspect ? Math.min(848, 984 * aspect) : 848) / 19.2,
    height: (aspect ? Math.min(984, 848 / aspect) : 984) / 10.8
  }
}

export function editorV6IntroCharacterElement(block: EditorV6TimelineBlock, elementId = block.id): EditorV6Element | undefined {
  const intro = block.intro
  if (intro?.kind !== 'character') return
  const fit = editorV6IntroFittedSize(intro.portraitAspect)
  const layout = resolveEditorV6IntroPortrait(intro)
  const frame = intro.portraitFrame
  const angle = layout.rotation * Math.PI / 180
  const dx = (frame?.x ?? 0) * 19.2 * layout.characterScale * layout.characterWidthScale / 10_000 * (layout.flipX ? -1 : 1)
  const dy = (frame?.y ?? 0) * 10.8 * layout.characterScale * layout.characterHeightScale / 10_000
  return {
    ...intro.face, ...layout, faceRendererVersion: intro.faceRendererVersion,
    x: layout.x + (dx * Math.cos(angle) - dy * Math.sin(angle)) / 19.2,
    y: layout.y + (dx * Math.sin(angle) + dy * Math.cos(angle)) / 10.8,
    id: elementId, kind: 'character', characterId: intro.characterId,
    assetId: intro.assetId, faceModeAssetIds: intro.faceModeAssetIds, text: block.label,
    width: frame?.width ?? fit.width, height: frame?.height ?? fit.height, poseSlot: intro.poseSlot,
    activeExpressionPresetId: intro.expression ?? null
  }
}

/** Publish a new raster rectangle without changing the authored Intro controls. */
export function editorV6IntroFrameFromGeometry(
  intro: Extract<EditorV6IntroClip, { kind: 'character' }>, before: EditorV6Element, after: EditorV6Element
) {
  const layout = resolveEditorV6IntroPortrait(intro)
  const angle = layout.rotation * Math.PI / 180
  const dx = (after.x - before.x) * 19.2, dy = (after.y - before.y) * 10.8
  return {
    x: (intro.portraitFrame?.x ?? 0) + (dx * Math.cos(angle) + dy * Math.sin(angle)) / 19.2
      / (layout.characterScale * layout.characterWidthScale / 10_000) * (layout.flipX ? -1 : 1),
    y: (intro.portraitFrame?.y ?? 0) + (-dx * Math.sin(angle) + dy * Math.cos(angle)) / 10.8
      / (layout.characterScale * layout.characterHeightScale / 10_000),
    width: after.width, height: after.height
  }
}

const introCharacterTracks = new WeakMap<EditorV6TimelineTrack, ReadonlyMap<string, EditorV6Element>>()

/** Adjacent parts of one presentation share the first block's UUID as their actor ID. */
export function editorV6IntroCharacterTrack(track: EditorV6TimelineTrack): ReadonlyMap<string, EditorV6Element> {
  const cached = introCharacterTracks.get(track)
  if (cached) return cached
  const states = new Map<string, EditorV6Element>()
  let previous: EditorV6TimelineBlock | undefined
  let elementId: string | undefined
  for (const block of orderedEditorV6TimelineBlocks(track.blocks)) {
    const contiguous = previous?.intro?.kind === 'character' && block.intro?.kind === 'character'
      && previous.intro.characterId === block.intro.characterId
      && previous.startFrame + previous.durationFrames === block.startFrame
    if (!contiguous) elementId = block.id
    const state = editorV6IntroCharacterElement(block, elementId)
    if (state) states.set(block.id, state)
    previous = block
  }
  introCharacterTracks.set(track, states)
  return states
}

export function replicateEditorV6IntroPortrait(
  document: EditorV6Document, id: string,
  property: 'characterScale' | 'characterWidthScale' | 'characterHeightScale' | 'position' | 'rotation' | 'flipX'
): EditorV6Document {
  const source = document.timeline.tracks.find(track => track.kind === 'intro' && track.blocks.some(block => block.id === id))
  const intro = source?.blocks.find(block => block.id === id)?.intro
  if (source?.locked || intro?.kind !== 'character') return document
  const values = resolveEditorV6IntroPortrait(intro)
  const tracks = document.timeline.tracks.map(track => {
    if (track.kind !== 'intro' || track.locked) return track
    return { ...track, blocks: track.blocks.map(block => {
      const target = block.intro
      if (target?.kind !== 'character') return block
      if (property === 'flipX') return { ...block, intro: { ...target, flipX: values.flipX } }
      const patch = property === 'position' ? { x: values.x, y: values.y } : { [property]: values[property] }
      return { ...block, intro: { ...target, portraitLayout: { ...target.portraitLayout, ...patch } } }
    }) }
  })
  return { ...document, timeline: { ...document.timeline, tracks } }
}

/** A character keeps its framing across its Intro blocks, independently of the main scene. */
export function updateEditorV6IntroPortrait(document: EditorV6Document, id: string, values: EditorV6IntroPortraitUpdate): EditorV6Document {
  const source = document.timeline.tracks.find(track => track.kind === 'intro' && track.blocks.some(block => block.id === id))
  const target = source?.blocks.find(block => block.id === id)?.intro
  if (source?.locked || target?.kind !== 'character') return document
  const { flipX, ...layout } = values
  const checked = portraitLayout.safeParse(layout)
  if (!checked.success) return document
  const tracks = document.timeline.tracks.map(track => track.kind === 'intro' && !track.locked ? {
    ...track,
    blocks: track.blocks.map(block => {
      const intro = block.intro
      if (intro?.kind !== 'character' || intro.characterId !== target.characterId) return block
      return { ...block, intro: {
        ...intro, flipX: flipX ?? intro.flipX,
        ...(Object.keys(checked.data).length ? { portraitLayout: { ...intro.portraitLayout, ...checked.data } } : {})
      } }
    })
  } : track)
  return { ...document, timeline: { ...document.timeline, tracks } }
}

export function updateEditorV6IntroText(document: EditorV6Document, id: string, field: 'text' | 'englishText', value: string): EditorV6Document {
  const checked = text.safeParse(value)
  if (!checked.success) return document
  const tracks = document.timeline.tracks.map(track => {
    if (track.kind !== 'intro' || track.locked) return track
    const blocks = track.blocks.map(block => {
      const intro = block.intro
      if (block.id !== id || !intro) return block
      if (intro.kind === 'character') return { ...block, intro: { ...intro, [field]: checked.data } }
      if (field === 'text') return { ...block, label: 'Tela preta · ' + checked.data.slice(0, 100), intro: { ...intro, text: checked.data } }
      return block
    })
    return { ...track, blocks }
  })
  return { ...document, timeline: { ...document.timeline, tracks } }
}

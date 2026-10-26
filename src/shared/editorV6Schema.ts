import { z } from 'zod'
import type { EditorV6Asset, EditorV6Document, EditorV6Element } from './editorV6'
import { isValidCustomizerFaceAppearance } from './customizerValidation'
import { isEditorV6ExpressionEffects, isEditorV6FaceTransforms } from './editorV6'

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
const finite = z.number().finite()

export const editorV6AssetSchema = z.object({
  id: uuid,
  category: z.enum(['background', 'object', 'character']),
  name: z.string().max(255),
  mimeType: z.enum(['image/png', 'image/jpeg', 'image/webp']),
  dataUrl: z.string().max(70_000_000)
}).superRefine((asset, context) => {
  if (!asset.dataUrl.startsWith(`data:${asset.mimeType};base64,`)) {
    context.addIssue({ code: 'custom', path: ['dataUrl'], message: 'O conteúdo da imagem não corresponde ao formato declarado.' })
  }
})

const editorV6ElementSchema = z.object({
  id: uuid,
  kind: z.enum(['image', 'character', 'narrator', 'speech', 'thought']),
  assetId: z.string().optional(),
  characterId: z.string().optional(),
  characterSourceUpdatedAt: z.string().datetime().optional(),
  flipX: z.boolean().optional(),
  positionLocked: z.boolean().optional(),
  faceAppearance: z.custom(isValidCustomizerFaceAppearance).optional(),
  activeFaceMode: z.enum(['idle', 'blink', 'talk']).optional(),
  faceTransforms: z.custom(isEditorV6FaceTransforms).optional(),
  expressionBase: z.object({
    appearance: z.custom(isValidCustomizerFaceAppearance),
    transforms: z.custom(isEditorV6FaceTransforms)
  }).optional(),
  activeExpressionGaze: z.enum(['right', 'left']).optional(),
  activeExpressionPresetId: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/).nullable().optional(),
  activeExpressionPresetUpdatedAt: z.string().datetime().optional(),
  faceRendererVersion: z.number().int().optional(),
  activeExpressionEffects: z.custom(isEditorV6ExpressionEffects).optional(),
  activeExpressionCollectionId: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/).optional(),
  poseSlot: z.number().int().nullable().optional(),
  characterScale: finite.optional(),
  characterWidthScale: finite.optional(),
  characterHeightScale: finite.optional(),
  characterCanvasWidth: finite.optional(),
  text: z.string(),
  x: finite,
  y: finite,
  width: finite,
  height: finite,
  rotation: finite,
  zIndex: finite
}).passthrough()

const editorV6TimelineTrackSchema = z.object({
  id: uuid,
  kind: z.enum(['character', 'speech', 'thought', 'visual', 'video', 'audio']),
  name: z.string().trim().min(1).max(80),
  muted: z.boolean(),
  locked: z.boolean(),
  blocks: z.array(z.object({
    id: uuid,
    elementId: uuid.optional(),
    label: z.string().max(120),
    startFrame: z.number().int().min(0).max(1_000_000),
    durationFrames: z.number().int().min(1).max(1_000_000)
  })).max(1000)
}).passthrough()

export const editorV6DocumentSchema = z.object({
  schemaVersion: z.literal(1),
  id: uuid,
  title: z.string().trim().min(1).max(100),
  color: z.string().regex(/^(#[0-9a-f]{6}|hsl\([\d.]+\s+[\d.]+%\s+[\d.]+%\))$/i),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  backgroundColor: z.string().regex(/^#[0-9a-f]{6}$/i),
  backgroundAssetId: z.string().nullable(),
  backgroundX: finite,
  backgroundY: finite,
  backgroundWidth: finite,
  backgroundHeight: finite,
  backgroundRotation: finite,
  thumbnailDataUrl: z.string().max(1_500_000).regex(/^data:image\/(jpeg|png);base64,/).optional(),
  assets: z.array(editorV6AssetSchema).max(500),
  elements: z.array(editorV6ElementSchema).max(1000),
  timeline: z.object({
    fps: z.literal(30),
    durationFrames: z.number().int().min(1).max(1_000_000),
    tracks: z.array(editorV6TimelineTrackSchema).max(200)
  })
}).superRefine((document, context) => {
  const assetsById = new Map(document.assets.map((asset) => [asset.id, asset]))
  if (document.backgroundAssetId) {
    const background = assetsById.get(document.backgroundAssetId)
    if (!background || background.category !== 'background') {
      context.addIssue({ code: 'custom', path: ['backgroundAssetId'], message: 'A imagem de fundo precisa existir na biblioteca do projeto.' })
    }
  }
  document.elements.forEach((element, index) => {
    if (element.kind === 'image') {
      const asset = element.assetId ? assetsById.get(element.assetId) : undefined
      if (!asset || asset.category !== 'object') context.addIssue({ code: 'custom', path: ['elements', index, 'assetId'], message: 'O objeto precisa apontar para uma imagem do projeto.' })
    }
    if (element.kind === 'character') {
      const asset = element.assetId ? assetsById.get(element.assetId) : undefined
      if (!element.characterId || !asset || asset.category !== 'character') context.addIssue({ code: 'custom', path: ['elements', index], message: 'O personagem precisa apontar para uma imagem e um personagem de origem.' })
    }
  })
  const elementIds = new Set(document.elements.map((element) => element.id))
  document.timeline.tracks.forEach((track, trackIndex) => {
    track.blocks.forEach((block, blockIndex) => {
      if (block.elementId && !elementIds.has(block.elementId)) {
        context.addIssue({ code: 'custom', path: ['timeline', 'tracks', trackIndex, 'blocks', blockIndex, 'elementId'], message: 'O bloco aponta para uma camada que não existe mais.' })
      }
      if (block.startFrame + block.durationFrames > document.timeline.durationFrames) {
        context.addIssue({ code: 'custom', path: ['timeline', 'tracks', trackIndex, 'blocks', blockIndex], message: 'O bloco ultrapassa a duração da timeline.' })
      }
    })
  })
})

export function isEditorV6Document(value: unknown): value is EditorV6Document {
  return editorV6DocumentSchema.safeParse(value).success
}

export function isEditorV6Asset(value: unknown): value is EditorV6Asset {
  return editorV6AssetSchema.safeParse(value).success
}

export function parseEditorV6Document(value: unknown): EditorV6Document {
  return editorV6DocumentSchema.parse(value) as EditorV6Document
}

export function parseEditorV6Element(value: unknown): EditorV6Element {
  return editorV6ElementSchema.parse(value) as EditorV6Element
}

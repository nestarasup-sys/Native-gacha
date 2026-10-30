import { z } from 'zod'
import type { EditorV6Asset, EditorV6Document, EditorV6Element } from './editorV6'
import { isValidCustomizerFaceAppearance } from './customizerValidation'
import { isEditorV6ExpressionEffects, isEditorV6FaceTransforms } from './editorV6'
import type { EditorV6MotionBakeRequest } from './editorV6Motion'

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
const finite = z.number().finite()
export const editorV6ExportAudioSchema = z.object({
  id: uuid, name: z.string().min(1).max(255),
  fileName: z.string().regex(/^[0-9a-f-]{36}\.(mp3|wav|m4a|aac|ogg|flac|opus|webm)$/i),
  sourceFrames: z.number().int().min(1).max(1_000_000),
  startFrame: z.number().int().min(0).max(1_000_000),
  sourceInFrame: z.number().int().min(0).max(1_000_000),
  durationFrames: z.number().int().min(1).max(1_000_000), gain: z.number().finite().min(0).max(2), muted: z.boolean()
}).refine((clip) => clip.sourceInFrame + clip.durationFrames <= clip.sourceFrames, 'O trecho de áudio ultrapassa o arquivo de origem.')

export const editorV6AssetSchema = z.object({
  id: uuid,
  category: z.enum(['background', 'object', 'character']),
  name: z.string().max(255),
  mimeType: z.enum(['image/png', 'image/jpeg', 'image/webp']),
  dataUrl: z.string().max(70_000_000),
  timelineSnapshot: z.boolean().optional()
}).superRefine((asset, context) => {
  if (!asset.dataUrl.startsWith(`data:${asset.mimeType};base64,`)) {
    context.addIssue({ code: 'custom', path: ['dataUrl'], message: 'O conteúdo da imagem não corresponde ao formato declarado.' })
  }
})

export const editorV6MediaAssetSchema = z.object({
  id: uuid,
  name: z.string().min(1).max(255),
  fileName: z.string().regex(/^[0-9a-f-]{36}\.(mp4|webm|mov|m4v|mp3|wav|m4a|aac|ogg|flac|opus)$/i),
  libraryVideoId: uuid.optional(),
  kind: z.enum(['video', 'audio']),
  mimeType: z.enum(['video/mp4', 'video/webm', 'video/quicktime', 'video/x-m4v', 'audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/aac', 'audio/ogg', 'audio/flac', 'audio/opus', 'audio/webm']),
  sourceFrames: z.number().int().min(1).max(1_000_000),
  hasAudio: z.boolean(),
  width: z.number().int().positive().max(16384).optional(),
  height: z.number().int().positive().max(16384).optional(),
  sizeBytes: z.number().int().min(1).max(5 * 1024 ** 3)
}).superRefine((media, context) => {
  if (media.fileName.split('.')[0].toLowerCase() !== media.id.toLowerCase()) context.addIssue({ code: 'custom', path: ['fileName'], message: 'O nome seguro do arquivo precisa corresponder ao ID da mídia.' })
  if (media.libraryVideoId && (media.kind !== 'video' || media.id !== media.libraryVideoId || !media.mimeType.startsWith('video/'))) context.addIssue({ code: 'custom', path: ['libraryVideoId'], message: 'A referência da Base de vídeos precisa identificar um vídeo compatível.' })
  if (media.kind === 'video' && !media.mimeType.startsWith('video/')) context.addIssue({ code: 'custom', path: ['mimeType'], message: 'O tipo de mídia não corresponde ao vídeo.' })
  if (media.kind === 'audio' && !media.mimeType.startsWith('audio/')) context.addIssue({ code: 'custom', path: ['mimeType'], message: 'O tipo de mídia não corresponde ao áudio.' })
})

const editorV6ElementSchema = z.object({
  id: uuid,
  motionSprite: z.never().optional(),
  visible: z.boolean().optional(),
  kind: z.enum(['image', 'character', 'narrator', 'speech', 'thought']),
  assetId: z.string().optional(),
  characterId: z.string().optional(),
  characterSourceUpdatedAt: z.string().datetime().optional(),
  modelSourceRevision: z.string().max(80).optional(),
  poseSourceRevision: z.string().max(80).optional(),
  flipX: z.boolean().optional(),
  positionLocked: z.boolean().optional(),
  faceAppearance: z.custom(isValidCustomizerFaceAppearance).optional(),
  activeFaceMode: z.enum(['idle', 'blink', 'talk']).optional(),
  faceModeAssetIds: z.object({ idle: uuid.optional(), blink: uuid.optional(), talk: uuid.optional(), 'talk-blink': uuid.optional() }).optional(),
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

const editorV6BackgroundSchema = z.object({
  backgroundColor: z.string().regex(/^#[0-9a-f]{6}$/i),
  backgroundAssetId: uuid.nullable(),
  backgroundX: finite, backgroundY: finite,
  backgroundWidth: finite, backgroundHeight: finite, backgroundRotation: finite
})

const motionSpriteSchema = z.object({ x: z.number().int().min(0), y: z.number().int().min(0), width: z.number().int().min(1), height: z.number().int().min(1), atlasWidth: z.number().int().min(1).max(8192), atlasHeight: z.number().int().min(1).max(8192) }).refine((rect) => rect.x + rect.width <= rect.atlasWidth && rect.y + rect.height <= rect.atlasHeight && rect.atlasWidth * rect.atlasHeight <= 8_100_000, 'Recorte de atlas inválido.')
export const editorV6MotionAtlasSchema = z.object({ version: z.literal(1), key: z.string().max(65536), assetId: uuid, frames: z.array(z.object({ offset: z.number().int().min(-7).max(-1), sprite: motionSpriteSchema, x: finite, y: finite, width: finite.positive(), height: finite.positive(), rotation: finite, flipX: z.boolean() })).min(1).max(7) })
export const editorV6MotionResultSchema = z.object({ asset: editorV6AssetSchema, motion: editorV6MotionAtlasSchema, metrics: z.object({ milliseconds: finite.min(0), preparedRigs: z.number().int().min(1).max(9), samples: z.number().int().min(1).max(7), atlasPixels: z.number().int().min(1).max(8_100_000) }) }).refine((result) => result.asset.id === result.motion.assetId && result.asset.category === 'character' && result.asset.mimeType === 'image/png', 'Atlas de animação inválido.')
export function parseEditorV6MotionRequest(value: unknown): EditorV6MotionBakeRequest {
  return z.object({ id: uuid, character: z.object({ id: z.string(), customization: z.object({}).passthrough() }).passthrough(), plan: z.object({ blockId: uuid, elementId: uuid, characterId: z.string(), key: z.string().max(65536), startFrame: finite.min(0), endFrame: z.number().int().min(1).max(1_000_000), from: editorV6ElementSchema, to: editorV6ElementSchema, samples: z.array(z.object({ offset: z.number().int().min(-7).max(-1), progress: finite.gt(0).lt(1), faceMode: z.enum(['idle', 'blink', 'talk', 'talk-blink']).optional() })).min(1).max(7) }), mouthScaleSamples: z.array(finite.min(1).max(3)).min(1).max(7).optional(), maxAtlasPixels: z.number().int().min(64_000).max(8_000_000).optional() }).parse(value) as unknown as EditorV6MotionBakeRequest
}

const editorV6TimelineTrackSchema = z.object({
  id: uuid,
  kind: z.enum(['character', 'speech', 'thought', 'object', 'video', 'audio']),
  characterId: z.string().min(1).max(120).optional(),
  name: z.string().trim().min(1).max(80),
  muted: z.boolean(),
  locked: z.boolean(),
  hidden: z.boolean().optional(),
  collapsed: z.boolean().optional(),
  motionEnabled: z.boolean().optional(),
  blocks: z.array(z.object({
    id: uuid,
    elementId: uuid.optional(),
    label: z.string().max(120),
    startFrame: z.number().int().min(0).max(1_000_000),
    durationFrames: z.number().int().min(1).max(1_000_000),
    state: editorV6ElementSchema.optional(),
    background: editorV6BackgroundSchema.optional(),
    characterId: z.string().min(1).max(120).optional(),
    parentBlockId: uuid.optional(),
    relativeStartFrame: z.number().int().min(0).max(1_000_000).optional(),
    motionEnabled: z.boolean().optional(), incomingMotion: editorV6MotionAtlasSchema.optional(),
    mediaId: uuid.optional(), mediaLayout: z.object({ x: finite.min(-200).max(200), y: finite.min(-200).max(200), width: finite.min(1).max(200), height: finite.min(1).max(200), rotation: finite.min(-180).max(180) }).optional(), mediaInFrame: z.number().int().min(0).max(1_000_000).optional(), audioEnabled: z.boolean().optional(), gain: finite.min(0).max(2).optional()
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
  media: z.array(editorV6MediaAssetSchema).max(500).optional(),
  elements: z.array(editorV6ElementSchema).max(1000),
  exportAudio: z.array(editorV6ExportAudioSchema).max(32).optional(),
  timeline: z.object({
    fps: z.literal(30),
    durationFrames: z.number().int().min(1).max(1_000_000),
    tracks: z.array(editorV6TimelineTrackSchema).max(200),
    knownElementIds: z.array(uuid).max(1000).optional()
  })
}).superRefine((document, context) => {
  const assetsById = new Map(document.assets.map((asset) => [asset.id, asset]))
  const mediaById = new Map((document.media ?? []).map((media) => [media.id, media]))
  if (new Set((document.media ?? []).map((media) => media.id)).size !== (document.media ?? []).length) context.addIssue({ code: 'custom', path: ['media'], message: 'Os arquivos de mídia precisam ter identificadores únicos.' })
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
      if (!element.characterId) context.addIssue({ code: 'custom', path: ['elements', index, 'characterId'], message: 'O personagem precisa apontar para um personagem de origem.' })
      if (!asset || asset.category !== 'character') context.addIssue({ code: 'custom', path: ['elements', index, 'assetId'], message: 'A imagem base do personagem precisa existir na biblioteca do projeto.' })
    }
    for (const [mode, assetId] of Object.entries(element.faceModeAssetIds ?? {})) {
      const faceAsset = assetId ? assetsById.get(assetId) : undefined
      if (assetId && (!faceAsset || faceAsset.category !== 'character')) context.addIssue({ code: 'custom', path: ['elements', index, 'faceModeAssetIds', mode], message: 'A alternativa facial precisa apontar para uma imagem de personagem do projeto.' })
    }
  })
  const elementIds = new Set(document.elements.map((element) => element.id))
  const blocksById = new Map(document.timeline.tracks.flatMap((track) => track.blocks.map((block) => [block.id, { block, track }] as const)))
  const allBlockIds = document.timeline.tracks.flatMap((track) => track.blocks.map((block) => block.id))
  if (new Set(allBlockIds).size !== allBlockIds.length) context.addIssue({ code: 'custom', path: ['timeline'], message: 'Os blocos precisam ter identificadores únicos.' })
  document.timeline.tracks.forEach((track, trackIndex) => {
    track.blocks.forEach((block, blockIndex) => {
      if (block.elementId && !elementIds.has(block.elementId)) {
        context.addIssue({ code: 'custom', path: ['timeline', 'tracks', trackIndex, 'blocks', blockIndex, 'elementId'], message: 'O bloco aponta para uma camada que não existe mais.' })
      }
      if (block.startFrame + block.durationFrames > document.timeline.durationFrames) {
        context.addIssue({ code: 'custom', path: ['timeline', 'tracks', trackIndex, 'blocks', blockIndex], message: 'O bloco ultrapassa a duração da timeline.' })
      }
      if (block.state && (block.state.id !== block.elementId || !elementIds.has(block.state.id) || (block.state.assetId && !assetsById.has(block.state.assetId)))) {
        context.addIssue({ code: 'custom', path: ['timeline', 'tracks', trackIndex, 'blocks', blockIndex, 'state'], message: 'O estado do bloco precisa apontar para uma camada e imagem válidas.' })
      }
      for (const [mode, assetId] of Object.entries(block.state?.faceModeAssetIds ?? {})) {
        const faceAsset = assetsById.get(assetId)
        if (!faceAsset || faceAsset.category !== 'character') context.addIssue({ code: 'custom', path: ['timeline', 'tracks', trackIndex, 'blocks', blockIndex, 'state', 'faceModeAssetIds', mode], message: 'A alternativa facial precisa apontar para uma imagem de personagem do projeto.' })
      }
      if (block.background && (track.kind !== 'video' || block.elementId || block.state || (block.background.backgroundAssetId && assetsById.get(block.background.backgroundAssetId)?.category !== 'background'))) {
        context.addIssue({ code: 'custom', path: ['timeline', 'tracks', trackIndex, 'blocks', blockIndex, 'background'], message: 'O estado de fundo precisa usar uma imagem de fundo válida na faixa Vídeo.' })
      }
      if (block.incomingMotion && (track.kind !== 'character' || assetsById.get(block.incomingMotion.assetId)?.category !== 'character')) context.addIssue({ code: 'custom', path: ['timeline', 'tracks', trackIndex, 'blocks', blockIndex, 'incomingMotion'], message: 'A animação precisa apontar para um atlas do personagem.' })
      if (block.mediaId) {
        const media = mediaById.get(block.mediaId)
        if (!media || media.kind !== track.kind) context.addIssue({ code: 'custom', path: ['timeline', 'tracks', trackIndex, 'blocks', blockIndex, 'mediaId'], message: 'O bloco precisa apontar para uma mídia compatível com a faixa.' })
        else if ((block.mediaInFrame ?? 0) + block.durationFrames > media.sourceFrames) context.addIssue({ code: 'custom', path: ['timeline', 'tracks', trackIndex, 'blocks', blockIndex, 'durationFrames'], message: 'O trecho do bloco ultrapassa a mídia importada.' })
      }
      if (block.parentBlockId) {
        const parent = blocksById.get(block.parentBlockId)
        if (!parent || parent.track.kind !== 'video' || track.kind === 'video' || track.kind === 'character' || track.kind === 'object' || block.relativeStartFrame === undefined || block.startFrame !== parent.block.startFrame + block.relativeStartFrame || block.startFrame + block.durationFrames > parent.block.startFrame + parent.block.durationFrames) {
          context.addIssue({ code: 'custom', path: ['timeline', 'tracks', trackIndex, 'blocks', blockIndex, 'parentBlockId'], message: 'O comentário precisa ficar dentro do visual ao qual está vinculado.' })
        }
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

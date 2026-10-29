import type { StudioAsset, StudioDocument } from './studio'
import { isValidCustomizerFaceAppearance } from './customizerValidation.ts'
import { isSceneFaceExpressionEffects, isSceneFaceTransforms } from './sceneFaceValidation.ts'

const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const studioReferenceId = /^[a-zA-Z0-9_-]{1,80}$/

export function isStudioDocument(value: unknown): value is StudioDocument {
  if (!value || typeof value !== 'object') return false
  const studio = value as Partial<StudioDocument>
  const assets = studio.assets
  const elements = studio.elements
  return studio.schemaVersion === 1
    && typeof studio.id === 'string' && uuidV4.test(studio.id)
    && typeof studio.title === 'string' && studio.title.trim().length > 0 && studio.title.length <= 100
    && typeof studio.color === 'string' && /^(#[0-9a-f]{6}|hsl\([\d.]+\s+[\d.]+%\s+[\d.]+%\))$/i.test(studio.color)
    && typeof studio.createdAt === 'string' && Number.isFinite(Date.parse(studio.createdAt))
    && typeof studio.updatedAt === 'string' && Number.isFinite(Date.parse(studio.updatedAt))
    && typeof studio.backgroundColor === 'string' && /^#[0-9a-f]{6}$/i.test(studio.backgroundColor)
    && (studio.backgroundAssetId === null || typeof studio.backgroundAssetId === 'string')
    && (studio.thumbnailDataUrl === undefined || typeof studio.thumbnailDataUrl === 'string' && /^data:image\/(jpeg|png);base64,/.test(studio.thumbnailDataUrl) && studio.thumbnailDataUrl.length <= 1_500_000)
    && [studio.backgroundX, studio.backgroundY, studio.backgroundWidth, studio.backgroundHeight, studio.backgroundRotation].every(Number.isFinite)
    && Array.isArray(assets) && assets.length <= 500
    && assets.every(isStudioAsset)
    && Array.isArray(elements) && elements.length <= 1000
    && (studio.backgroundAssetId === null || assets.some((asset) => asset.id === studio.backgroundAssetId && asset.category === 'background'))
    && elements.every((element) => Boolean(element && uuidV4.test(element.id) && typeof element.text === 'string'
      && ['image', 'character', 'narrator', 'speech', 'thought'].includes(element.kind)
      && isSceneFaceTransforms(element.faceTransforms)
      && (element.expressionBase === undefined || Boolean(element.expressionBase && element.expressionBase.appearance && isValidCustomizerFaceAppearance(element.expressionBase.appearance)
        && element.expressionBase.transforms && isSceneFaceTransforms(element.expressionBase.transforms)))
      && (element.activeExpressionPresetId === undefined || element.activeExpressionPresetId === null || typeof element.activeExpressionPresetId === 'string' && studioReferenceId.test(element.activeExpressionPresetId))
      && isSceneFaceExpressionEffects(element.activeExpressionEffects)
      && (element.activeExpressionCollectionId === undefined || typeof element.activeExpressionCollectionId === 'string' && studioReferenceId.test(element.activeExpressionCollectionId))
      && (element.characterSourceUpdatedAt === undefined || typeof element.characterSourceUpdatedAt === 'string' && Number.isFinite(Date.parse(element.characterSourceUpdatedAt)))
      && (element.kind !== 'image' || assets.some((asset) => asset.id === element.assetId && asset.category === 'object'))
      && (element.kind !== 'character' || typeof element.characterId === 'string' && assets.some((asset) => asset.id === element.assetId && asset.category === 'character'))
      && [element.x, element.y, element.width, element.height, element.rotation, element.zIndex].every(Number.isFinite)))
}

export function isStudioAsset(value: unknown): value is StudioAsset {
  if (!value || typeof value !== 'object') return false
  const asset = value as Partial<StudioAsset>
  return typeof asset.id === 'string' && uuidV4.test(asset.id)
    && (asset.category === 'background' || asset.category === 'object' || asset.category === 'character')
    && typeof asset.name === 'string' && asset.name.length <= 255
    && (asset.mimeType === 'image/png' || asset.mimeType === 'image/jpeg' || asset.mimeType === 'image/webp')
    && typeof asset.dataUrl === 'string' && asset.dataUrl.startsWith(`data:${asset.mimeType};base64,`) && asset.dataUrl.length <= 70_000_000
}

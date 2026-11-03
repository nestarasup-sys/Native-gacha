import type { CustomizerWardrobeGroup } from '../../../shared/customizer'
import type { FabricatorProject, JointLink, ModelPart, WardrobeCategory } from '../../../shared/fabricator'
import { modelRigSegmentKind, modelRigSide } from '../../../shared/modelRig'
import { mapWardrobeComponentToPose } from '../../../shared/wardrobePose'
import { drawWardrobeJointBridge } from './wardrobeJointBridge'
import type { WardrobeJointBridgeSegment } from './wardrobeJointBridge'

export type BodyJointBridgeArtwork = Pick<FabricatorProject, 'parts'>
  & Partial<Pick<FabricatorProject, 'joints' | 'hiddenPartIds'>>

export type BodyJointBridgePair = { upper: ModelPart; lower: ModelPart; family: 'arm' | 'leg'; joint: JointLink }

type BodyImageLoader = (part: ModelPart) => Promise<HTMLImageElement>

function bridgeFamily(upper: ModelPart, lower: ModelPart): 'arm' | 'leg' | null {
  const upperKind = modelRigSegmentKind(upper.name)
  const lowerKind = modelRigSegmentKind(lower.name)
  const sideA = modelRigSide(upper.name)
  const sideB = modelRigSide(lower.name)
  if (sideA && sideB && sideA !== sideB) return null
  if (upperKind === 'upper-arm' && lowerKind === 'forearm') return 'arm'
  if (upperKind === 'thigh' && lowerKind === 'lower-leg') return 'leg'
  return null
}

/** Finds visible, connected upper/lower limb pairs eligible for a render-time bridge. */
export function findBodyJointBridgePairs(artwork: BodyJointBridgeArtwork): BodyJointBridgePair[] {
  const parts = new Map(artwork.parts.map((part) => [part.id, part]))
  const hidden = new Set(artwork.hiddenPartIds ?? [])
  const seen = new Set<string>()
  const pairs: BodyJointBridgePair[] = []
  for (const joint of artwork.joints ?? []) {
    const first = parts.get(joint.parentPartId)
    const second = parts.get(joint.childPartId)
    if (!first || !second || hidden.has(first.id) || hidden.has(second.id)) continue
    const directFamily = bridgeFamily(first, second)
    const reverseFamily = directFamily ? null : bridgeFamily(second, first)
    const family = directFamily ?? reverseFamily
    if (!family) continue
    const upper = directFamily ? first : second
    const lower = directFamily ? second : first
    const key = `${upper.id}:${lower.id}`
    if (seen.has(key)) continue
    seen.add(key)
    pairs.push({ upper, lower, family, joint })
  }
  return pairs
}

function mapCanvasPointToSource(part: ModelPart, point: { x: number; y: number }): { x: number; y: number } | null {
  const frame = part.sourceTransform
  if (!frame) return point
  const sourceWidth = frame.width ?? part.width
  const sourceHeight = frame.height ?? part.height
  if (!(sourceWidth > 0 && sourceHeight > 0 && part.width > 0 && part.height > 0)) return null
  const poseRadians = part.rotation * Math.PI / 180
  const sourceRadians = frame.rotation * Math.PI / 180
  const dx = point.x - (part.x + part.width / 2)
  const dy = point.y - (part.y + part.height / 2)
  const localX = (dx * Math.cos(poseRadians) + dy * Math.sin(poseRadians)) * sourceWidth / part.width
  const localY = (-dx * Math.sin(poseRadians) + dy * Math.cos(poseRadians)) * sourceHeight / part.height
  return {
    x: frame.x + sourceWidth / 2 + localX * Math.cos(sourceRadians) - localY * Math.sin(sourceRadians),
    y: frame.y + sourceHeight / 2 + localX * Math.sin(sourceRadians) + localY * Math.cos(sourceRadians)
  }
}

/** Resolves the joint center in the source sheet, before a pose moves either segment. */
export function bodyJointBridgeSourceAnchor(pair: BodyJointBridgePair): { x: number; y: number } | null {
  const savedAnchor = pair.lower.sourceTransform?.jointAnchor
  if (savedAnchor && Number.isFinite(savedAnchor.x) && Number.isFinite(savedAnchor.y)) return savedAnchor
  const attachedAnchor = pair.joint.parentPartId === pair.lower.id
    ? pair.joint.parentAnchor
    : pair.joint.childAnchor
  const mappedAnchor = mapCanvasPointToSource(pair.lower, attachedAnchor)
  return mappedAnchor && Number.isFinite(mappedAnchor.x) && Number.isFinite(mappedAnchor.y) ? mappedAnchor : null
}

function bridgeSegment(part: ModelPart, image: HTMLImageElement, family: 'arm' | 'leg'): WardrobeJointBridgeSegment | null {
  const frame = part.sourceTransform
  if (!frame || frame.width === 0 || frame.height === 0) return null
  const category: WardrobeCategory = family === 'arm' ? 'manga-superior' : 'calca-coxa'
  const component = {
    id: `body-bridge-${part.id}`,
    name: part.name,
    category,
    attachedPartId: part.id,
    x: frame.x,
    y: frame.y,
    width: frame.width ?? part.width,
    height: frame.height ?? part.height,
    rotation: frame.rotation,
    dataUrl: part.dataUrl
  }
  const groupCategory: CustomizerWardrobeGroup['category'] = family === 'arm' ? 'manga-superior' : 'calca'
  const group: CustomizerWardrobeGroup = {
    modelSlot: 1,
    setId: 'body-joint-bridge',
    category: groupCategory,
    componentId: component.id,
    offsetX: 0,
    offsetY: 0,
    scaleX: 1,
    scaleY: 1,
    rotation: 0
  }
  const transform = mapWardrobeComponentToPose(component, part, part)
  return { component, group, image, sourceBone: part, targetBone: part, transform }
}

/**
 * Reuses the proven narrow joint mesh for body images. It reconstructs the
 * saved split seam and deforms that strip only at render time; source PNGs and
 * character/pose records remain untouched.
 */
export async function drawBodyJointBridgePair(
  context: CanvasRenderingContext2D,
  pair: BodyJointBridgePair,
  loadImage: BodyImageLoader,
  rasterScale = 1
): Promise<boolean> {
  const [upperImage, lowerImage] = await Promise.all([loadImage(pair.upper), loadImage(pair.lower)])
  const upper = bridgeSegment(pair.upper, upperImage, pair.family)
  const lower = bridgeSegment(pair.lower, lowerImage, pair.family)
  return upper && lower
    ? drawWardrobeJointBridge(context, upper, lower, rasterScale, bodyJointBridgeSourceAnchor(pair) ?? undefined)
    : false
}

export async function drawEnabledBodyJointBridges(
  context: CanvasRenderingContext2D,
  artwork: BodyJointBridgeArtwork,
  loadImage: BodyImageLoader,
  rasterScale = 1
): Promise<void> {
  for (const pair of findBodyJointBridgePairs(artwork)) {
    try { await drawBodyJointBridgePair(context, pair, loadImage, rasterScale) }
    catch { /* A damaged optional bridge must not suppress the character render. */ }
  }
}

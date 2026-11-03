import type { CustomizerWardrobeGroup } from '../../../shared/customizer'
import type { FabricatorProject, ModelPart, WardrobeCategory } from '../../../shared/fabricator'
import { modelRigSegmentKind, modelRigSide } from '../../../shared/modelRig'
import { mapWardrobeComponentToPose } from '../../../shared/wardrobePose'
import { drawWardrobeJointBridge } from './wardrobeJointBridge'
import type { WardrobeJointBridgeSegment } from './wardrobeJointBridge'

export type BodyJointBridgeArtwork = Pick<FabricatorProject, 'parts'>
  & Partial<Pick<FabricatorProject, 'joints' | 'hiddenPartIds' | 'bodyJointBridgeEnabled'>>

export type BodyJointBridgePair = { upper: ModelPart; lower: ModelPart; family: 'arm' | 'leg' }

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

/** Finds only connected upper/lower limb pairs on models that opted in. */
export function findBodyJointBridgePairs(artwork: BodyJointBridgeArtwork): BodyJointBridgePair[] {
  if (artwork.bodyJointBridgeEnabled !== true) return []
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
    pairs.push({ upper, lower, family })
  }
  return pairs
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
  return upper && lower ? drawWardrobeJointBridge(context, upper, lower, rasterScale) : false
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

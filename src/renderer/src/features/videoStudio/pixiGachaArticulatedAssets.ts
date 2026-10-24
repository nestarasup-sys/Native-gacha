import type { CustomizerCharacter, CustomizerWardrobeGroup } from '../../../../shared/customizer'
import type { FabricatorProject, HairStyle, ModelPart, WardrobeComponent, WardrobeSet } from '../../../../shared/fabricator'
import type { VideoCharacterRenderAssetProvider } from '../../../../shared/videoCharacterRenderAssets'
import type { PoseArtwork } from '../../../../shared/videoCharacterInterpolation'
import { mapWardrobeComponentToPose, wardrobePosePadding } from '../../../../shared/wardrobePose'
import { wardrobeAdjustmentMatrix } from '../../../../shared/wardrobeAdjustment'
import { getCharacterProportions } from '../../../../shared/customizer'
import {
  wardrobeComponentsForGroup, loadHairAppearanceLayers, loadHairTintedImage,
  loadSkinTintedImage, loadCachedImage, resolvedHairColors,
} from '../../characters/characterRenderer'
import { characterShapeScale } from '../../characters/characterSourceResolver'
import { normalizeLayerOrder } from '../../../../shared/modelRig'

/**
 * Articulated GPU recipe. Asset loading, tinting and authoring validation happen
 * ONCE per character revision. Frame evaluation is synchronous numeric math.
 * Matrix entries use Canvas/Pixi affine order [a,b,c,d,tx,ty].
 */
export type GachaAffine = [number, number, number, number, number, number]
export type GachaDrawCommand = Readonly<{
  id: string
  url: string
  width: number
  height: number
  matrix: GachaAffine
  alpha: number
}>
type HairSide = 'back' | 'front' | 'fringe'
type HairLayer = { id: string; url: string; width: number; height: number; part: string; side: HairSide
  transform: NonNullable<HairStyle['transforms']['front']> }
type Garment = { id: string; url: string; width: number; height: number; group: CustomizerWardrobeGroup
  component: WardrobeComponent; aboveHair: boolean; sequence: number }
export type GachaArticulatedAssets = Readonly<{
  body: ReadonlyMap<string, { url: string; width: number; height: number }>
  hairBack: readonly HairLayer[]
  hairFront: readonly HairLayer[]
  garments: readonly Garment[]
  source: FabricatorProject
  character: CustomizerCharacter
  pixelWidth: number
  pixelHeight: number
  shapeX: number
  shapeY: number
}>

const identity = (): GachaAffine => [1, 0, 0, 1, 0, 0]
const translate = (x: number, y: number): GachaAffine => [1, 0, 0, 1, x, y]
const rotate = (angle: number): GachaAffine => {
  const r = angle * Math.PI / 180
  return [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0]
}
const scale = (x: number, y: number): GachaAffine => [x, 0, 0, y, 0, 0]
export function multiplyGachaAffine(a: GachaAffine, b: GachaAffine): GachaAffine {
  return [
    a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ]
}
export function invertGachaAffine(a: GachaAffine): GachaAffine {
  const determinant = a[0] * a[3] - a[1] * a[2]
  if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-9) throw new Error('Transformação de cabeça inválida.')
  const inv: GachaAffine = [a[3] / determinant, -a[1] / determinant,
    -a[2] / determinant, a[0] / determinant, 0, 0]
  inv[4] = -(inv[0] * a[4] + inv[2] * a[5])
  inv[5] = -(inv[1] * a[4] + inv[3] * a[5])
  return inv
}
function join(...matrices: GachaAffine[]): GachaAffine {
  return matrices.reduce(multiplyGachaAffine, identity())
}
function placement(x: number, y: number, w: number, h: number, rotation: number, imageW: number, imageH: number, flip = false): GachaAffine {
  return join(translate(x, y), rotate(rotation), scale(flip ? -1 : 1, 1),
    translate(-w / 2, -h / 2), scale(w / imageW, h / imageH))
}
function head(part: ModelPart): GachaAffine {
  return join(translate(part.x + part.width / 2, part.y + part.height / 2),
    rotate(part.rotation), scale(part.width, part.height))
}
/** Map an authored facial canvas fixed on the reference head onto the current head. */
export function gachaFaceTransport(reference: ModelPart, posed: ModelPart): GachaAffine {
  return join(head(posed), invertGachaAffine(head(reference)))
}
const findHead = (parts: readonly ModelPart[]) => parts.find(p => /cabe[çc]a|head/i.test(p.name))
const imageSource = (image: HTMLImageElement) => image.src
function hairPlacement(sourceHead: ModelPart, posedHead: ModelPart, layer: HairLayer): GachaAffine {
  const t = layer.transform
  const x = t.x / sourceHead.width * posedHead.width
  const y = t.y / sourceHead.height * posedHead.height
  const r = posedHead.rotation * Math.PI / 180
  const cx = posedHead.x + posedHead.width / 2
  const cy = posedHead.y + posedHead.height / 2
  const px = cx + (x - posedHead.width / 2) * Math.cos(r) - (y - posedHead.height / 2) * Math.sin(r)
  const py = cy + (x - posedHead.width / 2) * Math.sin(r) + (y - posedHead.height / 2) * Math.cos(r)
  const w = layer.width * t.scaleX / sourceHead.width * posedHead.width
  const h = layer.height * t.scaleY / sourceHead.height * posedHead.height
  return placement(px, py, w, h, posedHead.rotation + t.rotation, layer.width, layer.height, t.flipX)
}
export async function prepareGachaArticulatedAssets(
  character: CustomizerCharacter,
  source: FabricatorProject,
  from: PoseArtwork,
  to: PoseArtwork,
  provider: VideoCharacterRenderAssetProvider,
): Promise<GachaArticulatedAssets> {
  const slot = character.customization.modelSlot ?? 1
  const skin = character.customization.modelSkinTone
  const body = new Map<string, { url: string; width: number; height: number }>()
  const allParts = [...from.parts, ...to.parts]
  await Promise.all(allParts.map(async part => {
    if (body.has(part.id)) return
    const image = skin ? await loadSkinTintedImage(part.dataUrl, skin) : await loadCachedImage(part.dataUrl)
    body.set(part.id, { url: imageSource(image), width: image.naturalWidth || image.width, height: image.naturalHeight || image.height })
  }))
  const appearance = character.customization.hairAppearance
  const [back, front, fringe] = await Promise.all([
    loadHairAppearanceLayers(appearance, slot, 'back', {}, provider),
    loadHairAppearanceLayers(appearance, slot, 'front', {}, provider),
    loadHairAppearanceLayers(appearance, slot, 'fringe', {}, provider),
  ])
  const asHair = async (layers: typeof back): Promise<HairLayer[]> =>
    Promise.all(layers.filter(layer => Boolean(layer.style[layer.side])).map(async layer => {
      const item = layer.style[layer.side]!
      const t = layer.style.transforms[layer.side]!
      const override = character.customization.partOverrides[`head:${layer.part}`]
      const transform = override ? {
        ...t, x: t.x + (override.x ?? 0), y: t.y + (override.y ?? 0),
        scaleX: t.scaleX * (override.scaleX ?? 1), scaleY: t.scaleY * (override.scaleY ?? 1),
        rotation: t.rotation + (override.rotation ?? 0),
      } : t
      const image = await loadHairTintedImage(item.dataUrl, resolvedHairColors(appearance, layer.part))
      return { id: `hair:${layer.part}:${layer.style.id}`, url: imageSource(image),
        width: item.width, height: item.height, part: layer.part, side: layer.side, transform }
    }))
  const hairBack = await asHair(back)
  const hairFront = await asHair([...front, ...fringe])
  const groups = (character.customization.wardrobeGroups ?? []).filter(group => group.modelSlot === slot && !group.hidden)
  const details: Record<string, WardrobeSet> = {}
  await Promise.all(groups.map(async group => {
    const key = `${group.modelSlot}:${group.setId}`
    if (details[key]) return
    const set = await provider.loadWardrobeSet(group.modelSlot, group.setId)
    if (!set) throw new Error(`Conjunto de roupa Gacha indisponível: ${key}`)
    details[key] = set
  }))
  const garments: Garment[] = []
  for (const group of groups) {
    for (const component of wardrobeComponentsForGroup(group, details)) {
      if (component.glue?.mode === 'loose') continue
      const image = group.colors ? await loadHairTintedImage(component.dataUrl, group.colors) : await loadCachedImage(component.dataUrl)
      garments.push({
        id: `wardrobe:${group.modelSlot}:${group.setId}:${group.category}:${group.componentId ?? ''}:${component.id}`,
        url: imageSource(image), width: image.naturalWidth || image.width,
        height: image.naturalHeight || image.height, group, component,
        aboveHair: component.renderAboveHair === true && (component.category === 'oculos' || component.category === 'acessorio-cabeca'),
        sequence: garments.length,
      })
    }
    if (!wardrobeComponentsForGroup(group, details).length) {
      throw new Error(`Peça Gacha ausente na roupa ${group.setId}`)
    }
  }
  const shape = characterShapeScale(getCharacterProportions(character.customization))
  return { body, source, character, hairBack, hairFront, garments,
    pixelWidth: from.width, pixelHeight: from.height, shapeX: shape.x, shapeY: shape.y }
}
/**
 * Evaluate ONLY geometry. Body, hair, clothing textures were prepared once.
 * This ordering intentionally mirrors renderArtworkWithHair + wardrobe overlay
 * + foreground hair/accessories in the canonical Canvas compositor.
 */
export function gachaArticulatedCommands(assets: GachaArticulatedAssets, posed: PoseArtwork):
  { behind: GachaDrawCommand[]; front: GachaDrawCommand[] } {
  const sourceHead = findHead(assets.source.parts)
  const posedHead = findHead(posed.parts)
  const hidden = new Set(posed.hiddenPartIds ?? [])
  const order = normalizeLayerOrder(posed.parts, posed.layerOrder)
  const current = new Map(posed.parts.map(part => [part.id, part]))
  const behind: GachaDrawCommand[] = []
  const front: GachaDrawCommand[] = []
  const drawPart = (part: ModelPart): GachaDrawCommand | null => {
    const texture = assets.body.get(part.id)
    if (!texture || hidden.has(part.id)) return null
    return { id: `body:${part.id}`, url: texture.url,
      width: texture.width, height: texture.height,
      matrix: placement(part.x + part.width / 2, part.y + part.height / 2,
        part.width, part.height, part.rotation, texture.width, texture.height), alpha: 1 }
  }
  if (sourceHead && posedHead) for (const layer of assets.hairBack) {
    behind.push({ id: layer.id, url: layer.url, width: layer.width, height: layer.height,
      matrix: hairPlacement(sourceHead, posedHead, layer), alpha: 1 })
  }
  for (const id of order) {
    const part = current.get(id)
    if (!part) continue
    const cmd = drawPart(part)
    if (cmd) behind.push(cmd)
  }
  // The canonical wardrobe overlay repeats the body drawing when clothes are
  // equipped, then inserts each fitted garment just above its attached bone.
  if (assets.garments.length) for (const id of order) {
    const part = current.get(id)
    if (!part) continue
    const cmd = drawPart(part)
    if (cmd) behind.push({ ...cmd, id: `wardrobe-body:${id}` })
    for (const garment of assets.garments.filter(item => item.component.attachedPartId === id).sort((a,b)=>a.sequence-b.sequence)) {
      const originBone = assets.source.parts.find(bone => bone.id === id)
      if (!originBone) continue
      const { kneeOverlap, edgePadding } = wardrobePosePadding(garment.component, [])
      const mapped = mapWardrobeComponentToPose(garment.component, originBone, part, kneeOverlap, edgePadding)
      const m = /^matrix\(([^)]+)\)$/.exec(mapped.matrix)?.[1].split(',').map(Number)
      if (!m || m.length !== 6) throw new Error('Matriz da roupa Gacha inválida.')
      const adjustment = wardrobeAdjustmentMatrix(garment.group, part, mapped.origin)
      const affine: GachaAffine = join(adjustment, translate(mapped.origin.x, mapped.origin.y),
        m as GachaAffine,
        translate(mapped.localLeft + mapped.renderWidth / 2, mapped.localTop + mapped.renderHeight / 2),
        rotate(mapped.localRotation),
        translate(-mapped.renderWidth / 2, -mapped.renderHeight / 2),
        scale(mapped.renderWidth / garment.width, mapped.renderHeight / garment.height))
      const garmentCmd = { id: garment.id, url: garment.url, width: garment.width, height: garment.height,
        matrix: affine, alpha: Math.max(0, Math.min(1, garment.group.opacity ?? 1)) }
      if (garment.aboveHair) front.push(garmentCmd)
      else behind.push(garmentCmd)
    }
  }
  if (sourceHead && posedHead) for (const layer of assets.hairFront) {
    front.unshift({ id: layer.id, url: layer.url, width: layer.width, height: layer.height,
      matrix: hairPlacement(sourceHead, posedHead, layer), alpha: 1 })
  }
  return { behind, front }
}

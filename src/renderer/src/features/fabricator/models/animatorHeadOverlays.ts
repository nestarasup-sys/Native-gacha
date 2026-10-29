import type { CustomizerCharacter } from '../../../../../shared/customizer'
import type { FaceCatalogItem, FaceElementKind, FaceSet, FaceSheetKind, FabricatorProject, HairStyle, PosePart } from '../../../../../shared/fabricator'

const faceOrder: FaceElementKind[] = ['brow-left', 'brow-right', 'eye-left', 'eye-right', 'nose', 'mouth']

export type AnimatorHeadOverlay = {
  key: string
  dataUrl: string
  x: number
  y: number
  width: number
  height: number
  rotation: number
  flipX: boolean
  zIndex: number
}

export function mapHeadOverlay(
  sourceHead: PosePart,
  targetHead: PosePart,
  x: number,
  y: number,
  width: number,
  height: number,
  rotation: number,
  scaleX: number,
  scaleY: number,
  flipX = false
) {
  const localX = x / Math.max(1, sourceHead.width) * targetHead.width
  const localY = y / Math.max(1, sourceHead.height) * targetHead.height
  const radians = targetHead.rotation * Math.PI / 180
  return {
    x: targetHead.x + targetHead.width / 2 + (localX - targetHead.width / 2) * Math.cos(radians) - (localY - targetHead.height / 2) * Math.sin(radians),
    y: targetHead.y + targetHead.height / 2 + (localX - targetHead.width / 2) * Math.sin(radians) + (localY - targetHead.height / 2) * Math.cos(radians),
    width: width * scaleX / Math.max(1, sourceHead.width) * targetHead.width,
    height: height * scaleY / Math.max(1, sourceHead.height) * targetHead.height,
    rotation: targetHead.rotation + rotation,
    flipX
  }
}

/** Resolves character hair and face catalog assets onto the animated head rig. */
export function buildAnimatorHeadOverlays({
  rigProject,
  displayProject,
  selectedCharacter,
  hairStyles,
  faceItems,
  faceSets,
  layerIndex,
  layerStride
}: {
  rigProject: FabricatorProject | null
  displayProject: FabricatorProject | null
  selectedCharacter: CustomizerCharacter | null
  hairStyles: Readonly<Record<string, HairStyle>>
  faceItems: Readonly<Record<string, FaceCatalogItem>>
  faceSets: Readonly<Record<string, FaceSet>>
  layerIndex: ReadonlyMap<string, number>
  layerStride: number
}): AnimatorHeadOverlay[] {
  if (!rigProject || !displayProject || !selectedCharacter) return []
  const sourceHead = rigProject.parts.find((part) => /cabe[çc]a|head/i.test(part.name))
  const targetHead = displayProject.parts.find((part) => /cabe[çc]a|head/i.test(part.name))
  if (!sourceHead || !targetHead) return []

  const result: AnimatorHeadOverlay[] = []
  const hair = selectedCharacter.customization.hairAppearance
  if (hair?.modelSlot === rigProject.slot) {
    const backId = 'backStyleId' in hair ? hair.backStyleId ?? null : hair.styleId ?? null
    const frontId = 'frontStyleId' in hair ? hair.frontStyleId ?? null : hair.styleId ?? null
    const backStyle = backId ? hairStyles[`${rigProject.slot}:${backId}`] : null
    const frontStyle = frontId ? hairStyles[`${rigProject.slot}:${frontId}`] : null
    for (const side of ['back', 'front'] as const) {
      const asset = side === 'back' ? backStyle?.back : frontStyle?.front
      const style = side === 'back' ? backStyle : frontStyle
      if (!asset || !style) continue
      const transform = style.transforms[side]
      const placement = mapHeadOverlay(sourceHead, targetHead, transform.x, transform.y, asset.width, asset.height, transform.rotation, transform.scaleX, transform.scaleY, transform.flipX)
      result.push({
        key: `hair-${side}`,
        dataUrl: asset.dataUrl,
        ...placement,
        zIndex: side === 'back' ? 0 : (layerIndex.get(targetHead.id) ?? 0) * layerStride + layerStride - 1
      })
    }
  }

  const appearance = selectedCharacter.customization.faceAppearance
  if (appearance?.modelSlot === rigProject.slot) {
    const catalog: Partial<Record<FaceSheetKind, FaceCatalogItem>> = {
      eyes: appearance.eyeCatalogId ? faceItems[`${rigProject.slot}:${appearance.eyeCatalogId}`] : undefined,
      eyebrows: appearance.eyebrowCatalogId ? faceItems[`${rigProject.slot}:${appearance.eyebrowCatalogId}`] : undefined,
      nose: appearance.noseCatalogId ? faceItems[`${rigProject.slot}:${appearance.noseCatalogId}`] : undefined,
      'mouth-open': appearance.mouthOpenCatalogId ? faceItems[`${rigProject.slot}:${appearance.mouthOpenCatalogId}`] : undefined,
      'mouth-closed': appearance.mouthClosedCatalogId ? faceItems[`${rigProject.slot}:${appearance.mouthClosedCatalogId}`] : undefined
    }
    const legacy = appearance.setId ? faceSets[`${rigProject.slot}:${appearance.setId}`] : null
    for (const element of faceOrder) {
      if (element.startsWith('brow') && !appearance.eyebrows) continue
      const sheet: FaceSheetKind = element.startsWith('eye') ? 'eyes'
        : element.startsWith('brow') ? 'eyebrows'
          : element === 'nose' ? 'nose'
            : appearance.mouthOpen ? 'mouth-open' : 'mouth-closed'
      const index = sheet === 'eyes' ? appearance.eyeState
        : sheet === 'nose' ? appearance.noseIndex
          : sheet.startsWith('mouth') ? appearance.expressionIndex : 0
      const side = element.endsWith('left') ? 'left' : element.endsWith('right') ? 'right' : undefined
      const item = catalog[sheet]
      const piece = item?.pieces.find((candidate) => candidate.sheet === sheet && candidate.index === index && candidate.side === side)
        ?? legacy?.pieces.find((candidate) => candidate.sheet === sheet && candidate.index === index && candidate.side === side)
      const transform = item?.transforms[element] ?? legacy?.transforms[element]
      if (!piece || !transform) continue
      const placement = mapHeadOverlay(sourceHead, targetHead, transform.x, transform.y, piece.width, piece.height, transform.rotation, transform.scaleX, transform.scaleY)
      result.push({
        key: `face-${element}`,
        dataUrl: piece.dataUrl,
        ...placement,
        zIndex: (layerIndex.get(targetHead.id) ?? 0) * layerStride + layerStride - 2
      })
    }
  }
  return result
}

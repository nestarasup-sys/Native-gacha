import type { FaceCatalogItem, FaceComponentAsset, FaceDetailKind, HairStyle, WardrobeSet } from '../../../../shared/fabricator'
import type { CustomizerCharacter, FaceComponentPartId, HairPartId } from '../../../../shared/customizer'
import { hairCategories } from '../../../../shared/hairCategories'
import { hairAppearancePartStyleId } from './customizerHairAppearanceModel'

export function hasHeadAdjustmentItem(character: CustomizerCharacter | null, id: string): boolean {
  const appearance = character?.customization.faceAppearance
  if (hairCategories.some((part) => part.id === id)) return Boolean(hairAppearancePartStyleId(character?.customization.hairAppearance, id as HairPartId))
  if (id === 'eye-left' || id === 'eye-right' || id === 'pupil-left' || id === 'pupil-right' || id === 'brow-left' || id === 'brow-right') {
    return Boolean(appearance?.components?.[id as FaceComponentPartId]?.assetId || (id.startsWith('eye') ? appearance?.eyeCatalogId || appearance?.eyeLeftCatalogId || appearance?.eyeRightCatalogId || appearance?.setId : id.startsWith('brow') ? appearance?.eyebrowCatalogId || appearance?.eyebrowLeftCatalogId || appearance?.eyebrowRightCatalogId || appearance?.setId : false))
  }
  if (id === 'nose') return Boolean(appearance?.noseCatalogId || appearance?.setId)
  if (id === 'mouth') return Boolean(appearance?.mouthClosedCatalogId || appearance?.mouthOpenCatalogId || appearance?.setId)
  if (id === 'oculos' || id === 'acessorio-cabeca') return Boolean(appearance?.headExtras?.[id === 'oculos' ? 'glasses' : 'head-accessory'] || character?.customization.wardrobeGroups?.some((group) => group.category === id))
  return Boolean(appearance?.faceDetails?.[id as FaceDetailKind])
}

export function headAdjustmentPreviewUrl(
  id: string,
  character: CustomizerCharacter | null,
  details: {
    hair: Record<string, HairStyle>
    faceComponents: Record<string, FaceComponentAsset>
    wardrobe: Record<string, WardrobeSet>
    faceCatalog: Record<string, FaceCatalogItem>
  }
): string | null {
  if (!character) return null
  const appearance = character.customization.faceAppearance
  const hairPart = hairCategories.find((part) => part.id === id)
  if (hairPart) {
    const styleId = hairAppearancePartStyleId(character.customization.hairAppearance, hairPart.id)
    const modelSlot = character.customization.hairAppearance?.modelSlot
    return styleId && modelSlot ? details.hair[`${modelSlot}:${styleId}`]?.[hairPart.side]?.dataUrl ?? null : null
  }

  const facePart = id as FaceComponentPartId
  const componentId = appearance?.components?.[facePart]?.assetId
  if (componentId) return details.faceComponents[componentId]?.dataUrl ?? null
  const detailId = appearance?.faceDetails?.[id as FaceDetailKind]
  if (detailId) return details.faceComponents[detailId]?.dataUrl ?? null
  if (id === 'oculos' || id === 'acessorio-cabeca') {
    const wardrobeGroup = [...(character.customization.wardrobeGroups ?? [])].reverse().find((group) => group.category === id)
    if (wardrobeGroup) {
      const wardrobeSet = details.wardrobe[`${wardrobeGroup.modelSlot}:${wardrobeGroup.setId}`]
      const component = wardrobeSet?.components.find((entry) => entry.id === wardrobeGroup.componentId)
        ?? wardrobeSet?.components.find((entry) => entry.category === wardrobeGroup.category)
      if (component?.dataUrl) return component.dataUrl
    }
  }
  const extraId = appearance?.headExtras?.[id === 'oculos' ? 'glasses' : 'head-accessory']
  if (extraId) return details.faceComponents[extraId]?.dataUrl ?? null
  const catalogId = id === 'eye-right' || id === 'pupil-right' ? appearance?.eyeRightCatalogId ?? appearance?.eyeCatalogId
    : id.startsWith('eye-') || id.startsWith('pupil-') ? appearance?.eyeLeftCatalogId ?? appearance?.eyeCatalogId
      : id === 'brow-right' ? appearance?.eyebrowRightCatalogId ?? appearance?.eyebrowCatalogId
        : id.startsWith('brow-') ? appearance?.eyebrowLeftCatalogId ?? appearance?.eyebrowCatalogId
          : id === 'nose' ? appearance?.noseCatalogId : id === 'mouth' ? appearance?.mouthClosedCatalogId : undefined
  const catalog = catalogId ? details.faceCatalog[`${appearance?.modelSlot}:${catalogId}`] : undefined
  return catalog?.pieces[0]?.dataUrl ?? null
}

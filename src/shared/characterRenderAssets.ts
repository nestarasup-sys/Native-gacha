import type { FabricatorDesktopApi } from './fabricator'

/** Exact Fabricator/Customizer read surface used by the saved-character compositor. */
export type CharacterRenderAssetProvider = Pick<FabricatorDesktopApi,
  | 'loadFabricatorSlot' | 'loadFabricatorPose' | 'loadHairStyle' | 'loadWardrobeSet' | 'loadFaceSet'
  | 'listFaceComponentAssets' | 'loadFaceComponentAsset' | 'listFaceCatalog' | 'loadFaceCatalogItem'
  | 'listFaceExpressionPresets' | 'loadFaceExpressionPreset'
>


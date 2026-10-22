/** Estado de biblioteca de materiais do personagem, separado do estado de edição.
 * As mudanças na fonte Fabricador continuam realizadas apenas pelo Fabricador DEV.
 */
import { useState } from 'react'
import type { FaceCatalogItemSummary, FaceCatalogItem, FaceComponentAssetSummary, FaceComponentAsset, FaceSet, HairStyleSummary, HairStyle, WardrobeSetSummary, WardrobeSet } from '../../../../shared/fabricator'
import type { HairPartId } from '../../../../shared/customizer'
import type { StandardExpressionEffects, HairCatalogSide } from '../../characters/characterRenderer'

export function useCustomizerAssetLibraryState<W, F>() {
  const [wardrobeSets, setWardrobeSets] = useState<WardrobeSetSummary[]>([])
  const [wardrobeLoading, setWardrobeLoading] = useState(false)
  const [wardrobeDetails, setWardrobeDetails] = useState<Record<string, WardrobeSet>>({})
  const [wardrobeThumbnails, setWardrobeThumbnails] = useState<Record<string, string>>({})
  const [wardrobeLibraryPanel, setWardrobeLibraryPanel] = useState<W | null>(null)
  const [wardrobeLibraryPage, setWardrobeLibraryPage] = useState(0)
  const [faceCatalogItems, setFaceCatalogItems] = useState<FaceCatalogItemSummary[]>([])
  const [faceCatalogDetails, setFaceCatalogDetails] = useState<Record<string, FaceCatalogItem>>({})
  const [standardExpressionEffects, setStandardExpressionEffects] = useState<StandardExpressionEffects>({})
  const [faceComponentAssets, setFaceComponentAssets] = useState<FaceComponentAssetSummary[]>([])
  const [faceComponentDetails, setFaceComponentDetails] = useState<Record<string, FaceComponentAsset>>({})
  const [faceDetails, setFaceDetails] = useState<Record<string, FaceSet>>({})
  const [faceLoading, setFaceLoading] = useState(false)
  const [faceComponentLoading, setFaceComponentLoading] = useState(false)
  const [hairStyles, setHairStyles] = useState<HairStyleSummary[]>([])
  const [hairDetails, setHairDetails] = useState<Record<string, HairStyle>>({})
  const [hairCatalogSide, setHairCatalogSide] = useState<HairCatalogSide>('front')
  const [hairLoading, setHairLoading] = useState(false)
  const [hairLibraryPart, setHairLibraryPart] = useState<HairPartId | null>(null)
  const [hairLibraryPage, setHairLibraryPage] = useState(0)
  const [faceLibraryPart, setFaceLibraryPart] = useState<F | null>(null)
  const [faceLibraryPage, setFaceLibraryPage] = useState(0)
  const [faceCatalogLibraryPart, setFaceCatalogLibraryPart] = useState<'nose' | 'eye-highlight-left' | 'mouth' | 'eye-highlight-right' | 'blush' | 'facial-shadow' | null>(null)
  const [faceCatalogLibraryPage, setFaceCatalogLibraryPage] = useState(0)
  return {
    wardrobeSets, setWardrobeSets, wardrobeLoading, setWardrobeLoading,
    wardrobeDetails, setWardrobeDetails, wardrobeThumbnails, setWardrobeThumbnails,
    wardrobeLibraryPanel, setWardrobeLibraryPanel, wardrobeLibraryPage, setWardrobeLibraryPage,
    faceCatalogItems, setFaceCatalogItems, faceCatalogDetails, setFaceCatalogDetails,
    standardExpressionEffects, setStandardExpressionEffects, faceComponentAssets, setFaceComponentAssets,
    faceComponentDetails, setFaceComponentDetails, faceDetails, setFaceDetails,
    faceLoading, setFaceLoading, faceComponentLoading, setFaceComponentLoading,
    hairStyles, setHairStyles, hairDetails, setHairDetails,
    hairCatalogSide, setHairCatalogSide, hairLoading, setHairLoading,
    hairLibraryPart, setHairLibraryPart, hairLibraryPage, setHairLibraryPage,
    faceLibraryPart, setFaceLibraryPart, faceLibraryPage, setFaceLibraryPage,
    faceCatalogLibraryPart, setFaceCatalogLibraryPart, faceCatalogLibraryPage, setFaceCatalogLibraryPage
  }
}

/** Estado de inspector do Studio Principal, separado do documento de cena.
 * Os hooks mantêm os defaults e a ordem do componente original.
 */
import { useRef, useState } from 'react'
import type { FaceExpressionCollection, FaceExpressionPresetSummary, FabricatorPoseSummary, FaceCatalogItemSummary, FaceCatalogItem } from '../../../../shared/fabricator'

export function useStudioInspectorState() {
  const [inspectorTab, setInspectorTab] = useState<'editor' | 'custom'>('editor')
  const [inspectorCustomView, setInspectorCustomView] = useState<'face' | 'presets'>('face')
  const characterInspectorViewRef = useRef<{ tab: 'editor' | 'custom'; customView: 'face' | 'presets' }>({ tab: 'editor', customView: 'face' })
  const [studioPresetCategory, setStudioPresetCategory] = useState<'pose' | 'expression'>('expression')
  const [studioExpressionCollections, setStudioExpressionCollections] = useState<FaceExpressionCollection[]>([])
  const [studioExpressionPresets, setStudioExpressionPresets] = useState<FaceExpressionPresetSummary[]>([])
  const [sceneExpressionPresetVersions, setSceneExpressionPresetVersions] = useState<Record<string, string>>({})
  const [studioExpressionCollectionMenuOpen, setStudioExpressionCollectionMenuOpen] = useState(false)
  const [studioExpressionLoading, setStudioExpressionLoading] = useState(false)
  const [studioExpressionBusy, setStudioExpressionBusy] = useState(false)
  const [studioPoseSlots, setStudioPoseSlots] = useState<Array<NonNullable<FabricatorPoseSummary>>>([])
  const [studioPoseThumbnails, setStudioPoseThumbnails] = useState<Record<number, string>>({})
  const [studioPoseDimensions, setStudioPoseDimensions] = useState<Record<number, { width: number; height: number }>>({})
  const [inspectorOpen, setInspectorOpen] = useState(true)
  const [studioFaceCategory, setStudioFaceCategory] = useState<'eyes' | 'eyebrows' | 'nose' | 'mouth'>('eyes')
  const [studioFaceItems, setStudioFaceItems] = useState<FaceCatalogItemSummary[]>([])
  const [studioFaceDetails, setStudioFaceDetails] = useState<Record<string, FaceCatalogItem>>({})
  const [studioFaceLoading, setStudioFaceLoading] = useState(false)
  const [studioFaceBusy, setStudioFaceBusy] = useState(false)

  return {
    inspectorTab,
    setInspectorTab,
    inspectorCustomView,
    setInspectorCustomView,
    studioPresetCategory,
    setStudioPresetCategory,
    studioExpressionCollections,
    setStudioExpressionCollections,
    studioExpressionPresets,
    setStudioExpressionPresets,
    sceneExpressionPresetVersions,
    setSceneExpressionPresetVersions,
    studioExpressionCollectionMenuOpen,
    setStudioExpressionCollectionMenuOpen,
    studioExpressionLoading,
    setStudioExpressionLoading,
    studioExpressionBusy,
    setStudioExpressionBusy,
    studioPoseSlots,
    setStudioPoseSlots,
    studioPoseThumbnails,
    setStudioPoseThumbnails,
    studioPoseDimensions,
    setStudioPoseDimensions,
    inspectorOpen,
    setInspectorOpen,
    studioFaceCategory,
    setStudioFaceCategory,
    studioFaceItems,
    setStudioFaceItems,
    studioFaceDetails,
    setStudioFaceDetails,
    studioFaceLoading,
    setStudioFaceLoading,
    studioFaceBusy,
    setStudioFaceBusy,
    characterInspectorViewRef
  }
}

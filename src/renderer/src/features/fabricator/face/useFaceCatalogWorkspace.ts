import { useEffect, useRef, useState } from 'react'
import type { FaceCatalogItem, FaceCatalogItemSummary } from '../../../../../shared/fabricator'
import type { FaceCatalogLoadOptions, FaceCatalogWorkspaceApi } from './faceWorkspaceData'
import { listFaceCatalogWorkspaceSummaries, loadFaceCatalogWorkspaceDetails } from './faceWorkspaceData'

type UseFaceCatalogWorkspaceOptions = {
  api: FaceCatalogWorkspaceApi
  modelSlot: number
  enabled: boolean
  activeCategory: FaceCatalogLoadOptions['activeCategory']
  onError: (message: string) => void
}

export function useFaceCatalogWorkspace({ api, modelSlot, enabled, activeCategory, onError }: UseFaceCatalogWorkspaceOptions) {
  const [mouthCatalog, setMouthCatalog] = useState<FaceCatalogItemSummary[]>([])
  const [mouthDetails, setMouthDetails] = useState<Record<string, FaceCatalogItem>>({})
  const [selectedMouthId, setSelectedMouthId] = useState<string | null>(null)
  const [mouthKind, setMouthKind] = useState<'mouth-closed' | 'mouth-open'>('mouth-closed')
  const [noseCatalog, setNoseCatalog] = useState<FaceCatalogItemSummary[]>([])
  const [noseDetails, setNoseDetails] = useState<Record<string, FaceCatalogItem>>({})
  const [selectedNoseId, setSelectedNoseId] = useState<string | null>(null)
  const [loadedScope, setLoadedScope] = useState<string | null>(null)
  const mouthCatalogRef = useRef(mouthCatalog)
  const noseCatalogRef = useRef(noseCatalog)
  const mouthKindRef = useRef(mouthKind)
  const selectedMouthIdRef = useRef(selectedMouthId)
  const selectedNoseIdRef = useRef(selectedNoseId)
  const scope = `${enabled ? 'face' : 'inactive'}:${modelSlot}`

  mouthCatalogRef.current = mouthCatalog
  noseCatalogRef.current = noseCatalog
  mouthKindRef.current = mouthKind
  selectedMouthIdRef.current = selectedMouthId
  selectedNoseIdRef.current = selectedNoseId

  useEffect(() => {
    let active = true
    setLoadedScope(null)
    setMouthCatalog([])
    setMouthDetails({})
    setNoseCatalog([])
    setNoseDetails({})
    if (!enabled) return () => { active = false }

    void listFaceCatalogWorkspaceSummaries(api, modelSlot, () => !active).then((loaded) => {
      if (!active || !loaded) return
      const { mouthCatalog: mouths, noseCatalog: noses } = loaded
      setMouthCatalog(mouths)
      setNoseCatalog(noses)
      const currentMouthKind = mouthKindRef.current
      const availableMouthKind = mouths.some((item) => item.category === currentMouthKind) ? currentMouthKind : mouths[0]?.category
      if (availableMouthKind === 'mouth-closed' || availableMouthKind === 'mouth-open') setMouthKind(availableMouthKind)
      setSelectedMouthId((current) => mouths.some((item) => item.id === current && item.category === availableMouthKind)
        ? current
        : mouths.find((item) => item.category === availableMouthKind)?.id ?? null)
      setSelectedNoseId((current) => noses.some((item) => item.id === current) ? current : noses[0]?.id ?? null)
      setLoadedScope(scope)
    }).catch((reason) => {
      if (active) onError(reason instanceof Error ? reason.message : String(reason))
    })
    return () => { active = false }
  }, [api, enabled, modelSlot, onError, scope])

  useEffect(() => {
    let active = true
    if (!enabled || loadedScope !== scope) return () => { active = false }

    void loadFaceCatalogWorkspaceDetails(api, modelSlot, {
      mouthCatalog: mouthCatalogRef.current,
      noseCatalog: noseCatalogRef.current
    }, {
      activeCategory,
      mouthKind: mouthKindRef.current,
      selectedMouthId: selectedMouthIdRef.current,
      selectedNoseId: selectedNoseIdRef.current
    }, () => !active).then((loaded) => {
      if (!active || !loaded) return
      setMouthDetails(loaded.mouthDetails)
      setNoseDetails(loaded.noseDetails)
    }).catch((reason) => {
      if (active) onError(reason instanceof Error ? reason.message : String(reason))
    })
    return () => { active = false }
  }, [activeCategory, api, enabled, loadedScope, modelSlot, onError, scope])

  return {
    mouthCatalog,
    setMouthCatalog,
    mouthDetails,
    setMouthDetails,
    selectedMouthId,
    setSelectedMouthId,
    mouthKind,
    setMouthKind,
    noseCatalog,
    setNoseCatalog,
    noseDetails,
    setNoseDetails,
    selectedNoseId,
    setSelectedNoseId
  }
}

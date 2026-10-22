/** Seleção e carregamento de miniaturas de modelos/poses do Fabricador.
 * Não modifica catálogo-fonte nem personagens.
 */
import { useState } from 'react'
import type { FabricatorSlotSummary, FabricatorPoseSummary } from '../../../../shared/fabricator'

export function useCustomizerModelBrowserState() {
  const [rosterQuery, setRosterQuery] = useState('')
  const [catalogModels, setCatalogModels] = useState<FabricatorSlotSummary[]>([])
  const [catalogPoses, setCatalogPoses] = useState<FabricatorPoseSummary[]>([])
  const [catalogLoading, setCatalogLoading] = useState(true)
  const [catalogError, setCatalogError] = useState('')
  const [selectedCatalogModelSlot, setSelectedCatalogModelSlot] = useState<number | null>(null)
  const [selectedCatalogPoseSlot, setSelectedCatalogPoseSlot] = useState<number | null>(null)
  const [selectedPoseCategory, setSelectedPoseCategory] = useState('Parado')
  const [selectedPosePage, setSelectedPosePage] = useState(0)
  const [modelThumbnails, setModelThumbnails] = useState<Record<number, string>>({})
  const [poseThumbnails, setPoseThumbnails] = useState<Record<string, string>>({})
  return {
    rosterQuery, setRosterQuery, catalogModels, setCatalogModels, catalogPoses, setCatalogPoses, catalogLoading, setCatalogLoading, catalogError, setCatalogError, selectedCatalogModelSlot, setSelectedCatalogModelSlot, selectedCatalogPoseSlot, setSelectedCatalogPoseSlot, selectedPoseCategory, setSelectedPoseCategory, selectedPosePage, setSelectedPosePage, modelThumbnails, setModelThumbnails, poseThumbnails, setPoseThumbnails
  }
}

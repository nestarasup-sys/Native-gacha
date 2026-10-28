import { useState } from 'react'
import { customizerClothesTabs } from './customizerNavigation'

type ClothesPanelTab = (typeof customizerClothesTabs)[number]['id']
type ClothesCategorySelection = Exclude<ClothesPanelTab, 'adjust'>
type ClothingSection = 'Superior' | 'Inferior'

/** Keeps clothing category, section, and two-page panel navigation together. */
export function useCustomizerWardrobeNavigation() {
  const [clothingSection, setClothingSection] = useState<ClothingSection>('Superior')
  const [clothesPanelTab, setClothesPanelTab] = useState<ClothesPanelTab>('upper')
  const [clothesCategorySelection, setClothesCategorySelection] = useState<ClothesCategorySelection>('upper')
  const [upperWardrobePage, setUpperWardrobePage] = useState<1 | 2>(1)
  const [lowerWardrobePage, setLowerWardrobePage] = useState<1 | 2>(1)

  function selectClothesTab(tab: ClothesPanelTab, onPageToggle: () => void) {
    if (tab === clothesPanelTab && (tab === 'upper' || tab === 'lower')) {
      if (tab === 'upper') setUpperWardrobePage((page) => page === 1 ? 2 : 1)
      else setLowerWardrobePage((page) => page === 1 ? 2 : 1)
      onPageToggle()
    }

    const nextTab = tab === 'adjust' && clothesPanelTab === 'adjust' ? clothesCategorySelection : tab
    setClothesPanelTab(nextTab)
    if (nextTab !== 'adjust') {
      setClothesCategorySelection(nextTab)
      if (nextTab === 'upper') setClothingSection('Superior')
      else if (nextTab === 'lower') setClothingSection('Inferior')
    }
  }

  return { clothingSection, clothesPanelTab, clothesCategorySelection, upperWardrobePage, lowerWardrobePage, selectClothesTab }
}

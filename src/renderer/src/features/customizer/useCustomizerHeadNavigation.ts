import { useState } from 'react'
import { customizerHeadTabs } from './customizerNavigation'

type HeadPanelTab = (typeof customizerHeadTabs)[number]['id']
type HeadCategorySelection = Exclude<HeadPanelTab, 'adjust'>

/** Keeps the visible head tab and the category targeted by the adjustment panel in sync. */
export function useCustomizerHeadNavigation() {
  const [headPanelTab, setHeadPanelTab] = useState<HeadPanelTab>('hair')
  const [headCategorySelection, setHeadCategorySelection] = useState<HeadCategorySelection>('hair')

  function selectHeadTab(tab: HeadPanelTab) {
    const nextTab = tab === 'adjust' && headPanelTab === 'adjust' ? headCategorySelection : tab
    setHeadPanelTab(nextTab)
    if (nextTab !== 'adjust') setHeadCategorySelection(nextTab)
  }

  return { headPanelTab, headCategorySelection, selectHeadTab }
}

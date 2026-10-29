/** Loads the selected base model so Fabricator workspaces can render its shared appearance. */
import { useCallback, useEffect, useState } from 'react'
import type { FabricatorProject } from '../../../../shared/fabricator'

export function useFabricatorModelAppearance(deps: {
  activeSection: string
  activeSlot: number
  project: FabricatorProject | null
}) {
  const { activeSection, activeSlot, project } = deps
  const [appearanceTargetSlot, setAppearanceTargetSlotState] = useState<number | null>(null)
  const [otherAppearanceProject, setOtherAppearanceProject] = useState<FabricatorProject | null>(null)
  const [appearanceLoadError, setAppearanceLoadError] = useState('')
  const setAppearanceTargetSlot = useCallback((slot: number | null) => {
    if (slot !== null) setAppearanceTargetSlotState(slot)
  }, [])

  const visibleAppearanceSlot = activeSection === 'Modelos' ? activeSlot : appearanceTargetSlot ?? activeSlot
  const appearanceProject = project?.slot === visibleAppearanceSlot
    ? project
    : otherAppearanceProject?.slot === visibleAppearanceSlot ? otherAppearanceProject : null

  useEffect(() => {
    if (activeSection === 'Modelos' || visibleAppearanceSlot === project?.slot) {
      setOtherAppearanceProject(null)
      setAppearanceLoadError('')
      return
    }
    let active = true
    setAppearanceLoadError('')
    void window.desktop.fabricator.loadFabricatorSlot(visibleAppearanceSlot).then((loaded) => {
      if (active) setOtherAppearanceProject(loaded)
    }).catch((reason: unknown) => {
      if (active) {
        setOtherAppearanceProject(null)
        setAppearanceLoadError(reason instanceof Error ? reason.message : 'Não foi possível carregar o modelo base para a prévia de aparência.')
      }
    })
    return () => { active = false }
  }, [activeSection, visibleAppearanceSlot, project?.slot])

  return {
    appearanceTargetSlot,
    appearanceProject,
    appearanceLoadError,
    setAppearanceTargetSlot
  }
}

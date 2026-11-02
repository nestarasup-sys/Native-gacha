import type { StudioDocument, StudioElement } from '../../../../shared/studio'

export type StudioDeleteSelectedCommandDependencies = {
  activeStudio: StudioDocument | null
  selectedElementId: string | null
  now: () => string
  changeScene: (transform: (studio: StudioDocument) => StudioDocument) => void
  removeStageCharacter: (element: StudioElement) => void
  setSelectedElementId: (elementId: string | null) => void
}

/** Deletes the current Studio selection while leaving project asset ownership unchanged. */
export function createStudioDeleteSelectedCommand(dependencies: StudioDeleteSelectedCommandDependencies) {
  return (): void => {
    const studio = dependencies.activeStudio
    const selectedElementId = dependencies.selectedElementId
    if (!studio || !selectedElementId) return

    if (selectedElementId === 'background') {
      dependencies.changeScene((current) => ({
        ...current,
        backgroundAssetId: null,
        updatedAt: dependencies.now()
      }))
      dependencies.setSelectedElementId(null)
      return
    }

    const selectedElement = studio.elements.find((element) => element.id === selectedElementId)
    if (selectedElement?.kind === 'character') {
      dependencies.removeStageCharacter(selectedElement)
    } else {
      dependencies.changeScene((current) => ({
        ...current,
        elements: current.elements.filter((element) => element.id !== selectedElementId),
        updatedAt: dependencies.now()
      }))
    }
    dependencies.setSelectedElementId(null)
  }
}

import type { CustomizerCharacter } from '../../../../shared/customizer'
import type { EditorV6Document } from '../../../../shared/editorV6'
import type { PoseRevisionSnapshot } from './editorV6CharacterSourceModel'
import { planEditorV6CastSelection, retainEditorV6CastAssets } from './editorV6CastSelection'
import type { PreparedEditorV6CastSnapshots, prepareEditorV6CastSnapshots } from './editorV6CastSnapshots'

type Dependencies = {
  activeProject: EditorV6Document | null
  availableCharacters: CustomizerCharacter[]
  selectedCharacterIds: string[]
  saving: boolean
  sourceSnapshot: PoseRevisionSnapshot | null
  getStageSize: () => { width: number; height: number }
  prepareSnapshots: (input: Parameters<typeof prepareEditorV6CastSnapshots>[0]) => Promise<PreparedEditorV6CastSnapshots>
  changeScene: (update: (project: EditorV6Document) => EditorV6Document) => void
  setSaving: (saving: boolean) => void
  setPickerOpen: (open: boolean) => void
  setActiveTool: (tool: null) => void
  restoreInspectorView: () => void
  setInspectorOpen: (open: boolean) => void
  setSelectedElementId: (elementId: string | null) => void
  setError: (message: string | null) => void
  now?: () => string
}

/** Coordinates cast planning, snapshot preparation, and publication to the project. */
export function createEditorV6CastCommands(dependencies: Dependencies) {
  const now = dependencies.now ?? (() => new Date().toISOString())

  const saveCastSelection = async (): Promise<void> => {
    const project = dependencies.activeProject
    if (!project || dependencies.saving) return

    dependencies.setSaving(true)
    try {
      const plan = planEditorV6CastSelection(project.elements, dependencies.availableCharacters, dependencies.selectedCharacterIds)
      const stage = dependencies.getStageSize()
      const { assets, elements } = await dependencies.prepareSnapshots({
        characters: plan.charactersToAdd,
        startZIndex: Math.max(0, ...plan.retainedElements.map((element) => element.zIndex)),
        stageWidth: stage.width,
        stageHeight: stage.height,
        sourceSnapshot: dependencies.sourceSnapshot
      })

      dependencies.changeScene((current) => ({
        ...current,
        elements: [...plan.retainedElements, ...elements],
        assets: [...retainEditorV6CastAssets(current.assets, plan), ...assets],
        updatedAt: now()
      }))
      dependencies.setPickerOpen(false)
      dependencies.setActiveTool(null)
      dependencies.restoreInspectorView()
      dependencies.setInspectorOpen(true)
      dependencies.setSelectedElementId(elements.at(-1)?.id ?? null)
      dependencies.setError(null)
    } catch (reason) {
      dependencies.setError(reason instanceof Error ? reason.message : 'Não foi possível atualizar o elenco do Editor V6.')
    } finally {
      dependencies.setSaving(false)
    }
  }

  return { saveCastSelection }
}

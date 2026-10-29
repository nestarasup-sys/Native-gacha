import type { CustomizerCharacter } from '../../../src/shared/customizer.ts'
import type { EditorV6Document } from '../../../src/shared/editorV6.ts'
import type { FabricatorPoseReference } from '../../../src/shared/fabricatorPoseReferences.ts'
import {
  addedFabricatorPoseReferences,
  collectCustomizerPoseReferences,
  collectEditorV6PoseReferences,
  collectStudioPoseReferences
} from '../../../src/shared/fabricatorPoseReferences.ts'
import type { StudioDocument } from '../../../src/shared/studio.ts'

type StudioPoseDocument = Pick<StudioDocument, 'id' | 'title' | 'elements'>
type EditorV6PoseDocument = Pick<EditorV6Document, 'id' | 'title' | 'elements' | 'timeline'>

export type FabricatorPoseReferenceIntegrityDependencies = {
  isValidModelSlot: (slot: number) => boolean
  isValidPoseSlot: (slot: number) => boolean
  readPose: (modelSlot: number, poseSlot: number) => Promise<unknown | null>
  listCharacters: () => Promise<CustomizerCharacter[]>
  withCharactersLocked: <T>(operation: (characters: readonly CustomizerCharacter[]) => Promise<T>) => Promise<T>
  listStudioDocuments: () => Promise<StudioPoseDocument[]>
  readStudioDocument: (id: string) => Promise<StudioPoseDocument | null>
  listEditorV6Documents: () => Promise<EditorV6PoseDocument[]>
  readEditorV6Document: (id: string) => Promise<EditorV6PoseDocument | null>
}

/** Centralizes pose-link integrity across Fabricator, Customizer, Studio and Editor V6. */
export function createFabricatorPoseReferenceIntegrity(deps: FabricatorPoseReferenceIntegrityDependencies) {
  async function assertPoseReferencesAvailable(references: readonly FabricatorPoseReference[]): Promise<void> {
    for (const reference of references) {
      if (reference.modelSlot === null || !deps.isValidModelSlot(reference.modelSlot) || !deps.isValidPoseSlot(reference.poseSlot)) {
        throw new Error(`Não foi possível identificar o modelo e a pose usados por ${reference.owner}. Reabra e selecione uma pose salva.`)
      }
      if (!await deps.readPose(reference.modelSlot, reference.poseSlot)) {
        throw new Error(`A pose ${reference.modelSlot}:${reference.poseSlot} usada por ${reference.owner} não está mais disponível no Fabricador Dev.`)
      }
    }
  }

  async function assertDependentCharacterPoseReferencesAvailable(previous: CustomizerCharacter, next: CustomizerCharacter): Promise<void> {
    if (previous.id !== next.id) throw new Error('Não foi possível confirmar a identidade do personagem ao alterar o modelo.')
    if (previous.customization.modelSlot === next.customization.modelSlot) return
    const [studios, editorDocuments] = await Promise.all([
      deps.listStudioDocuments(), deps.listEditorV6Documents()
    ])
    const previousReferences = [
      ...collectStudioPoseReferences(studios, [previous]),
      ...collectEditorV6PoseReferences(editorDocuments, [previous])
    ]
    const nextReferences = [
      ...collectStudioPoseReferences(studios, [next]),
      ...collectEditorV6PoseReferences(editorDocuments, [next])
    ]
    await assertPoseReferencesAvailable(addedFabricatorPoseReferences(nextReferences, previousReferences))
  }

  function withPoseReferenceSnapshot<T>(operation: (references: readonly FabricatorPoseReference[]) => Promise<T>): Promise<T> {
    return deps.withCharactersLocked(async (characters) => {
      const [studios, editorDocuments] = await Promise.all([
        deps.listStudioDocuments(), deps.listEditorV6Documents()
      ])
      const references = [
        ...collectCustomizerPoseReferences(characters),
        ...collectStudioPoseReferences(studios, characters),
        ...collectEditorV6PoseReferences(editorDocuments, characters)
      ]
      return operation(references)
    })
  }

  async function assertStudioPoseReferencesAvailable(document: StudioDocument): Promise<void> {
    const [previous, characters] = await Promise.all([
      deps.readStudioDocument(document.id), deps.listCharacters()
    ])
    const nextReferences = collectStudioPoseReferences([document], characters)
    const previousReferences = previous ? collectStudioPoseReferences([previous], characters) : []
    await assertPoseReferencesAvailable(addedFabricatorPoseReferences(nextReferences, previousReferences))
  }

  async function assertEditorV6PoseReferencesAvailable(document: EditorV6Document): Promise<void> {
    const [previous, characters] = await Promise.all([
      deps.readEditorV6Document(document.id), deps.listCharacters()
    ])
    const nextReferences = collectEditorV6PoseReferences([document], characters)
    const previousReferences = previous ? collectEditorV6PoseReferences([previous], characters) : []
    await assertPoseReferencesAvailable(addedFabricatorPoseReferences(nextReferences, previousReferences))
  }

  return {
    assertPoseReferencesAvailable,
    assertDependentCharacterPoseReferencesAvailable,
    withPoseReferenceSnapshot,
    assertStudioPoseReferencesAvailable,
    assertEditorV6PoseReferencesAvailable
  }
}

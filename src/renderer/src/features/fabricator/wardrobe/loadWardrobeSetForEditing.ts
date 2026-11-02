import type { ModelPart, WardrobeComponent, WardrobeSet } from '../../../../../shared/fabricator'

type LoadWardrobeSetForEditingDependencies = {
  loadWardrobeSet: (modelSlot: number, setId: string) => Promise<WardrobeSet | null>
  referenceParts: readonly ModelPart[]
  currentModelParts: readonly ModelPart[]
}

export type WardrobeSetForEditing = {
  set: WardrobeSet
  incompatibleComponents: WardrobeComponent[]
}

/** Loads a set and reports attachment/binding conflicts without rewriting saved metadata. */
export async function loadWardrobeSetForEditing(
  modelSlot: number,
  setId: string,
  { loadWardrobeSet, referenceParts, currentModelParts }: LoadWardrobeSetForEditingDependencies
): Promise<WardrobeSetForEditing> {
  const loadedSet = await loadWardrobeSet(modelSlot, setId)
  if (!loadedSet) throw new Error('Não foi possível encontrar este conjunto.')

  const availablePartIds = new Set([...referenceParts, ...currentModelParts].map((part) => part.id))
  const incompatibleComponents = loadedSet.components.filter((component) =>
    !availablePartIds.has(component.attachedPartId)
    || Boolean(component.binding && component.binding.boneId !== component.attachedPartId)
  )

  return { set: loadedSet, incompatibleComponents }
}

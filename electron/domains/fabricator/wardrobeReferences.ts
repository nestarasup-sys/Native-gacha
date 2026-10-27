import type { CustomizerCharacter } from '../../../src/shared/customizer.ts'

type CharacterWardrobeOwner = Pick<CustomizerCharacter, 'name' | 'customization'>

/** Impede apagar peças da fonte enquanto personagens ainda dependem delas. */
export function assertReferencedWardrobeComponentsRemain(
  characters: readonly CharacterWardrobeOwner[],
  modelSlot: number,
  setId: string,
  nextComponentIds: ReadonlySet<string>
): void {
  const referenced = new Set(characters.flatMap((character) => (character.customization.wardrobeGroups ?? [])
    .filter((group) => group.modelSlot === modelSlot && group.setId === setId && group.componentId)
    .map((group) => group.componentId!)))
  const removed = [...referenced].filter((componentId) => !nextComponentIds.has(componentId))
  if (removed.length) {
    throw new Error(`Não é possível salvar este conjunto: personagens ainda usam estas peças: ${removed.join(', ')}. Remova ou substitua essas roupas no Customizador primeiro.`)
  }
}

/** A remoção do conjunto é bloqueada até que todos os personagens o desvinculem. */
export function assertWardrobeSetHasNoCharacterReferences(
  characters: readonly CharacterWardrobeOwner[],
  modelSlot: number,
  setId: string
): void {
  const owners = characters.filter((character) => (character.customization.wardrobeGroups ?? [])
    .some((group) => group.modelSlot === modelSlot && group.setId === setId))
  if (owners.length) {
    const names = owners.map((character) => `“${character.name}”`).join(', ')
    throw new Error(`Não é possível excluir este conjunto: ainda está equipado em ${names}. Remova ou substitua essas roupas no Customizador primeiro.`)
  }
}

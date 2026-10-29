import type { CustomizerCharacter } from '../../../src/shared/customizer'
import { collectCustomizerHairStyleReferences } from '../../../src/shared/hairCategories.ts'

type HairReferenceOwner = Pick<CustomizerCharacter, 'name' | 'customization'>

/** Prevents removing a Fabricator hair style while a saved character uses it. */
export function assertHairStyleHasNoCharacterReferences(
  characters: readonly HairReferenceOwner[],
  modelSlot: number,
  styleId: string
): void {
  const owners = characters.filter((character) => collectCustomizerHairStyleReferences(character)
    .some((reference) => reference.modelSlot === modelSlot && reference.id === styleId))
  if (owners.length) {
    const names = owners.map((character) => `“${character.name}”`).join(', ')
    throw new Error(`Não é possível excluir este cabelo: está selecionado em ${names}. Remova ou substitua o cabelo no Customizador primeiro.`)
  }
}

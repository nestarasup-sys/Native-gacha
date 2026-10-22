/** Escolha de personagem em memória, sem dependência de React ou browser storage. */
export function selectRememberedCustomizerCharacter<T extends { id: string }>(characters: readonly T[], remembered: string): string {
  return characters.some(character => character.id === remembered) ? remembered : characters[0]?.id ?? ''
}

/** Comandos do Customizador: alterações em cópias por personagem, nunca em modelos fonte.
 * Preserva a fila serializada por id, rollback via Electron e evento legado.
 */
import { useRef, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import type { CustomizerCharacter, CustomizerWardrobeGroup } from '../../../../shared/customizer'
import { createCustomizerCharacterRosterCommands } from './customizerCharacterRosterCommands'
import { saveCustomizerCharacter } from './customizerCharacterSaveCommand'

type Customization = CustomizerCharacter['customization']
export type CharacterPatch = Partial<Customization> | ((current: Customization) => Partial<Customization>)

export function useCustomizerCharacterCommands(deps: {
  charactersRef: MutableRefObject<CustomizerCharacter[]>
  characterSaveQueue: MutableRefObject<Map<string, Promise<void>>>
  setCharacters: Dispatch<SetStateAction<CustomizerCharacter[]>>
  selectedCharacter: CustomizerCharacter | null
  setSelectedCharacterId: Dispatch<SetStateAction<string>>
  setActiveModule: Dispatch<SetStateAction<string | null>>
  setCharactersError: Dispatch<SetStateAction<string>>
  setCharacterSaveState: Dispatch<SetStateAction<'saved' | 'saving' | 'error'>>
  anchorWardrobe: (groups: CustomizerWardrobeGroup[]) => CustomizerWardrobeGroup[]
}) {
  const {
    charactersRef, characterSaveQueue, selectedCharacter, setCharacters,
    setSelectedCharacterId, setActiveModule, setCharactersError, setCharacterSaveState, anchorWardrobe
  } = deps
  const deletionsInProgress = useRef(new Set<string>())
  const deletionOperations = useRef(new Map<string, Promise<void>>())
  const rosterCommands = createCustomizerCharacterRosterCommands({
    api: window.desktop.customizer,
    charactersRef,
    saveQueue: characterSaveQueue,
    deletionsInProgress,
    deletionOperations,
    setCharacters,
    setSelectedCharacterId,
    setActiveModule,
    setCharactersError,
    notifyCharactersUpdated: () => window.dispatchEvent(new Event('customizer:characters-updated'))
  })

  function selectCharacter(id: string) {
    setSelectedCharacterId(id)
    setActiveModule(null)
  }

  async function saveCharacter(next: CustomizerCharacter) {
    await saveCustomizerCharacter(next, {
      charactersRef,
      saveQueue: characterSaveQueue,
      deletionsInProgress: deletionsInProgress.current,
      setCharacters,
      setCharactersError,
      setCharacterSaveState,
      persistCharacter: (character) => window.desktop.customizer.saveCustomizerCharacter(character),
      loadCharacters: () => window.desktop.customizer.listCustomizerCharacters(),
      notifyCharactersUpdated: () => window.dispatchEvent(new Event('customizer:characters-updated'))
    })
  }

  async function saveCharacterCustomization(patch: CharacterPatch) {
    if (!selectedCharacter) return
    const current = charactersRef.current.find(character => character.id === selectedCharacter.id) ?? selectedCharacter
    const changes = typeof patch === 'function' ? patch(current.customization) : patch
    const customization = { ...current.customization, ...changes }
    if (customization.wardrobeGroups) customization.wardrobeGroups = anchorWardrobe(customization.wardrobeGroups)
    await saveCharacter({ ...current, customization, updatedAt: new Date().toISOString() })
  }

  return { ...rosterCommands, selectCharacter, saveCharacter, saveCharacterCustomization }
}

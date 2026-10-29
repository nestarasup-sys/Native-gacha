import type { CustomizerCharacter } from '../../../../shared/customizer'

type CharacterCommandsApi = {
  createCustomizerCharacter(name: string): Promise<CustomizerCharacter>
  deleteCustomizerCharacter(id: string): Promise<void>
}

type MutableRef<T> = { current: T }

/** Coordinates roster mutations with pending saves before publishing the new in-memory roster. */
export function createCustomizerCharacterRosterCommands(deps: {
  api: CharacterCommandsApi
  charactersRef: MutableRef<CustomizerCharacter[]>
  saveQueue: MutableRef<Map<string, Promise<void>>>
  deletionsInProgress: MutableRef<Set<string>>
  deletionOperations: MutableRef<Map<string, Promise<void>>>
  setCharacters: (characters: CustomizerCharacter[]) => void
  setSelectedCharacterId: (id: string) => void
  setActiveModule: (module: string | null) => void
  setCharactersError: (error: string) => void
  notifyCharactersUpdated: () => void
}) {
  const {
    api, charactersRef, saveQueue, deletionsInProgress, deletionOperations,
    setCharacters, setSelectedCharacterId, setActiveModule, setCharactersError,
    notifyCharactersUpdated
  } = deps

  async function createCharacter(name: string): Promise<CustomizerCharacter> {
    const character = await api.createCustomizerCharacter(name)
    const next = [...charactersRef.current, character]
    charactersRef.current = next
    setCharacters(next)
    setSelectedCharacterId(character.id)
    setActiveModule(null)
    setCharactersError('')
    notifyCharactersUpdated()
    return character
  }

  function deleteCharacter(id: string): Promise<void> {
    const existingOperation = deletionOperations.current.get(id)
    if (existingOperation) return existingOperation
    deletionsInProgress.current.add(id)
    const operation = (async () => {
      try {
        const pendingSave = saveQueue.current.get(id)
        if (pendingSave) await pendingSave.catch(() => undefined)
        await api.deleteCustomizerCharacter(id)
        const remaining = charactersRef.current.filter((character) => character.id !== id)
        charactersRef.current = remaining
        setCharacters(remaining)
        setSelectedCharacterId(remaining[0]?.id ?? '')
        setActiveModule(null)
        setCharactersError('')
        notifyCharactersUpdated()
      } finally {
        deletionsInProgress.current.delete(id)
        deletionOperations.current.delete(id)
      }
    })()
    deletionOperations.current.set(id, operation)
    return operation
  }

  return { createCharacter, deleteCharacter }
}

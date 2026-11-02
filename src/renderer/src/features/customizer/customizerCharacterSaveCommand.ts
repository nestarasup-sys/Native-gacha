import type { CustomizerCharacter } from '../../../../shared/customizer'

type MutableRef<T> = { current: T }

export type CustomizerCharacterSaveDependencies = {
  charactersRef: MutableRef<CustomizerCharacter[]>
  saveQueue: MutableRef<Map<string, Promise<void>>>
  deletionsInProgress: ReadonlySet<string>
  setCharacters: (characters: CustomizerCharacter[]) => void
  setCharactersError: (message: string) => void
  setCharacterSaveState: (state: 'saved' | 'saving' | 'error') => void
  persistCharacter: (character: CustomizerCharacter) => Promise<void>
  loadCharacters: () => Promise<CustomizerCharacter[]>
  notifyCharactersUpdated: () => void
}

/** Saves one character optimistically in ID order and restores the backend snapshot after failure. */
export async function saveCustomizerCharacter(
  next: CustomizerCharacter,
  dependencies: CustomizerCharacterSaveDependencies
): Promise<void> {
  const {
    charactersRef, saveQueue, deletionsInProgress, setCharacters,
    setCharactersError, setCharacterSaveState, persistCharacter,
    loadCharacters, notifyCharactersUpdated
  } = dependencies
  if (deletionsInProgress.has(next.id)) return

  setCharactersError('')
  setCharacterSaveState('saving')
  charactersRef.current = charactersRef.current.map((character) => character.id === next.id ? next : character)
  setCharacters(charactersRef.current)

  const previousWrite = saveQueue.current.get(next.id)
  const write = (previousWrite ? previousWrite.catch(() => undefined) : Promise.resolve())
    .then(() => persistCharacter(next))
  saveQueue.current.set(next.id, write)
  try {
    await write
    if (saveQueue.current.get(next.id) === write) {
      setCharacterSaveState('saved')
      setCharactersError('')
    }
    notifyCharactersUpdated()
  } catch (reason) {
    if (saveQueue.current.get(next.id) === write) {
      setCharacterSaveState('error')
      setCharactersError(reason instanceof Error ? reason.message : 'Não foi possível salvar o personagem.')
      const latest = await loadCharacters().catch(() => null)
      if (latest) {
        charactersRef.current = latest
        setCharacters(latest)
      }
    }
  } finally {
    if (saveQueue.current.get(next.id) === write) saveQueue.current.delete(next.id)
  }
}

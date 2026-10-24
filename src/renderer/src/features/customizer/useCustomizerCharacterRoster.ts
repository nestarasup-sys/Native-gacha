/** Carregamento e seleção do elenco; não edita as fontes do Fabricador.
 * Os dados continuam sob os mesmos contratos IPC/JSON do Customizador.
 */
import { useEffect, useRef, useState } from 'react'
import type { CustomizerCharacter } from '../../../../shared/customizer'
import { selectRememberedCustomizerCharacter } from '../../../../shared/customizerSelection'

const SELECTED_CHARACTER_KEY = 'nymi.customizer.activeCharacter'

export function useCustomizerCharacterRoster() {
  const [characters, setCharacters] = useState<CustomizerCharacter[]>([])
  const charactersRef = useRef<CustomizerCharacter[]>([])
  const characterSaveQueue = useRef(new Map<string, Promise<void>>())
  const [selectedCharacterId, setSelectedCharacterId] = useState('')
  const [charactersLoading, setCharactersLoading] = useState(true)
  const [charactersError, setCharactersError] = useState('')
  const [characterSaveState, setCharacterSaveState] = useState<'saved' | 'saving' | 'error'>('saved')

  useEffect(() => {
    let cancelled = false
    void window.desktop.listCustomizerCharacters().then((loaded) => {
      if (cancelled) return
      charactersRef.current = loaded
      setCharacters(loaded)
      let remembered = ''
      try { remembered = localStorage.getItem(SELECTED_CHARACTER_KEY) ?? '' }
      catch { /* Preferência local opcional, independente dos personagens persistidos. */ }
      setSelectedCharacterId(selectRememberedCustomizerCharacter(loaded, remembered))
    }).catch((reason: unknown) => {
      if (!cancelled) setCharactersError(reason instanceof Error ? reason.message : 'Não foi possível carregar os personagens.')
    }).finally(() => { if (!cancelled) setCharactersLoading(false) })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    try {
      if (selectedCharacterId) localStorage.setItem(SELECTED_CHARACTER_KEY, selectedCharacterId)
      else localStorage.removeItem(SELECTED_CHARACTER_KEY)
    } catch { /* Preferência best-effort; o personagem mora no backend Electron. */ }
  }, [selectedCharacterId])

  return {
    characters, setCharacters, charactersRef, characterSaveQueue,
    selectedCharacterId, setSelectedCharacterId,
    charactersLoading, setCharactersLoading, charactersError, setCharactersError,
    characterSaveState, setCharacterSaveState
  }
}

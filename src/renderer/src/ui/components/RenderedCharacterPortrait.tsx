import { useEffect, useState } from 'react'
import type { CustomizerCharacter } from '../../../../shared/customizer'
import { CharacterPortrait } from './CharacterPortrait'
import { createRenderedCharacterPortraitCache } from './renderedCharacterPortraitCache'

const portraitCache = createRenderedCharacterPortraitCache()

export function RenderedCharacterPortrait({ character, className = '' }: { character: CustomizerCharacter; className?: string }) {
  const [image, setImage] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const key = `${character.id}:${character.updatedAt}`
    const rendered = portraitCache.load(key, async () => {
      try {
        const { renderSavedCharacter } = await import('../../characters/characterRenderer')
        const result = await renderSavedCharacter(character)
        return result.dataUrl
      } catch {
        return null
      }
    })
    void rendered.then((dataUrl) => { if (!cancelled) setImage(dataUrl) })
    return () => { cancelled = true }
  }, [character])

  return image
    ? <span className={`rendered-character-headshot ${className}`}><img src={image} alt={character.name} /></span>
    : <span className={`rendered-character-headshot rendered-character-headshot-fallback ${className}`} aria-label={`Carregando imagem de ${character.name}`}><CharacterPortrait character={character} /></span>
}

import { createCharacterImageCache } from './characterImageCache'

/** Shared cache instance used by Customizer, Studio, Roteiros and Fabricator previews. */
export const loadCachedImage = createCharacterImageCache()

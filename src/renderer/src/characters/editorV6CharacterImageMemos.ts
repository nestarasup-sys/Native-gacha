import { createCharacterImageCache } from './characterImageCache'

/** Editor V6 keeps an independent bounded cache instance. */
export const loadCachedImage = createCharacterImageCache()

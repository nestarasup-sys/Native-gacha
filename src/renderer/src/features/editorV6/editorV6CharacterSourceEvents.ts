/** Subscribe to the Customizer's successful character-save notification. */
export function subscribeToCustomizerCharacterUpdates(target: EventTarget, refresh: () => void): () => void {
  const listener = () => refresh()
  target.addEventListener('customizer:characters-updated', listener)
  return () => target.removeEventListener('customizer:characters-updated', listener)
}

import { useSyncExternalStore } from 'react'

let frame = 0
const listeners = new Set<() => void>()

export function getEditorV6PlaybackFrame(): number {
  return frame
}

export function setEditorV6PlaybackFrame(nextFrame: number): void {
  const next = Math.max(0, Math.floor(nextFrame))
  if (next === frame) return
  frame = next
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useEditorV6PlaybackFrame(): number {
  return useSyncExternalStore(subscribe, getEditorV6PlaybackFrame, () => 0)
}

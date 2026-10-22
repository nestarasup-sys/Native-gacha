/** Sinal específico da publicação de fonte; não altera cenas, poses nem rascunhos. */
export const MODEL_SOURCE_UPDATED = 'fabricator:model-source:updated'

export type ModelSourceUpdate = {
  slot: number
  sourceAssetName: string
}
type UpdatedEvent = Event & { modelSourceUpdate?: ModelSourceUpdate }

export function broadcastModelSourceUpdate(update: ModelSourceUpdate, target: EventTarget = window): void {
  if (!Number.isInteger(update.slot) || update.slot < 1 || update.slot > 10) throw new Error('Slot de atualização inválido.')
  const event = new Event(MODEL_SOURCE_UPDATED) as UpdatedEvent
  event.modelSourceUpdate = update
  target.dispatchEvent(event)
}

export function subscribeModelSourceUpdate(slot: number, onUpdate: (update: ModelSourceUpdate) => void, target: EventTarget = window): () => void {
  const listener = (event: Event) => {
    const update = (event as UpdatedEvent).modelSourceUpdate
    if (update && update.slot === slot) onUpdate(update)
  }
  target.addEventListener(MODEL_SOURCE_UPDATED, listener)
  return () => target.removeEventListener(MODEL_SOURCE_UPDATED, listener)
}

/** Coordena as referências recebidas pela biblioteca de vídeos sem conhecer seus consumidores. */
export type VideoReferenceLookup = (videoId: string) => string | null | Promise<string | null>

/**
 * Serializa somente gravações que criam/removem vínculos com a biblioteca.
 * Filas específicas dos domínios continuam controlando suas demais operações.
 */
export function createVideoReferenceChangeCoordinator() {
  let pending: Promise<void> = Promise.resolve()

  return function coordinate<T>(operation: () => Promise<T> | T): Promise<T> {
    const next = pending.catch(() => undefined).then(operation)
    pending = next.then(() => undefined, () => undefined)
    return next
  }
}

/** Interrompe a exclusão na primeira referência ativa, preservando a mensagem do domínio dono. */
export function createVideoReferenceGuard(lookups: readonly VideoReferenceLookup[]) {
  return async (videoId: string): Promise<void> => {
    for (const lookup of lookups) {
      const message = await lookup(videoId)
      if (message) throw new Error(message)
    }
  }
}

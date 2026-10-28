/** Coordena as referências recebidas pela biblioteca de vídeos sem conhecer seus consumidores. */
export type VideoReferenceLookup = (videoId: string) => string | null | Promise<string | null>

/** Interrompe a exclusão na primeira referência ativa, preservando a mensagem do domínio dono. */
export function createVideoReferenceGuard(lookups: readonly VideoReferenceLookup[]) {
  return async (videoId: string): Promise<void> => {
    for (const lookup of lookups) {
      const message = await lookup(videoId)
      if (message) throw new Error(message)
    }
  }
}

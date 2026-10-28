/** Consulta referências de vídeos armazenadas pelos Roteiros. */
import type { Database } from 'better-sqlite3'
import type { RoteiroDocument } from '../../../src/shared/roteiros'

const VIDEO_REFERENCE_MESSAGE = 'Este vídeo está sendo usado em uma abertura ou TikTok. Remova a referência no roteiro antes de excluí-lo da biblioteca.'

export function createRoteirosVideoReferenceLookup(getDatabase: () => Database | null) {
  return (videoId: string): string | null => {
    const db = getDatabase()
    if (!db) throw new Error('Catálogo de dados não inicializado.')
    const reference = db.prepare("SELECT 1 FROM roteiro_sections WHERE json_extract(video_asset_json, '$.id') = ? LIMIT 1").get(videoId)
    return reference ? VIDEO_REFERENCE_MESSAGE : null
  }
}

/** IDs de mídia que um salvamento de Roteiros pretende manter no catálogo. */
export function collectRoteirosVideoReferenceIds(roteiros: readonly RoteiroDocument[]): Set<string> {
  const ids = new Set<string>()
  for (const roteiro of roteiros) {
    if (roteiro.opening?.video) ids.add(roteiro.opening.video.id)
    for (const tiktok of roteiro.tiktoks) if (tiktok.video) ids.add(tiktok.video.id)
  }
  return ids
}

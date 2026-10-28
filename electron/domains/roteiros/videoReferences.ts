/** Consulta referências de vídeos armazenadas pelos Roteiros. */
import type { Database } from 'better-sqlite3'

const VIDEO_REFERENCE_MESSAGE = 'Este vídeo está sendo usado em uma abertura ou TikTok. Remova a referência no roteiro antes de excluí-lo da biblioteca.'

export function createRoteirosVideoReferenceLookup(getDatabase: () => Database | null) {
  return (videoId: string): string | null => {
    const db = getDatabase()
    if (!db) throw new Error('Catálogo de dados não inicializado.')
    const reference = db.prepare("SELECT 1 FROM roteiro_sections WHERE json_extract(video_asset_json, '$.id') = ? LIMIT 1").get(videoId)
    return reference ? VIDEO_REFERENCE_MESSAGE : null
  }
}

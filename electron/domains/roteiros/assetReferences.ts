/** Referências a assets que os documentos de Roteiros mantêm em SQLite. */
import type { Database } from 'better-sqlite3'
import type { RoteiroDocument } from '../../../src/shared/roteiros'
import { RoteirosRepository } from './repository.ts'

export function collectRoteirosBackgroundReferenceIds(roteiros: readonly RoteiroDocument[]): Set<string> {
  return new Set(roteiros.flatMap((roteiro) => roteiro.backgroundAssetId ? [roteiro.backgroundAssetId] : []))
}

export function collectRoteirosUiGifReferenceIds(roteiros: readonly RoteiroDocument[]): Set<string> {
  return new Set(roteiros.flatMap((roteiro) => roteiro.uiGifAssetId ? [roteiro.uiGifAssetId] : []))
}

export function createRoteiroUiGifReferenceGuard(getDatabase: () => Database | null) {
  return (assetId: string): void => {
    const db = getDatabase()
    if (!db) throw new Error('Catálogo de dados não inicializado.')
    const reference = new RoteirosRepository(db).findLibraryAssetReference('uiGif', assetId)
    if (reference) throw new Error(`Este GIF está selecionado no roteiro “${reference.title}”. Remova a associação ao roteiro antes de excluí-lo permanentemente.`)
  }
}

export function createRoteiroBackgroundReferenceGuard(getDatabase: () => Database | null) {
  return (assetId: string): void => {
    const db = getDatabase()
    if (!db) throw new Error('Catálogo de dados não inicializado.')
    const reference = new RoteirosRepository(db).findLibraryAssetReference('background', assetId)
    if (reference) throw new Error(`Este fundo está selecionado no roteiro “${reference.title}”. Troque ou remova o fundo antes de excluí-lo permanentemente.`)
  }
}

/** Casos de uso da Base de Vídeos: sem Electron, janelas ou conhecimento do preload. */
import { randomUUID } from 'node:crypto'
import type { Database } from 'better-sqlite3'
import type { BaseVideoCategory, BaseVideoDetails } from '../../../src/shared/baseVideos'
import { BaseVideoRepository } from './repository.ts'
import { assertBaseVideoId, nextCategoryColor, normalizeCategoryName, validateVideoDetails } from './validation.ts'

export interface BaseVideoDependencies {
  getDatabase(): Database | null
  /** Deve usar a MESMA fila de gravações dos roteiros para preservar a ordem legada. */
  enqueueWrite<T>(operation: () => Promise<T> | T): Promise<T>
  resolveMedia(videoId: string): Promise<{ path: string; durationFrames: number | null }>
  assertMediaAccessible(path: string): Promise<void>
  deleteLibraryVideo(videoId: string): Promise<void>
}

export class BaseVideoService {
  private readonly deps: BaseVideoDependencies
  constructor(deps: BaseVideoDependencies) { this.deps = deps }

  private repository(): BaseVideoRepository {
    const db = this.deps.getDatabase()
    if (!db) throw new Error('Catálogo de dados não inicializado.')
    return new BaseVideoRepository(db)
  }

  listDetails(): BaseVideoDetails[] { return this.repository().listDetails() }
  listCategories(): BaseVideoCategory[] { return this.repository().listCategories() }

  createCategory(value: unknown): BaseVideoCategory {
    const name = normalizeCategoryName(value)
    const repository = this.repository()
    const category = { id: randomUUID(), name, color: nextCategoryColor(repository.usedCategoryColors()), createdAt: new Date().toISOString() }
    try { repository.createCategory(category) }
    catch (reason) { if (String(reason).includes('UNIQUE')) throw new Error('Já existe uma categoria com esse nome.'); throw reason }
    return category
  }

  renameCategory(id: unknown, value: unknown): BaseVideoCategory {
    assertBaseVideoId(id, 'categoria')
    const name = normalizeCategoryName(value)
    try { return this.repository().renameCategory(id, name) }
    catch (reason) { if (String(reason).includes('UNIQUE')) throw new Error('Já existe uma categoria com esse nome.'); throw reason }
  }

  deleteCategory(id: unknown): Promise<void> {
    assertBaseVideoId(id, 'categoria')
    const repository = this.repository() // Detecta indisponibilidade antes da fila, como no legado.
    return this.deps.enqueueWrite(() => repository.deleteCategory(id))
  }

  saveDetails(value: unknown): Promise<void> {
    const details = validateVideoDetails(value)
    const repository = this.repository()
    return this.deps.enqueueWrite(() => repository.saveDetails(details))
  }

  deleteDetails(videoId: unknown): Promise<void> {
    assertBaseVideoId(videoId)
    const repository = this.repository()
    return this.deps.enqueueWrite(() => repository.deleteDetails(videoId))
  }

  deleteVideo(videoId: unknown): Promise<void> {
    assertBaseVideoId(videoId)
    return this.deps.enqueueWrite(async () => {
      const repository = this.repository()
      repository.assertNotReferencedByRoteiros(videoId)
      // A exclusão lógica ocorre ANTES da remoção de metadados, preservando
      // a recuperação se o processo terminar entre os dois armazenamentos.
      await this.deps.deleteLibraryVideo(videoId)
      repository.deleteDetails(videoId)
    })
  }

  async publishVideo(videoId: unknown): Promise<number> {
    assertBaseVideoId(videoId)
    const media = await this.deps.resolveMedia(videoId)
    if (media.durationFrames === null) throw new Error('A duração deste vídeo ainda não foi reconhecida. Reabra a prévia ou importe o arquivo novamente antes de enviá-lo à Base.')
    await this.deps.assertMediaAccessible(media.path)
    const repository = this.repository()
    return this.deps.enqueueWrite(() => repository.publish(videoId))
  }
}

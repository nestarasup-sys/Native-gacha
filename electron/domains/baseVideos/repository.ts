/** Persistência da Base de Vídeos; todas as queries ficam fora dos handlers IPC. */
import type { Database } from 'better-sqlite3'
import type { BaseVideoCategory, BaseVideoDetails } from '../../../src/shared/baseVideos'

export class BaseVideoRepository {
  private readonly db: Database
  constructor(db: Database) { this.db = db }

  listDetails(): BaseVideoDetails[] {
    const rows = this.db.prepare('SELECT d.video_id, d.video_number, d.description_text, d.timeline, d.scene_end_seconds, d.first_group_reaction_seconds, d.second_group_reaction_seconds, d.additional_context, a.category_id FROM base_video_details d LEFT JOIN base_video_category_assignments a ON a.video_id=d.video_id ORDER BY CASE WHEN d.video_number IS NULL THEN 1 ELSE 0 END, d.video_number, d.updated_at DESC').all() as Array<{ video_id: string; video_number: number | null; description_text: string; timeline: BaseVideoDetails['timeline']; scene_end_seconds: number | null; first_group_reaction_seconds: number | null; second_group_reaction_seconds: number | null; additional_context: string; category_id: string | null }>
    return rows.map((row) => ({ videoId: row.video_id, ...(row.video_number === null ? {} : { videoNumber: row.video_number }), description: row.description_text, timeline: row.timeline,
      ...(row.category_id === null ? {} : { categoryId: row.category_id }),
      ...(row.scene_end_seconds === null ? {} : { sceneEndSeconds: row.scene_end_seconds }),
      ...(row.first_group_reaction_seconds === null ? {} : { firstGroupReactionSeconds: row.first_group_reaction_seconds }),
      ...(row.second_group_reaction_seconds === null ? {} : { secondGroupReactionSeconds: row.second_group_reaction_seconds }), additionalContext: row.additional_context }))
  }

  listCategories(): BaseVideoCategory[] {
    return (this.db.prepare('SELECT category_id, name, color_hex, created_at FROM base_video_categories ORDER BY name COLLATE NOCASE, created_at').all() as Array<{ category_id: string; name: string; color_hex: string; created_at: string }>).map((row) => ({ id: row.category_id, name: row.name, color: row.color_hex, createdAt: row.created_at }))
  }

  usedCategoryColors(): Set<string> {
    return new Set((this.db.prepare('SELECT color_hex FROM base_video_categories').all() as Array<{ color_hex: string }>).map((row) => row.color_hex))
  }

  createCategory(category: BaseVideoCategory): void {
    this.db.prepare('INSERT INTO base_video_categories(category_id, name, color_hex, created_at) VALUES (?, ?, ?, ?)').run(category.id, category.name, category.color, category.createdAt)
  }

  renameCategory(id: string, name: string): BaseVideoCategory {
    this.db.prepare('UPDATE base_video_categories SET name=? WHERE category_id=?').run(name, id)
    const row = this.db.prepare('SELECT category_id, name, color_hex, created_at FROM base_video_categories WHERE category_id=?').get(id) as { category_id: string; name: string; color_hex: string; created_at: string } | undefined
    if (!row) throw new Error('Categoria não encontrada.')
    return { id: row.category_id, name: row.name, color: row.color_hex, createdAt: row.created_at }
  }

  deleteCategory(id: string): void {
    this.db.prepare('DELETE FROM base_video_categories WHERE category_id=?').run(id)
  }

  saveDetails(details: BaseVideoDetails): void {
    const saveDetails = this.db.prepare(`INSERT INTO base_video_details(video_id, description_text, timeline, scene_end_seconds, first_group_reaction_seconds, second_group_reaction_seconds, additional_context, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(video_id) DO UPDATE SET description_text=excluded.description_text, timeline=excluded.timeline,
      scene_end_seconds=excluded.scene_end_seconds, first_group_reaction_seconds=excluded.first_group_reaction_seconds,
      second_group_reaction_seconds=excluded.second_group_reaction_seconds, additional_context=excluded.additional_context, updated_at=excluded.updated_at`)
    this.db.transaction(() => {
      saveDetails.run(details.videoId, details.description, details.timeline, details.sceneEndSeconds ?? null, details.firstGroupReactionSeconds ?? null, details.secondGroupReactionSeconds ?? null, details.additionalContext ?? '', new Date().toISOString())
      if (details.categoryId !== undefined) {
        if (details.categoryId === null) this.db.prepare('DELETE FROM base_video_category_assignments WHERE video_id=?').run(details.videoId)
        else {
          if (!this.db.prepare('SELECT 1 FROM base_video_categories WHERE category_id=?').get(details.categoryId)) throw new Error('A categoria selecionada não existe mais.')
          this.db.prepare('INSERT INTO base_video_category_assignments(video_id, category_id, assigned_at) VALUES (?, ?, ?) ON CONFLICT(video_id) DO UPDATE SET category_id=excluded.category_id, assigned_at=excluded.assigned_at').run(details.videoId, details.categoryId, new Date().toISOString())
        }
      }
    })()
  }

  deleteDetails(id: string): void {
    this.db.prepare('DELETE FROM base_video_details WHERE video_id=?').run(id)
  }

  assertNotReferencedByRoteiros(id: string): void {
    const reference = this.db.prepare("SELECT 1 FROM roteiro_sections WHERE json_extract(video_asset_json, '$.id') = ? LIMIT 1").get(id)
    if (reference) throw new Error('Este vídeo está sendo usado em uma abertura ou TikTok. Remova a referência no roteiro antes de excluí-lo da biblioteca.')
  }

  /** Atribui um número uma vez, mantendo a transação e a sequência originais. */
  publish(id: string): number {
    return this.db.transaction((videoId: string) => {
      const existing = this.db.prepare('SELECT video_number FROM base_video_details WHERE video_id=?').get(videoId) as { video_number: number | null } | undefined
      if (existing?.video_number !== null && existing?.video_number !== undefined) return existing.video_number
      let sequence = this.db.prepare('SELECT next_number FROM base_video_sequence WHERE sequence_id=1').get() as { next_number: number } | undefined
      if (!sequence) {
        this.db.prepare('INSERT INTO base_video_sequence(sequence_id, next_number) SELECT 1, COALESCE(MAX(video_number), 0) + 1 FROM base_video_details').run()
        sequence = this.db.prepare('SELECT next_number FROM base_video_sequence WHERE sequence_id=1').get() as { next_number: number }
      }
      const videoNumber = sequence.next_number
      if (!Number.isSafeInteger(videoNumber) || videoNumber < 1 || !Number.isSafeInteger(videoNumber + 1)) throw new Error('A sequência numérica da Base de vídeos atingiu um valor inválido.')
      this.db.prepare('UPDATE base_video_sequence SET next_number=? WHERE sequence_id=1').run(videoNumber + 1)
      this.db.prepare(`INSERT INTO base_video_details(video_id, video_number, description_text, timeline, updated_at)
        VALUES (?, ?, '', 'unspecified', ?) ON CONFLICT(video_id) DO UPDATE SET video_number=excluded.video_number, updated_at=excluded.updated_at`)
        .run(videoId, videoNumber, new Date().toISOString())
      return videoNumber
    })(id)
  }
}

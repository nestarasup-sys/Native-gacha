/** Consultas e gravações SQLite pertencentes aos documentos de Roteiros. */
import type { Database } from 'better-sqlite3'
import type { RoteiroDocument, RoteiroReactionBlock, RoteiroSectionContent, RoteiroVideoReference } from '../../../src/shared/roteiros'

export class RoteirosRepository {
  constructor(private readonly db: Database) {}

  list(): RoteiroDocument[] {
    const roteiroRows = this.db.prepare('SELECT id, title, video_title, character_ids_json, background_asset_id, ui_gif_asset_id, preview_details_collapsed FROM roteiros ORDER BY position, created_at, id').all() as Array<{ id: string; title: string; video_title: string; character_ids_json: string; background_asset_id: string | null; ui_gif_asset_id: string | null; preview_details_collapsed: number }>
    const tiktokRows = this.db.prepare('SELECT id, roteiro_id, title, video_title FROM roteiro_tiktoks ORDER BY roteiro_id, position').all() as Array<{ id: string; roteiro_id: string; title: string; video_title: string }>
    const sectionRows = this.db.prepare('SELECT section_id, video_asset_json, blocks_json, description_text, timeline, scene_end_seconds, first_group_reaction_seconds, second_group_reaction_seconds, additional_context FROM roteiro_sections').all() as Array<{ section_id: string; video_asset_json: string | null; blocks_json: string; description_text: string; timeline: RoteiroSectionContent['timeline']; scene_end_seconds: number | null; first_group_reaction_seconds: number | null; second_group_reaction_seconds: number | null; additional_context: string }>
    const contentById = new Map(sectionRows.map((row) => [row.section_id, {
      video: row.video_asset_json ? JSON.parse(row.video_asset_json) as RoteiroVideoReference : null,
      blocks: JSON.parse(row.blocks_json) as RoteiroReactionBlock[],
      description: row.description_text,
      additionalContext: row.additional_context,
      timeline: row.timeline,
      ...(row.scene_end_seconds === null ? {} : { sceneEndSeconds: row.scene_end_seconds }),
      ...(row.first_group_reaction_seconds === null ? {} : { firstGroupReactionSeconds: row.first_group_reaction_seconds }),
      ...(row.second_group_reaction_seconds === null ? {} : { secondGroupReactionSeconds: row.second_group_reaction_seconds })
    }]))
    const tiktoksByRoteiro = new Map<string, RoteiroDocument['tiktoks']>()
    for (const row of tiktokRows) {
      const items = tiktoksByRoteiro.get(row.roteiro_id) ?? []
      items.push({ id: row.id, title: row.title, videoTitle: row.video_title, ...(contentById.get(row.id) ?? { video: null, blocks: [], description: '' }) })
      tiktoksByRoteiro.set(row.roteiro_id, items)
    }
    return roteiroRows.map((row) => ({
      id: row.id, title: row.title, videoTitle: row.video_title,
      characterIds: JSON.parse(row.character_ids_json) as string[],
      ...(row.background_asset_id ? { backgroundAssetId: row.background_asset_id } : {}),
      ...(row.ui_gif_asset_id ? { uiGifAssetId: row.ui_gif_asset_id } : {}),
      previewDetailsCollapsed: Boolean(row.preview_details_collapsed),
      opening: contentById.get(`${row.id}:opening`) ?? { video: null, blocks: [], description: '' },
      tiktoks: tiktoksByRoteiro.get(row.id) ?? []
    }))
  }

  listVideoReferenceIds(): Set<string> {
    const rows = this.db.prepare("SELECT DISTINCT json_extract(video_asset_json, '$.id') AS video_id FROM roteiro_sections WHERE video_asset_json IS NOT NULL").all() as Array<{ video_id: unknown }>
    return new Set(rows.flatMap((row) => typeof row.video_id === 'string' ? [row.video_id] : []))
  }

  save(documents: RoteiroDocument[]): void {
    const now = new Date().toISOString()
    const save = this.db.transaction((items: RoteiroDocument[]) => {
      const oldRoteiros = this.db.prepare('SELECT id, title, video_title, character_ids_json, position FROM roteiros').all() as Array<{ id: string; title: string; video_title: string; character_ids_json: string; position: number }>
      const oldTikToks = this.db.prepare('SELECT id, roteiro_id, title, video_title, position FROM roteiro_tiktoks').all() as Array<{ id: string; roteiro_id: string; title: string; video_title: string; position: number }>
      const oldSections = this.db.prepare('SELECT section_id FROM roteiro_sections').all() as Array<{ section_id: string }>
      const roteiroIds = new Set(items.map((item) => item.id))
      const tiktokIds = new Set(items.flatMap((item) => item.tiktoks.map((tiktok) => tiktok.id)))
      const sectionIds = new Set(items.flatMap((item) => [`${item.id}:opening`, ...item.tiktoks.map((tiktok) => tiktok.id)]))
      const deleteSection = this.db.prepare('DELETE FROM roteiro_sections WHERE section_id=?')
      const deleteTikTok = this.db.prepare('DELETE FROM roteiro_tiktoks WHERE id=?')
      const deleteRoteiro = this.db.prepare('DELETE FROM roteiros WHERE id=?')
      for (const row of oldSections) if (!sectionIds.has(row.section_id)) deleteSection.run(row.section_id)
      for (const row of oldTikToks) if (!tiktokIds.has(row.id)) deleteTikTok.run(row.id)
      for (const row of oldRoteiros) if (!roteiroIds.has(row.id)) deleteRoteiro.run(row.id)

      // Positions are unique per roteiro. Shift only parents whose order changed,
      // then write their final positions without transient uniqueness collisions.
      const oldTikToksByParent = new Map<string, typeof oldTikToks>()
      for (const row of oldTikToks) {
        if (!tiktokIds.has(row.id)) continue
        const rows = oldTikToksByParent.get(row.roteiro_id) ?? []
        rows.push(row)
        oldTikToksByParent.set(row.roteiro_id, rows)
      }
      const shiftTikTokPositions = this.db.prepare('UPDATE roteiro_tiktoks SET position=position+1000000 WHERE roteiro_id=?')
      for (const roteiro of items) {
        const old = oldTikToksByParent.get(roteiro.id) ?? []
        const oldById = new Map(old.map((row) => [row.id, row]))
        if (roteiro.tiktoks.some((tiktok, position) => oldById.has(tiktok.id) && oldById.get(tiktok.id)!.position !== position)) shiftTikTokPositions.run(roteiro.id)
      }

      const upsertRoteiro = this.db.prepare(`INSERT INTO roteiros(id, title, video_title, character_ids_json, background_asset_id, ui_gif_asset_id, preview_details_collapsed, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET title=excluded.title, video_title=excluded.video_title, character_ids_json=excluded.character_ids_json, background_asset_id=excluded.background_asset_id, ui_gif_asset_id=excluded.ui_gif_asset_id, preview_details_collapsed=excluded.preview_details_collapsed, position=excluded.position, updated_at=excluded.updated_at
        WHERE roteiros.title IS NOT excluded.title OR roteiros.video_title IS NOT excluded.video_title OR roteiros.character_ids_json IS NOT excluded.character_ids_json OR roteiros.background_asset_id IS NOT excluded.background_asset_id OR roteiros.ui_gif_asset_id IS NOT excluded.ui_gif_asset_id OR roteiros.preview_details_collapsed IS NOT excluded.preview_details_collapsed OR roteiros.position IS NOT excluded.position`)
      const upsertTikTok = this.db.prepare(`INSERT INTO roteiro_tiktoks(id, roteiro_id, title, video_title, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET roteiro_id=excluded.roteiro_id, title=excluded.title, video_title=excluded.video_title, position=excluded.position, updated_at=excluded.updated_at
        WHERE roteiro_tiktoks.roteiro_id IS NOT excluded.roteiro_id OR roteiro_tiktoks.title IS NOT excluded.title OR roteiro_tiktoks.video_title IS NOT excluded.video_title OR roteiro_tiktoks.position IS NOT excluded.position`)
      const upsertSection = this.db.prepare(`INSERT INTO roteiro_sections(section_id, roteiro_id, section_kind, video_asset_json, blocks_json, description_text, timeline, scene_end_seconds, first_group_reaction_seconds, second_group_reaction_seconds, additional_context, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(section_id) DO UPDATE SET roteiro_id=excluded.roteiro_id, section_kind=excluded.section_kind, video_asset_json=excluded.video_asset_json, blocks_json=excluded.blocks_json, description_text=excluded.description_text, timeline=excluded.timeline, scene_end_seconds=excluded.scene_end_seconds, first_group_reaction_seconds=excluded.first_group_reaction_seconds, second_group_reaction_seconds=excluded.second_group_reaction_seconds, additional_context=excluded.additional_context, updated_at=excluded.updated_at
        WHERE roteiro_sections.roteiro_id IS NOT excluded.roteiro_id OR roteiro_sections.section_kind IS NOT excluded.section_kind OR roteiro_sections.video_asset_json IS NOT excluded.video_asset_json OR roteiro_sections.blocks_json IS NOT excluded.blocks_json OR roteiro_sections.description_text IS NOT excluded.description_text OR roteiro_sections.timeline IS NOT excluded.timeline OR roteiro_sections.scene_end_seconds IS NOT excluded.scene_end_seconds OR roteiro_sections.first_group_reaction_seconds IS NOT excluded.first_group_reaction_seconds OR roteiro_sections.second_group_reaction_seconds IS NOT excluded.second_group_reaction_seconds OR roteiro_sections.additional_context IS NOT excluded.additional_context`)
      items.forEach((roteiro, position) => {
        upsertRoteiro.run(roteiro.id, roteiro.title.trim(), roteiro.videoTitle.trim(), JSON.stringify(roteiro.characterIds), roteiro.backgroundAssetId ?? null, roteiro.uiGifAssetId ?? null, roteiro.previewDetailsCollapsed ? 1 : 0, position, now, now)
        const opening = roteiro.opening ?? { video: null, blocks: [], description: '' }
        upsertSection.run(`${roteiro.id}:opening`, roteiro.id, 'opening', opening.video ? JSON.stringify(opening.video) : null, JSON.stringify(opening.blocks), opening.description ?? '', opening.timeline ?? 'unspecified', opening.sceneEndSeconds ?? null, opening.firstGroupReactionSeconds ?? null, opening.secondGroupReactionSeconds ?? null, opening.additionalContext ?? '', now)
        roteiro.tiktoks.forEach((tiktok, tiktokPosition) => {
          upsertTikTok.run(tiktok.id, roteiro.id, tiktok.title.trim(), tiktok.videoTitle.trim(), tiktokPosition, now, now)
          const content = { video: tiktok.video ?? null, blocks: tiktok.blocks ?? [], description: tiktok.description ?? '', timeline: tiktok.timeline ?? 'unspecified', sceneEndSeconds: tiktok.sceneEndSeconds, firstGroupReactionSeconds: tiktok.firstGroupReactionSeconds, secondGroupReactionSeconds: tiktok.secondGroupReactionSeconds, additionalContext: tiktok.additionalContext ?? '' }
          upsertSection.run(tiktok.id, roteiro.id, 'tiktok', content.video ? JSON.stringify(content.video) : null, JSON.stringify(content.blocks), content.description, content.timeline, content.sceneEndSeconds ?? null, content.firstGroupReactionSeconds ?? null, content.secondGroupReactionSeconds ?? null, content.additionalContext, now)
        })
      })
    })
    save(documents)
  }
}

import type { Database } from 'better-sqlite3'
import type { CharacterSheet } from '../../../src/shared/roteiros'

/** Persistência local das fichas narrativas vinculadas aos IDs do Customizador. */
export class CharacterSheetsRepository {
  private readonly db: Database

  constructor(db: Database) { this.db = db }

  list(): CharacterSheet[] {
    const rows = this.db.prepare('SELECT character_id, character_name, personality, backstory, fyn_relationship, speaking_style, relationships_json, additional_rules, updated_at FROM roteiro_character_sheets ORDER BY character_name COLLATE NOCASE').all() as Array<{ character_id: string; character_name: string; personality: string; backstory: string; fyn_relationship: string; speaking_style: string; relationships_json: string; additional_rules: string; updated_at: string }>
    return rows.map((row) => ({ characterId: row.character_id, characterName: row.character_name, personality: row.personality, backstory: row.backstory, fynRelationship: row.fyn_relationship, speakingStyle: row.speaking_style, relationships: JSON.parse(row.relationships_json) as CharacterSheet['relationships'], additionalRules: row.additional_rules, updatedAt: row.updated_at }))
  }

  save(sheet: CharacterSheet): void {
    this.db.prepare(`INSERT INTO roteiro_character_sheets(character_id, character_name, personality, backstory, fyn_relationship, speaking_style, relationships_json, additional_rules, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(character_id) DO UPDATE SET character_name=excluded.character_name, personality=excluded.personality, backstory=excluded.backstory, fyn_relationship=excluded.fyn_relationship, speaking_style=excluded.speaking_style, relationships_json=excluded.relationships_json, additional_rules=excluded.additional_rules, updated_at=excluded.updated_at`)
      .run(sheet.characterId, sheet.characterName, sheet.personality, sheet.backstory, sheet.fynRelationship, sheet.speakingStyle, JSON.stringify(sheet.relationships), sheet.additionalRules, sheet.updatedAt)
  }
}

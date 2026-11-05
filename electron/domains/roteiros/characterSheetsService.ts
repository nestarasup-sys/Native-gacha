import type { Database } from 'better-sqlite3'
import type { CharacterSheet } from '../../../src/shared/roteiros'
import { CharacterSheetsRepository } from './characterSheetsRepository.ts'

const textLimits: Array<[keyof Pick<CharacterSheet, 'personality' | 'backstory' | 'fynRelationship' | 'speakingStyle' | 'additionalRules'>, number]> = [
  ['personality', 12000], ['backstory', 12000], ['fynRelationship', 10000], ['speakingStyle', 8000], ['additionalRules', 10000]
]

export function isCharacterSheet(value: unknown): value is CharacterSheet {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const sheet = value as Partial<CharacterSheet>
  if (typeof sheet.characterId !== 'string' || !sheet.characterId.trim() || sheet.characterId.length > 200 || typeof sheet.characterName !== 'string' || !sheet.characterName.trim() || sheet.characterName.length > 200) return false
  if (textLimits.some(([key, max]) => typeof sheet[key] !== 'string' || (sheet[key] as string).length > max)) return false
  if (!Array.isArray(sheet.relationships) || sheet.relationships.length > 500) return false
  return sheet.relationships.every((entry) => Boolean(entry && typeof entry.id === 'string' && entry.id.length > 0 && entry.id.length <= 200 && typeof entry.targetCharacterId === 'string' && entry.targetCharacterId.length > 0 && entry.targetCharacterId.length <= 200 && typeof entry.description === 'string' && entry.description.length <= 6000))
}

export function createCharacterSheetsService(deps: { getDatabase: () => Database | null; waitForPendingWrites: () => Promise<void>; enqueueWrite: <T>(operation: () => Promise<T> | T) => Promise<T> }) {
  const repository = () => { const db = deps.getDatabase(); if (!db) throw new Error('Catálogo de dados não inicializado.'); return new CharacterSheetsRepository(db) }
  return {
    async list(): Promise<CharacterSheet[]> { await deps.waitForPendingWrites(); return repository().list() },
    save(value: unknown): Promise<void> {
      if (!isCharacterSheet(value)) throw new Error('Dados da ficha do personagem inválidos.')
      return deps.enqueueWrite(() => repository().save({ ...value, characterName: value.characterName.trim(), updatedAt: new Date().toISOString() }))
    }
  }
}

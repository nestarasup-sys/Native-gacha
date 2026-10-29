/** Regras de entrada da Base de Vídeos. Não depende de Electron nem de SQLite. */
import type { BaseVideoDetails } from '../../../src/shared/baseVideos'
import { nextCategoryColor } from '../../categoryColors.cjs'

export { nextCategoryColor }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function assertBaseVideoId(value: unknown, label = 'vídeo'): asserts value is string {
  if (typeof value !== 'string' || !UUID.test(value)) throw new Error(`Identificador de ${label} inválido.`)
}

export function normalizeCategoryName(value: unknown): string {
  const name = typeof value === 'string' ? value.trim() : ''
  if (!name || name.length > 60) throw new Error('O nome da categoria deve ter de 1 a 60 caracteres.')
  return name
}

export function validateVideoDetails(value: unknown): BaseVideoDetails {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Dados do vídeo inválidos.')
  const details = value as Partial<BaseVideoDetails>
  const validSeconds = (seconds: unknown) => seconds === undefined || typeof seconds === 'number' && Number.isFinite(seconds) && seconds >= 0 && seconds <= 86400
  if (typeof details.videoId !== 'string' || !UUID.test(details.videoId)
    || typeof details.description !== 'string' || details.description.length > 20000
    || details.additionalContext !== undefined && (typeof details.additionalContext !== 'string' || details.additionalContext.length > 20000)
    || details.categoryId !== undefined && details.categoryId !== null && (typeof details.categoryId !== 'string' || !UUID.test(details.categoryId))
    || !['unspecified', 'past', 'present', 'future'].includes(details.timeline ?? '')
    || !validSeconds(details.sceneEndSeconds) || !validSeconds(details.firstGroupReactionSeconds) || !validSeconds(details.secondGroupReactionSeconds)
  ) throw new Error('Dados do vídeo inválidos.')
  return details as BaseVideoDetails
}

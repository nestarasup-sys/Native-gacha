/** Regras de entrada da Base de Vídeos. Não depende de Electron nem de SQLite. */
import type { BaseVideoDetails } from '../../../src/shared/roteiros'

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

/** Preserva a paleta e a sequência legadas. Não altera cores já atribuídas. */
export function nextCategoryColor(usedColors: ReadonlySet<string>): string {
  const palette = ['#dc5368', '#e58b3a', '#b39a32', '#4d9b68', '#279e9b', '#3988c7', '#5262bd', '#8559c5', '#c14d9d', '#8a684f', '#536f8b', '#698b42', '#d36b48', '#3c9ab8', '#a84e69', '#7663c2']
  const available = palette.find((candidate) => !usedColors.has(candidate))
  if (available) return available
  for (let index = 0; index < 10000; index += 1) {
    const hue = (index * 137.508) % 360
    const saturation = 0.62
    const lightness = 0.52
    const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation
    const segment = hue / 60
    const secondary = chroma * (1 - Math.abs(segment % 2 - 1))
    const rgb = segment < 1 ? [chroma, secondary, 0] : segment < 2 ? [secondary, chroma, 0] : segment < 3 ? [0, chroma, secondary] : segment < 4 ? [0, secondary, chroma] : segment < 5 ? [secondary, 0, chroma] : [chroma, 0, secondary]
    const offset = lightness - chroma / 2
    const candidate = `#${rgb.map((channel) => Math.round((channel + offset) * 255).toString(16).padStart(2, '0')).join('')}`
    if (!usedColors.has(candidate)) return candidate
  }
  throw new Error('Não foi possível gerar uma cor exclusiva para a categoria.')
}

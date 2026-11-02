import type { DiagnosticsQuickCheckSnapshot } from '../../src/shared/dataManagement'

const quickCheckIds = new Set(['runtime', 'events', 'backups'])
const quickCheckStatuses = new Set(['passed', 'failed'])

function isCanonicalDate(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value
}

/** Accepts only the small, non-sensitive result summary produced by Logs Dev. */
export function isDiagnosticsQuickCheckSnapshotWithinBridgeLimits(
  input: unknown
): input is DiagnosticsQuickCheckSnapshot {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return false
  const value = input as Record<string, unknown>
  if (Object.keys(value).some((key) => !['startedAt', 'completedAt', 'cancelled', 'results'].includes(key))) return false
  if (!isCanonicalDate(value.startedAt) || !isCanonicalDate(value.completedAt) || typeof value.cancelled !== 'boolean') return false
  if (!Array.isArray(value.results) || value.results.length > quickCheckIds.size) return false

  const seen = new Set<string>()
  return value.results.every((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false
    const result = entry as Record<string, unknown>
    if (Object.keys(result).some((key) => !['id', 'status', 'durationMs', 'itemsChecked'].includes(key))) return false
    if (typeof result.id !== 'string' || !quickCheckIds.has(result.id) || seen.has(result.id)) return false
    if (typeof result.status !== 'string' || !quickCheckStatuses.has(result.status)) return false
    if (!Number.isInteger(result.durationMs) || (result.durationMs as number) < 0 || (result.durationMs as number) > 300_000) return false
    if (!Number.isInteger(result.itemsChecked) || (result.itemsChecked as number) < 0 || (result.itemsChecked as number) > 1_000_000) return false
    seen.add(result.id)
    return true
  })
}

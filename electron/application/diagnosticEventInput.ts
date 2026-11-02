import { MAX_DIAGNOSTIC_EVENT_MESSAGE_CHARS } from '../../src/shared/dataManagement'

const DIAGNOSTIC_EVENT_INPUT_KEYS = new Set([
  'severity', 'code', 'route', 'message', 'domain', 'operation', 'stage', 'result', 'durationMs', 'correlationId'
])
const SAFE_EVENT_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i

/** Bounds the bridge payload before it reaches Electron IPC; Main still validates the full contract. */
export function isDiagnosticEventInputWithinBridgeLimits(input: unknown): boolean {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return false
  const event = input as Record<string, unknown>
  if (Object.keys(event).length > DIAGNOSTIC_EVENT_INPUT_KEYS.size
    || Object.keys(event).some((key) => !DIAGNOSTIC_EVENT_INPUT_KEYS.has(key))) return false
  if (typeof event.message !== 'string' || event.message.length > MAX_DIAGNOSTIC_EVENT_MESSAGE_CHARS) return false
  if (typeof event.code === 'string' && event.code.length > 80) return false
  if (typeof event.route === 'string' && event.route.length > 512) return false
  for (const key of ['operation', 'stage']) {
    if (typeof event[key] === 'string' && event[key].length > 80) return false
  }
  if (typeof event.correlationId === 'string' && event.correlationId.length > 36) return false
  return true
}

export function isDiagnosticEventIdListWithinBridgeLimits(input: unknown): input is string[] {
  return Array.isArray(input) && input.length <= 500 && input.every((id) => typeof id === 'string' && SAFE_EVENT_ID.test(id))
}

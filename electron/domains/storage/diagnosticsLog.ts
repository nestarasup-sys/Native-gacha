import { appendFileSync, lstatSync, mkdirSync, readFileSync, realpathSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { appendFile, lstat, mkdir, readFile, realpath, rename, stat, writeFile } from 'node:fs/promises'
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { randomUUID } from 'node:crypto'
import {
  DIAGNOSTIC_DOMAINS, DIAGNOSTIC_RESULTS,
  MAX_DIAGNOSTIC_EVENT_MESSAGE_CHARS,
  type DiagnosticDomain, type DiagnosticResult, type LocalDiagnosticEvent, type LocalDiagnosticEventInput
} from '../../../src/shared/dataManagement'
import { sanitizeDiagnosticRoute } from '../../../src/shared/applicationRoutes'

const MAX_RETAINED_EVENTS = 500
const MAX_LOG_BYTES = 768 * 1024
const MAX_PENDING_EVENTS = 1000
const MAX_EVENT_DURATION_MS = 24 * 60 * 60 * 1000
const SAFE_TECHNICAL_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i

function safeTechnicalLabel(value: unknown): string | undefined {
  return typeof value === 'string' && /^[a-z][a-z0-9._-]{0,79}$/.test(value) ? value : undefined
}

function validDuration(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= MAX_EVENT_DURATION_MS
}

function safeRoute(value: unknown): string | undefined {
  return sanitizeDiagnosticRoute(value)
}

function safeMessage(value: unknown): string {
  if (typeof value !== 'string') return 'Evento sem mensagem textual.'
  return value
    .replace(/\b(authorization|proxy-authorization)\s*[:=]\s*(?:bearer|basic)\s+[^\s,;]+/gi, '$1: [credencial redigida]')
    .replace(/\b(bearer|basic)\s+[a-z0-9+/_=-]{8,}/gi, '$1 [credencial redigida]')
    .replace(/(["']?(?:access[_-]?token|refresh[_-]?token|id[_-]?token|token|api[_-]?key|client[_-]?secret|password|passwd|secret|cookie|set-cookie)["']?\s*[:=]\s*["']?)[^"'`\s,;}]+(["']?)/gi, '$1[credencial redigida]$2')
    .replace(/file:\/\/[^\s"'<>]+/gi, '[endereço local]')
    .replace(/\b[a-z]:[\\/][^\s"'<>]*/gi, '[caminho local]')
    .replace(/\\\\[^\\\s]+\\[^\\\s]+(?:\\[^\\\s]+)*/g, '[caminho local]')
    .replace(/\/(?:Users|home|tmp|private|var|mnt)\/[^\s"'<>]*/gi, '[caminho local]')
    .replace(/https?:\/\/[^\s"'<>]+/gi, '[endereço externo]')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, 400) || 'Evento sem mensagem textual.'
}

function normalizeEvent(input: unknown, source: LocalDiagnosticEvent['source']): LocalDiagnosticEvent {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Evento de diagnóstico inválido.')
  const event = input as Partial<LocalDiagnosticEventInput>
  if (!['error', 'warning', 'info'].includes(String(event.severity))) throw new Error('Nível do evento inválido.')
  if (typeof event.code !== 'string' || !/^[a-z][a-z0-9.-]{1,79}$/.test(event.code)) throw new Error('Código do evento inválido.')
  if (typeof event.message !== 'string' || event.message.length > MAX_DIAGNOSTIC_EVENT_MESSAGE_CHARS) throw new Error('Mensagem do evento inválida ou excessivamente grande.')
  const route = safeRoute(event.route)
  if (event.domain !== undefined && !DIAGNOSTIC_DOMAINS.includes(event.domain as DiagnosticDomain)) throw new Error('Domínio do evento inválido.')
  const operation = safeTechnicalLabel(event.operation)
  if (event.operation !== undefined && !operation) throw new Error('Operação do evento inválida.')
  const stage = safeTechnicalLabel(event.stage)
  if (event.stage !== undefined && !stage) throw new Error('Etapa do evento inválida.')
  if (event.result !== undefined && !DIAGNOSTIC_RESULTS.includes(event.result as DiagnosticResult)) throw new Error('Resultado do evento inválido.')
  if (event.durationMs !== undefined && !validDuration(event.durationMs)) throw new Error('Duração do evento inválida.')
  if (event.correlationId !== undefined && (typeof event.correlationId !== 'string' || !SAFE_TECHNICAL_ID.test(event.correlationId))) throw new Error('Identificador de correlação inválido.')
  return {
    id: randomUUID(),
    at: new Date().toISOString(),
    source,
    severity: event.severity as LocalDiagnosticEvent['severity'],
    code: event.code,
    ...(route ? { route } : {}),
    ...(event.domain !== undefined ? { domain: event.domain as DiagnosticDomain } : {}),
    ...(operation ? { operation } : {}),
    ...(stage ? { stage } : {}),
    ...(event.result !== undefined ? { result: event.result as DiagnosticResult } : {}),
    ...(event.durationMs !== undefined ? { durationMs: Math.round(event.durationMs * 100) / 100 } : {}),
    ...(event.correlationId !== undefined ? { correlationId: event.correlationId } : {}),
    message: safeMessage(event.message)
  }
}

function storedEventMetadata(value: Record<string, unknown>): Partial<LocalDiagnosticEventInput> {
  const metadata: Partial<LocalDiagnosticEventInput> = {}
  if (typeof value.domain === 'string' && DIAGNOSTIC_DOMAINS.includes(value.domain as DiagnosticDomain)) metadata.domain = value.domain as DiagnosticDomain
  const operation = safeTechnicalLabel(value.operation)
  if (operation) metadata.operation = operation
  const stage = safeTechnicalLabel(value.stage)
  if (stage) metadata.stage = stage
  if (typeof value.result === 'string' && DIAGNOSTIC_RESULTS.includes(value.result as DiagnosticResult)) metadata.result = value.result as DiagnosticResult
  if (validDuration(value.durationMs)) metadata.durationMs = value.durationMs
  if (typeof value.correlationId === 'string' && SAFE_TECHNICAL_ID.test(value.correlationId)) metadata.correlationId = value.correlationId
  return metadata
}

function isPathInside(root: string, target: string): boolean {
  const rel = relative(root, target)
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))
}

/** Persists only sanitized error/warning events in a small, bounded JSONL file. */
export function createDiagnosticsLog(dataRoot: string) {
  const root = resolve(dataRoot)
  const filePath = join(root, 'logs', 'diagnostics.jsonl')
  let writeQueue: Promise<void> = Promise.resolve()
  let pendingWrites: Array<{ event: LocalDiagnosticEvent; resolve: () => void; reject: (reason: unknown) => void }> = []
  let flushScheduled = false
  let aggregatedEventCount = 0

  async function ensureSafeLogDirectory(): Promise<void> {
    await mkdir(root, { recursive: true })
    const canonicalRoot = await realpath(root)
    const logDirectory = join(canonicalRoot, 'logs')
    await mkdir(logDirectory, { recursive: true })
    const canonicalLogDirectory = await realpath(logDirectory)
    if (!isPathInside(canonicalRoot, canonicalLogDirectory)) throw new Error('Pasta de logs fora do armazenamento local.')
    try {
      if ((await lstat(filePath)).isSymbolicLink()) throw new Error('Arquivo de diagnóstico inválido.')
    } catch (reason) {
      if ((reason as NodeJS.ErrnoException).code !== 'ENOENT') throw reason
    }
  }

  async function trimIfNeeded(): Promise<void> {
    let current: Buffer
    try {
      if ((await stat(filePath)).size <= MAX_LOG_BYTES) return
      current = await readFile(filePath)
    } catch (reason) {
      if ((reason as NodeJS.ErrnoException).code === 'ENOENT') return
      throw reason
    }
    const retained = current.toString('utf8').split('\n').filter(Boolean).slice(-MAX_RETAINED_EVENTS)
    const temporaryPath = `${filePath}.tmp`
    await writeFile(temporaryPath, retained.length ? `${retained.join('\n')}\n` : '', 'utf8')
    await rename(temporaryPath, filePath)
  }

  function enqueue(operation: () => Promise<void>): Promise<void> {
    const result = writeQueue.then(operation)
    writeQueue = result.catch(() => undefined)
    return result
  }

  function flushPendingWrites(): Promise<void> {
    if (!pendingWrites.length && aggregatedEventCount === 0) return writeQueue
    flushScheduled = false
    const batch = pendingWrites
    pendingWrites = []
    const aggregatedCount = aggregatedEventCount
    aggregatedEventCount = 0
    if (aggregatedCount) {
      batch.push({
        event: normalizeEvent({
          severity: 'warning',
          code: 'diagnostics.events-aggregated',
          domain: 'storage',
          operation: 'diagnostics.write',
          stage: 'backpressure',
          result: 'success',
          message: `${aggregatedCount} eventos adicionais foram agregados porque a fila local atingiu o limite.`
        }, 'main'),
        resolve: () => undefined,
        reject: () => undefined
      })
    }
    const operation = enqueue(async () => {
      await ensureSafeLogDirectory()
      await appendFile(filePath, batch.map(({ event }) => JSON.stringify(event)).join('\n') + '\n', 'utf8')
      await trimIfNeeded()
    })
    void operation.then(
      () => batch.forEach(({ resolve }) => resolve()),
      (reason: unknown) => {
        aggregatedEventCount += aggregatedCount
        batch.forEach(({ reject }) => reject(reason))
      }
    )
    return operation
  }

  function scheduleWriteFlush(): void {
    if (flushScheduled) return
    flushScheduled = true
    queueMicrotask(() => { void flushPendingWrites().catch(() => undefined) })
  }

  function record(input: unknown, source: LocalDiagnosticEvent['source']): Promise<void> {
    const event = normalizeEvent(input, source)
    if (pendingWrites.length >= MAX_PENDING_EVENTS) {
      aggregatedEventCount += 1
      scheduleWriteFlush()
      return Promise.resolve()
    }
    return new Promise((resolve, reject) => {
      pendingWrites.push({ event, resolve, reject })
      scheduleWriteFlush()
    })
  }

  function recordRenderer(input: unknown): Promise<void> {
    return record(input, 'renderer')
  }

  function recordMain(input: LocalDiagnosticEventInput): Promise<void> {
    return record(input, 'main')
  }

  function recordFatalMain(input: LocalDiagnosticEventInput): void {
    try {
      const event = normalizeEvent(input, 'main')
      const canonicalRoot = realpathSync(root)
      const logDirectory = join(canonicalRoot, 'logs')
      mkdirSync(logDirectory, { recursive: true })
      const canonicalLogDirectory = realpathSync(logDirectory)
      if (!isPathInside(canonicalRoot, canonicalLogDirectory)) return
      const canonicalFilePath = join(canonicalLogDirectory, 'diagnostics.jsonl')
      try {
        if (lstatSync(canonicalFilePath).isSymbolicLink()) return
      } catch (reason) {
        if ((reason as NodeJS.ErrnoException).code !== 'ENOENT') return
      }
      appendFileSync(canonicalFilePath, `${JSON.stringify(event)}\n`, 'utf8')
      if (statSync(canonicalFilePath).size > MAX_LOG_BYTES) {
        const retained = readFileSync(canonicalFilePath, 'utf8').split('\n').filter(Boolean).slice(-MAX_RETAINED_EVENTS)
        const temporaryPath = `${canonicalFilePath}.${randomUUID()}.tmp`
        writeFileSync(temporaryPath, retained.length ? `${retained.join('\n')}\n` : '', 'utf8')
        renameSync(temporaryPath, canonicalFilePath)
      }
    } catch { /* Fatal-error capture is best effort and must not alter process shutdown. */ }
  }

  async function list(): Promise<LocalDiagnosticEvent[]> {
    await flushPendingWrites().catch(() => undefined)
    await writeQueue
    try {
      const text = await readFile(filePath, 'utf8')
      return text.split('\n').filter(Boolean).slice(-MAX_RETAINED_EVENTS).flatMap((line) => {
        try {
          const event: unknown = JSON.parse(line)
          if (!event || typeof event !== 'object') return []
          const value = event as Record<string, unknown>
          if (typeof value.severity !== 'string' || !['error', 'warning', 'info'].includes(value.severity)
            || typeof value.source !== 'string' || !['renderer', 'main'].includes(value.source)
            || typeof value.id !== 'string' || typeof value.at !== 'string' || typeof value.code !== 'string' || typeof value.message !== 'string') return []
          const normalized = normalizeEvent({
            severity: value.severity as LocalDiagnosticEvent['severity'],
            code: value.code,
            route: value.route,
            message: value.message,
            ...storedEventMetadata(value)
          }, value.source as LocalDiagnosticEvent['source'])
          return [{ ...normalized, id: value.id, at: value.at }]
        } catch { return [] }
      })
    } catch (reason) {
      if ((reason as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw reason
    }
  }

  return { recordRenderer, recordMain, recordFatalMain, list, fileName: basename(filePath) }
}

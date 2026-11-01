import { appendFile, lstat, mkdir, readFile, realpath, rename, stat, writeFile } from 'node:fs/promises'
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { LocalDiagnosticEvent, LocalDiagnosticEventInput } from '../../../src/shared/dataManagement'

const MAX_RETAINED_EVENTS = 500
const MAX_LOG_BYTES = 768 * 1024
const SAFE_ROUTES = new Set(['/', '/customizar', '/estudio', '/editor-v6', '/roteiros', '/base-videos', '/opcoes', '/fabricador-dev'])

function safeRoute(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const route = value.split(/[?#]/, 1)[0]
  return SAFE_ROUTES.has(route) ? route : '(outra rota)'
}

function safeMessage(value: unknown): string {
  if (typeof value !== 'string') return 'Evento sem mensagem textual.'
  return value
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
  if (typeof event.message !== 'string') throw new Error('Mensagem do evento inválida.')
  const route = safeRoute(event.route)
  return {
    id: randomUUID(),
    at: new Date().toISOString(),
    source,
    severity: event.severity as LocalDiagnosticEvent['severity'],
    code: event.code,
    ...(route ? { route } : {}),
    message: safeMessage(event.message)
  }
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

  function recordRenderer(input: unknown): Promise<void> {
    const event = normalizeEvent(input, 'renderer')
    return enqueue(async () => {
      await ensureSafeLogDirectory()
      await appendFile(filePath, `${JSON.stringify(event)}\n`, 'utf8')
      await trimIfNeeded()
    })
  }

  function recordMain(input: LocalDiagnosticEventInput): Promise<void> {
    const event = normalizeEvent(input, 'main')
    return enqueue(async () => {
      await ensureSafeLogDirectory()
      await appendFile(filePath, `${JSON.stringify(event)}\n`, 'utf8')
      await trimIfNeeded()
    })
  }

  async function list(): Promise<LocalDiagnosticEvent[]> {
    await writeQueue
    try {
      const text = await readFile(filePath, 'utf8')
      return text.split('\n').filter(Boolean).slice(-MAX_RETAINED_EVENTS).flatMap((line) => {
        try {
          const event: unknown = JSON.parse(line)
          if (!event || typeof event !== 'object') return []
          const value = event as LocalDiagnosticEvent
          if (!['error', 'warning', 'info'].includes(value.severity) || !['renderer', 'main'].includes(value.source)
            || typeof value.at !== 'string' || typeof value.code !== 'string' || typeof value.message !== 'string') return []
          const route = safeRoute(value.route)
          return [{ ...value, message: safeMessage(value.message), ...(route ? { route } : {}) }]
        } catch { return [] }
      })
    } catch (reason) {
      if ((reason as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw reason
    }
  }

  return { recordRenderer, recordMain, list, fileName: basename(filePath) }
}

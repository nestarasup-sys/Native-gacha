import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createDiagnosticsLog } from '../electron/domains/storage/diagnosticsLog.ts'

async function withDiagnosticsLog(run) {
  const root = await mkdtemp(join(tmpdir(), 'native-gacha-diagnostics-'))
  try { await run(createDiagnosticsLog(root), root) }
  finally { await rm(root, { recursive: true, force: true }) }
}

test('persists validated structured metadata and removes credentials, paths, URLs and unknown fields', async () => {
  await withDiagnosticsLog(async (log) => {
    const correlationId = '123e4567-e89b-42d3-a456-426614174000'
    await log.recordRenderer({
      severity: 'error',
      code: 'editor-v6.export-failed',
      route: '/logs-dev?section=events',
      domain: 'editor-v6',
      operation: 'export.mp4',
      stage: 'encode',
      result: 'failure',
      durationMs: 12.347,
      correlationId,
      message: 'Authorization: Bearer abcdefghijklmnop access_token=private "password":"s3cret" Cookie: session=secret-cookie API_KEY=secret-api-key C:\\Users\\Luiz\\private.json https://user:pass@example.com',
      projectName: 'must-not-be-stored'
    })

    const [event] = await log.list()
    assert.equal(event.source, 'renderer')
    assert.equal(event.route, '/logs-dev')
    assert.equal(event.domain, 'editor-v6')
    assert.equal(event.operation, 'export.mp4')
    assert.equal(event.stage, 'encode')
    assert.equal(event.result, 'failure')
    assert.equal(event.durationMs, 12.35)
    assert.equal(event.correlationId, correlationId)
    assert.equal(Object.hasOwn(event, 'projectName'), false)
    for (const secret of ['abcdefghijklmnop', 'private', 's3cret', 'secret-cookie', 'secret-api-key', 'C:\\Users\\Luiz', 'user:pass']) {
      assert.equal(event.message.includes(secret), false, `secret remained in message: ${secret}`)
    }
  })
})

test('keeps legacy JSONL events readable and reconstructs only known sanitized fields', async () => {
  await withDiagnosticsLog(async (log, root) => {
    const logDirectory = join(root, 'logs')
    await mkdir(logDirectory, { recursive: true })
    const oldEvent = {
      id: 'legacy-event-id',
      at: '2025-01-02T03:04:05.000Z',
      source: 'main',
      severity: 'warning',
      code: 'storage.scan-warning',
      route: '/opcoes#old',
      message: 'Falha em C:\\Users\\Luiz\\dados.json',
      privatePath: 'C:\\Users\\Luiz\\segredo',
      domain: 'C:\\private',
      operation: 'contains personal details',
      correlationId: 'luiz@example.com',
      durationMs: -1
    }
    await writeFile(join(logDirectory, 'diagnostics.jsonl'), `${JSON.stringify(oldEvent)}\nnot-json\n{"severity":"fatal"}\n`, 'utf8')

    const [event] = await log.list()
    assert.equal(event.id, 'legacy-event-id')
    assert.equal(event.at, oldEvent.at)
    assert.equal(event.route, '/opcoes')
    assert.equal(event.message.includes('C:\\Users\\Luiz'), false)
    assert.equal(Object.hasOwn(event, 'privatePath'), false)
    assert.equal(Object.hasOwn(event, 'domain'), false)
    assert.equal(Object.hasOwn(event, 'operation'), false)
    assert.equal(Object.hasOwn(event, 'correlationId'), false)
    assert.equal(Object.hasOwn(event, 'durationMs'), false)
  })
})

test('rejects oversized messages and malformed structured metadata before writing', async () => {
  await withDiagnosticsLog(async (log) => {
    const base = { severity: 'error', code: 'renderer.failure', message: 'fixture' }
    assert.throws(() => log.recordRenderer({ ...base, message: 'x'.repeat(16_385) }), /excessivamente grande/)
    assert.throws(() => log.recordRenderer({ ...base, domain: 'C:\\private' }), /Domínio do evento inválido/)
    assert.throws(() => log.recordRenderer({ ...base, operation: 'Export with private details' }), /Operação do evento inválida/)
    assert.throws(() => log.recordRenderer({ ...base, durationMs: Number.POSITIVE_INFINITY }), /Duração do evento inválida/)
    assert.throws(() => log.recordRenderer({ ...base, correlationId: 'luiz@example.com' }), /Identificador de correlação inválido/)
    assert.deepEqual(await log.list(), [])
  })
})

test('serializes concurrent writes and exposes at most 500 recent events', async () => {
  await withDiagnosticsLog(async (log) => {
    await Promise.all(Array.from({ length: 505 }, (_, index) => log.recordMain({
      severity: 'warning', code: 'storage.concurrent-write', message: `fixture-${index}`
    })))

    const events = await log.list()
    assert.equal(events.length, 500)
    assert.equal(events[0].message, 'fixture-5')
    assert.equal(events.at(-1).message, 'fixture-504')
    assert.equal(new Set(events.map((event) => event.id)).size, 500)
  })
})

test('bounds write backlog and records how many excess events were aggregated', async () => {
  await withDiagnosticsLog(async (log) => {
    await Promise.all(Array.from({ length: 1_505 }, (_, index) => log.recordRenderer({
      severity: 'error', code: 'renderer.uncaught-error', message: `flood-fixture-${index}`
    })))

    const events = await log.list()
    const summary = events.at(-1)
    assert.equal(events.length, 500)
    assert.equal(summary.code, 'diagnostics.events-aggregated')
    assert.match(summary.message, /505 eventos adicionais foram agregados/)
    assert.equal(summary.domain, 'storage')
  })
})

test('listing flushes a queued write even when the caller has not awaited it', async () => {
  await withDiagnosticsLog(async (log) => {
    const pendingWrite = log.recordRenderer({ severity: 'info', code: 'ui.test-event', message: 'queued fixture' })
    const events = await log.list()
    await pendingWrite
    assert.equal(events.length, 1)
    assert.equal(events[0].message, 'queued fixture')
  })
})

test('a failed batch rejects its callers but does not poison later writes', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'native-gacha-diagnostics-recovery-'))
  const root = join(parent, 'data-root')
  try {
    await writeFile(root, 'blocks-directory-creation', 'utf8')
    const log = createDiagnosticsLog(root)
    await assert.rejects(log.recordMain({ severity: 'error', code: 'storage.write-failed', message: 'first attempt' }))
    await rm(root)
    await mkdir(root)
    await log.recordMain({ severity: 'error', code: 'storage.write-recovered', message: 'second attempt' })
    assert.deepEqual((await log.list()).map(({ code }) => code), ['storage.write-recovered'])
  } finally {
    await rm(parent, { recursive: true, force: true })
  }
})

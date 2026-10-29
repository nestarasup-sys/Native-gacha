import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import * as nativeFiles from 'node:fs/promises'
import { dirname, join, relative, resolve, sep } from 'node:path'

export type RoteiroCharacterExportFiles = Pick<typeof nativeFiles,
  'copyFile' | 'lstat' | 'mkdir' | 'readFile' | 'readdir' | 'realpath' | 'rename' | 'rm' | 'writeFile'
>

export type RoteiroCharacterExportWrite = {
  path: string
  size: number
  sha256: string
  sourcePath?: string
  sourceSignature?: FileSignature
  bytes?: Buffer
}

export type RoteiroCharacterExportChanges = {
  writes: readonly RoteiroCharacterExportWrite[]
  removes: readonly string[]
}

type FileSignature = { dev: number; ino: number; size: number; mtimeMs: number }
type JournalEntry = {
  path: string
  action: 'write' | 'remove'
  hadOriginal: boolean
  original?: FileSignature
  backupPath: string
  temporaryPath?: string
  size?: number
  sha256?: string
}
type Journal = { schemaVersion: 1; transactionId: string; entries: JournalEntry[] }

const transactionPrefix = '.gacha-v5-character-export-transaction-'
const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const digestPattern = /^[0-9a-f]{64}$/i
const isMissing = (reason: unknown) => (reason as NodeJS.ErrnoException)?.code === 'ENOENT'

export function isRoteiroCharacterExportAssetPath(path: string): boolean {
  return /^assets\/characters\/[a-z0-9-]{1,72}\/POSE (?:[1-9]|[1-9]\d|100)\/(?:pt_)?[a-z0-9_-]{1,72}(?:_(?:blink|talk))?\.png$/i.test(path)
}

export function isRoteiroCharacterExportPath(path: string): boolean {
  return path === '.nymi-script.json'
    || /^[a-z0-9-]{1,72}\.gacha\.json$/i.test(path)
    || isRoteiroCharacterExportAssetPath(path)
}

function safeSegments(path: string): string[] {
  if (typeof path !== 'string' || !path || /[\0\r\n]/.test(path) || path.includes('\\') || path.startsWith('/') || /^[a-z]:/i.test(path)) {
    throw new Error('Caminho inválido na publicação de personagens.')
  }
  const parts = path.split('/')
  if (parts.some((part) => !part || part === '.' || part === '..')) throw new Error('Caminho inválido na publicação de personagens.')
  return parts
}

function signature(info: Awaited<ReturnType<RoteiroCharacterExportFiles['lstat']>>): FileSignature {
  return { dev: Number(info.dev), ino: Number(info.ino), size: Number(info.size), mtimeMs: Number(info.mtimeMs) }
}

function sameSignature(info: Awaited<ReturnType<RoteiroCharacterExportFiles['lstat']>>, expected: FileSignature): boolean {
  return info.isFile() && info.dev === expected.dev && info.ino === expected.ino
    && info.size === expected.size && info.mtimeMs === expected.mtimeMs
}

function isSignature(value: unknown): value is FileSignature {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const item = value as Partial<FileSignature>
  return Number.isFinite(item.dev) && Number.isFinite(item.ino)
    && Number.isSafeInteger(item.size) && item.size! >= 0 && Number.isFinite(item.mtimeMs)
}

async function existingFile(files: RoteiroCharacterExportFiles, path: string) {
  try {
    const info = await files.lstat(path)
    if (info.isSymbolicLink() || !info.isFile()) throw new Error('A publicação encontrou um destino que não é arquivo regular.')
    return info
  } catch (reason) {
    if (isMissing(reason)) return null
    throw reason
  }
}

async function assertProjectFolder(files: RoteiroCharacterExportFiles, folder: string): Promise<boolean> {
  try {
    const info = await files.lstat(folder)
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('A pasta de exportação de personagens não é segura.')
    return true
  } catch (reason) {
    if (isMissing(reason)) return false
    throw reason
  }
}

function resolveInside(folder: string, path: string): string {
  const parts = safeSegments(path)
  const target = resolve(folder, ...parts)
  const rel = relative(folder, target)
  if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || resolve(folder, rel) !== target) {
    throw new Error('Destino fora da pasta do projeto.')
  }
  return target
}

async function assertSafePath(files: RoteiroCharacterExportFiles, folder: string, path: string): Promise<string> {
  const target = resolveInside(folder, path)
  const parts = safeSegments(path)
  let current = folder
  for (let index = 0; index < parts.length; index += 1) {
    current = join(current, parts[index])
    let info
    try { info = await files.lstat(current) }
    catch (reason) { if (isMissing(reason)) continue; throw reason }
    if (info.isSymbolicLink() || (index < parts.length - 1 ? !info.isDirectory() : !info.isFile())) {
      throw new Error('A publicação encontrou um caminho não seguro dentro do projeto.')
    }
  }
  return target
}

function hash(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

async function matchesContent(files: RoteiroCharacterExportFiles, path: string, entry: JournalEntry): Promise<boolean> {
  if (entry.action !== 'write' || !Number.isSafeInteger(entry.size) || !entry.sha256) return false
  const info = await existingFile(files, path)
  if (!info || info.size !== entry.size) return false
  return hash(await files.readFile(path)) === entry.sha256
}

function journalPath(folder: string, id: string): string { return join(folder, `${transactionPrefix}${id}.json`) }
function journalTempPath(folder: string, id: string): string { return `${journalPath(folder, id)}.tmp` }
function markerPath(folder: string, id: string): string { return join(folder, `${transactionPrefix}${id}.committed`) }
function markerTempPath(folder: string, id: string): string { return `${markerPath(folder, id)}.tmp` }

function derivedArtifactPath(path: string, id: string, suffix: 'tmp' | 'bak'): string {
  return `${path}.${id}.${suffix}`
}

function parseTransactionName(name: string): { id: string; kind: 'journal' | 'journal-temp' | 'marker' | 'marker-temp' } | null {
  if (!name.startsWith(transactionPrefix)) return null
  const value = name.slice(transactionPrefix.length)
  const suffixes = [
    ['.json.tmp', 'journal-temp'],
    ['.committed.tmp', 'marker-temp'],
    ['.json', 'journal'],
    ['.committed', 'marker']
  ] as const
  for (const [suffix, kind] of suffixes) {
    if (!value.endsWith(suffix)) continue
    const id = value.slice(0, -suffix.length)
    if (idPattern.test(id)) return { id, kind }
  }
  throw new Error(`Arquivo de recuperação com nome inválido (${name}); preservei os dados.`)
}

function validateJournal(value: unknown, id: string): Journal {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Journal de personagens inválido; preservei os dados.')
  const journal = value as Partial<Journal>
  if (journal.schemaVersion !== 1 || journal.transactionId !== id || !Array.isArray(journal.entries)) {
    throw new Error('Journal de personagens inválido; preservei os dados.')
  }
  const seen = new Set<string>()
  for (const raw of journal.entries) {
    if (!raw || typeof raw !== 'object') throw new Error('Entrada inválida no journal de personagens; preservei os dados.')
    const entry = raw as JournalEntry
    if ((entry.action !== 'write' && entry.action !== 'remove') || typeof entry.path !== 'string'
      || typeof entry.hadOriginal !== 'boolean' || !isRoteiroCharacterExportPath(entry.path)
      || entry.backupPath !== derivedArtifactPath(entry.path, id, 'bak')
      || entry.hadOriginal && !isSignature(entry.original)
      || !entry.hadOriginal && entry.original !== undefined
      || entry.action === 'write' && (entry.temporaryPath !== derivedArtifactPath(entry.path, id, 'tmp')
        || !Number.isSafeInteger(entry.size) || entry.size! < 0 || typeof entry.sha256 !== 'string' || !digestPattern.test(entry.sha256))
      || entry.action === 'remove' && (entry.temporaryPath !== undefined || entry.size !== undefined || entry.sha256 !== undefined)) {
      throw new Error('Entrada inválida no journal de personagens; preservei os dados.')
    }
    safeSegments(entry.path)
    if (seen.has(entry.path)) throw new Error('Journal de personagens contém destinos duplicados; preservei os dados.')
    seen.add(entry.path)
  }
  return journal as Journal
}

export function createRoteiroCharacterExportPublication(files: RoteiroCharacterExportFiles = nativeFiles) {
  async function removeTemporaryArtifact(folder: string, path: string): Promise<void> {
    await assertSafePath(files, folder, path)
    const info = await existingFile(files, resolveInside(folder, path))
    if (info) await files.rm(resolveInside(folder, path), { force: true })
  }

  async function removeBackup(folder: string, entry: JournalEntry): Promise<void> {
    const backup = await existingFile(files, await assertSafePath(files, folder, entry.backupPath))
    if (!backup) return
    if (!entry.hadOriginal || !sameSignature(backup, entry.original!)) throw new Error(`Backup de ${entry.path} mudou; preservei o arquivo para inspeção.`)
    await files.rm(resolveInside(folder, entry.backupPath), { force: true })
  }

  async function removeUncommittedOutputTemporary(folder: string, entry: JournalEntry): Promise<void> {
    if (!entry.temporaryPath) return
    const path = await assertSafePath(files, folder, entry.temporaryPath)
    const info = await existingFile(files, path)
    if (!info) return
    if (info.size > entry.size! || info.size === entry.size && !await matchesContent(files, path, entry)) {
      throw new Error(`Temporário de ${entry.path} contém alterações inesperadas; preservei o arquivo.`)
    }
    await files.rm(path, { force: true })
  }

  async function cleanupCommitted(folder: string, id: string, journal: Journal): Promise<void> {
    for (const entry of journal.entries) {
      if (entry.temporaryPath) {
        const tempPath = await assertSafePath(files, folder, entry.temporaryPath)
        const temp = await existingFile(files, tempPath)
        if (temp) {
          if (!await matchesContent(files, tempPath, entry)) throw new Error(`Temporário de ${entry.path} mudou; preservei a transação.`)
          await files.rm(tempPath, { force: true })
        }
      }
      await removeBackup(folder, entry)
    }
    await removeTemporaryArtifact(folder, `${transactionPrefix}${id}.json.tmp`)
    await removeTemporaryArtifact(folder, `${transactionPrefix}${id}.committed.tmp`)
    await removeTemporaryArtifact(folder, `${transactionPrefix}${id}.json`)
    await removeTemporaryArtifact(folder, `${transactionPrefix}${id}.committed`)
  }

  async function rollback(folder: string, id: string, journal: Journal): Promise<void> {
    for (const entry of [...journal.entries].reverse()) {
      const targetPath = await assertSafePath(files, folder, entry.path)
      const target = await existingFile(files, targetPath)
      const backupPath = await assertSafePath(files, folder, entry.backupPath)
      const backup = await existingFile(files, backupPath)
      if (!entry.hadOriginal) {
        if (target) {
          if (!await matchesContent(files, targetPath, entry)) throw new Error(`O arquivo ${entry.path} mudou durante a recuperação; não o sobrescrevi.`)
          await files.rm(targetPath, { force: true })
        }
      } else if (backup) {
        if (!sameSignature(backup, entry.original!)) throw new Error(`Backup de ${entry.path} está inválido; preservei os dados.`)
        if (target) {
          if (sameSignature(target, entry.original!)) throw new Error(`Original e backup de ${entry.path} coexistem; preservei ambos.`)
          if (entry.action !== 'write' || !await matchesContent(files, targetPath, entry)) {
            throw new Error(`O arquivo ${entry.path} mudou durante a recuperação; não o sobrescrevi.`)
          }
          await files.rm(targetPath, { force: true })
        }
        await files.rename(backupPath, targetPath)
        const restored = await files.lstat(targetPath)
        if (!sameSignature(restored, entry.original!)) throw new Error(`Não confirmei a restauração de ${entry.path}; preservei o journal.`)
      } else if (!target || !sameSignature(target, entry.original!)) {
        throw new Error(`Original e backup de ${entry.path} estão ausentes; preservei o journal.`)
      }
    }
    for (const entry of journal.entries) {
      await removeUncommittedOutputTemporary(folder, entry)
      const backup = await existingFile(files, resolveInside(folder, entry.backupPath))
      if (backup) throw new Error(`Backup não restaurado de ${entry.path}; preservei o journal.`)
    }
    await removeTemporaryArtifact(folder, `${transactionPrefix}${id}.json.tmp`)
    await removeTemporaryArtifact(folder, `${transactionPrefix}${id}.committed.tmp`)
    await removeTemporaryArtifact(folder, `${transactionPrefix}${id}.json`)
  }

  async function recoverOne(folder: string, id: string): Promise<void> {
    const journalFile = journalPath(folder, id)
    const journalInfo = await existingFile(files, journalFile)
    const markerFile = markerPath(folder, id)
    const markerInfo = await existingFile(files, markerFile)
    if (markerInfo && (await files.readFile(markerFile, 'utf8')).trim() !== id) throw new Error('Marcador de commit de personagens inválido; preservei os dados.')
    if (!journalInfo) {
      if (markerInfo) {
        await removeTemporaryArtifact(folder, `${transactionPrefix}${id}.json.tmp`)
        await removeTemporaryArtifact(folder, `${transactionPrefix}${id}.committed.tmp`)
        await removeTemporaryArtifact(folder, `${transactionPrefix}${id}.committed`)
        return
      }
      await removeTemporaryArtifact(folder, `${transactionPrefix}${id}.json.tmp`)
      if (await existingFile(files, markerTempPath(folder, id))) throw new Error('Marcador incompleto sem journal; preservei o arquivo para inspeção.')
      return
    }

    let parsed: unknown
    try { parsed = JSON.parse(await files.readFile(journalFile, 'utf8')) }
    catch (reason) {
      if (reason instanceof SyntaxError) throw new Error('Journal de personagens corrompido; preservei os arquivos para inspeção.')
      throw reason
    }
    const journal = validateJournal(parsed, id)
    if (markerInfo) await cleanupCommitted(folder, id, journal)
    else await rollback(folder, id, journal)
  }

  async function recoverProject(folder: string): Promise<void> {
    if (!await assertProjectFolder(files, folder)) return
    const entries = await files.readdir(folder, { withFileTypes: true })
    const ids = new Set<string>()
    for (const entry of entries) {
      const parsed = parseTransactionName(entry.name)
      if (parsed) ids.add(parsed.id)
    }
    for (const id of [...ids].sort()) await recoverOne(folder, id)
  }

  async function publish(folder: string, id: string, changes: RoteiroCharacterExportChanges): Promise<void> {
    if (!idPattern.test(id)) throw new Error('ID de transação de personagens inválido.')
    if (!await assertProjectFolder(files, folder)) throw new Error('A pasta de projeto não existe para publicar os personagens.')
    const writes = [...changes.writes]
    const writesByPath = new Map(writes.map((write) => [write.path, write]))
    const removes = [...changes.removes]
    const allPaths = [...writes.map(({ path }) => path), ...removes]
    if (new Set(allPaths).size !== allPaths.length) throw new Error('A publicação de personagens contém destinos duplicados.')
    if (!allPaths.length) return
    await recoverProject(folder)

    const entries: JournalEntry[] = []
    const operations: Array<{ path: string; action: 'write' | 'remove'; write?: RoteiroCharacterExportWrite }> = [
      ...writes.map((write) => ({ path: write.path, action: 'write' as const, write })),
      ...removes.map((path) => ({ path, action: 'remove' as const }))
    ]
    for (const operation of operations) {
      if (!isRoteiroCharacterExportPath(operation.path)) throw new Error('A publicação contém um caminho fora dos arquivos de personagens permitidos.')
      const targetPath = await assertSafePath(files, folder, operation.path)
      const original = await existingFile(files, targetPath)
      const backupPath = derivedArtifactPath(operation.path, id, 'bak')
      const backupTarget = await assertSafePath(files, folder, backupPath)
      const temporaryPath = operation.action === 'write' ? derivedArtifactPath(operation.path, id, 'tmp') : undefined
      const temporaryTarget = temporaryPath ? await assertSafePath(files, folder, temporaryPath) : undefined
      if (await existingFile(files, backupTarget) || temporaryTarget && await existingFile(files, temporaryTarget)) {
        throw new Error(`A transação de ${operation.path} colide com um temporário existente; preservei os dados.`)
      }
      const entry: JournalEntry = {
        path: operation.path,
        action: operation.action,
        hadOriginal: original !== null,
        backupPath,
        ...(original ? { original: signature(original) } : {})
      }
      if (operation.action === 'write') {
        const write = operation.write!
        if (!Number.isSafeInteger(write.size) || write.size < 0 || !digestPattern.test(write.sha256)
          || Boolean(write.sourcePath) === Boolean(write.bytes)) throw new Error(`Conteúdo de ${operation.path} inválido para publicar.`)
        if (write.sourcePath) {
          const source = await existingFile(files, write.sourcePath)
          if (!source || source.size !== write.size || write.sourceSignature && !sameSignature(source, write.sourceSignature)) {
            throw new Error(`O asset staged de ${operation.path} mudou antes da publicação.`)
          }
        } else if (write.bytes!.length !== write.size || hash(write.bytes!) !== write.sha256) {
          throw new Error(`O conteúdo staged de ${operation.path} não corresponde ao journal.`)
        }
        entry.temporaryPath = temporaryPath!
        entry.size = write.size
        entry.sha256 = write.sha256
      }
      entries.push(entry)
    }

    const journal: Journal = { schemaVersion: 1, transactionId: id, entries }
    const journalFile = journalPath(folder, id)
    const journalTemporary = journalTempPath(folder, id)
    const marker = markerPath(folder, id)
    const markerTemporary = markerTempPath(folder, id)
    if (await existingFile(files, journalFile) || await existingFile(files, journalTemporary)
      || await existingFile(files, marker) || await existingFile(files, markerTemporary)) throw new Error('Journal de personagens já existe; preservei os dados.')
    let journalPublished = false
    try {
      await files.writeFile(journalTemporary, JSON.stringify(journal), { flag: 'wx' })
      await files.rename(journalTemporary, journalFile)
      journalPublished = true

      for (const entry of entries) {
        const target = await assertSafePath(files, folder, entry.path)
        const current = await existingFile(files, target)
        if (entry.hadOriginal) {
          if (!current || !sameSignature(current, entry.original!)) throw new Error(`O arquivo ${entry.path} mudou antes da publicação; não o sobrescrevi.`)
        } else if (current) throw new Error(`O arquivo ${entry.path} surgiu durante a publicação e foi preservado.`)

        if (entry.action === 'remove') {
          if (current) await files.rename(target, await assertSafePath(files, folder, entry.backupPath))
          continue
        }

        const write = writesByPath.get(entry.path)!
        const temporary = await assertSafePath(files, folder, entry.temporaryPath!)
        await files.mkdir(dirname(temporary), { recursive: true })
        if (write.sourcePath) await files.copyFile(write.sourcePath, temporary, constants.COPYFILE_EXCL)
        else await files.writeFile(temporary, write.bytes!, { flag: 'wx' })
        const staged = await existingFile(files, temporary)
        if (!staged || staged.size !== entry.size || !await matchesContent(files, temporary, entry)) {
          throw new Error(`O temporário de ${entry.path} não corresponde ao conteúdo preparado.`)
        }
        if (current) {
          await files.rename(target, await assertSafePath(files, folder, entry.backupPath))
          const backup = await files.lstat(resolveInside(folder, entry.backupPath))
          if (!sameSignature(backup, entry.original!)) throw new Error(`O backup de ${entry.path} não pôde ser confirmado.`)
        }
        if (await existingFile(files, target)) throw new Error(`O destino ${entry.path} reapareceu durante a publicação; preservei o arquivo.`)
        await files.rename(temporary, target)
        const installed = await files.lstat(target)
        if (!sameSignature(installed, signature(staged)) || !await matchesContent(files, target, entry)) {
          throw new Error(`A publicação de ${entry.path} não pôde ser confirmada.`)
        }
      }

      await files.writeFile(markerTemporary, `${id}\n`, { flag: 'wx' })
      await files.rename(markerTemporary, marker)
      await cleanupCommitted(folder, id, journal).catch(() => undefined)
    } catch (error) {
      if (!journalPublished) {
        await removeTemporaryArtifact(folder, `${transactionPrefix}${id}.json.tmp`).catch(() => undefined)
        throw error
      }
      try { await recoverOne(folder, id) }
      catch (recoveryError) {
        throw new AggregateError([error, recoveryError], 'A publicação de personagens falhou; o journal foi preservado para a próxima recuperação.')
      }
      throw error
    }
  }

  return { recoverProject, publish }
}

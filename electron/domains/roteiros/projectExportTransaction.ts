import { randomUUID } from 'node:crypto'
import * as nativeFiles from 'node:fs/promises'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { createKeyedOperationQueue } from '../storage/keyedOperationQueue.ts'

export type RoteiroProjectExportFiles = Pick<typeof nativeFiles,
  'copyFile' | 'lstat' | 'mkdir' | 'readdir' | 'readFile' | 'rename' | 'rm' | 'rmdir' | 'stat' | 'writeFile'
>

export type RoteiroProjectExportWrite = {
  path: string
  bytes?: Buffer
  sourcePath?: string
  expectedSize?: number
}

export type RoteiroProjectExportChanges = {
  writes: readonly RoteiroProjectExportWrite[]
  removes?: readonly string[]
}

type FileSignature = { dev: number; ino: number; size: number; mtimeMs: number }
type JournalEntry = {
  path: string
  action: 'write' | 'remove'
  hadOriginal: boolean
  original?: FileSignature
  backup?: FileSignature
  staged?: FileSignature
}
type Journal = { schemaVersion: 1; transactionId: string; entries: JournalEntry[] }
type TransactionState = 'prepared' | 'committed' | 'rolledback'
type Owner = { transactionId: string; state: TransactionState }

const transactionPrefix = '.gacha-v5-roteiro-export-transaction-'
export const roteiroProjectExportManifestPath = '.gacha-v5-roteiro-exports.json'
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const isMissing = (reason: unknown) => (reason as NodeJS.ErrnoException)?.code === 'ENOENT'

export function isRoteiroProjectExportAssetPath(path: string): boolean {
  return path === 'roteiro.txt'
    || path === 'assets/ui/loading.gif'
    || /^assets\/backgrounds\/01\.(png|jpg|jpeg|webp)$/.test(path)
    || /^assets\/tiktoks\/\d{2,}\.(mp4|webm|mov|m4v)$/.test(path)
}

function isRoteiroProjectExportTransactionPath(path: string): boolean {
  return path === roteiroProjectExportManifestPath || isRoteiroProjectExportAssetPath(path)
}

function signature(info: Awaited<ReturnType<RoteiroProjectExportFiles['lstat']>>): FileSignature {
  return { dev: Number(info.dev), ino: Number(info.ino), size: Number(info.size), mtimeMs: Number(info.mtimeMs) }
}

function sameSignature(info: Awaited<ReturnType<RoteiroProjectExportFiles['lstat']>>, expected: FileSignature): boolean {
  return info.isFile() && info.dev === expected.dev && info.ino === expected.ino
    && info.size === expected.size && info.mtimeMs === expected.mtimeMs
}

function isSignature(value: unknown): value is FileSignature {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const item = value as Partial<FileSignature>
  return Number.isFinite(item.dev) && Number.isFinite(item.ino)
    && Number.isSafeInteger(item.size) && item.size! >= 0 && Number.isFinite(item.mtimeMs)
}

function parseOwner(value: string): Owner | null {
  const [transactionId, state, extra] = value.trim().split('\n')
  if (!uuidPattern.test(transactionId) || extra !== undefined
    || state !== 'prepared' && state !== 'committed' && state !== 'rolledback') return null
  return { transactionId, state }
}

function safeRelativeSegments(path: string): string[] {
  if (typeof path !== 'string' || !path || path.includes('\0') || path.includes('\\')
    || path.startsWith('/') || /^[a-z]:/i.test(path)) throw new Error('Caminho inválido na transação de exportação.')
  const segments = path.split('/')
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) throw new Error('Caminho inválido na transação de exportação.')
  return segments
}

async function existingFile(files: RoteiroProjectExportFiles, path: string) {
  try {
    const info = await files.lstat(path)
    if (info.isSymbolicLink() || !info.isFile()) throw new Error('A exportação encontrou um destino que não é arquivo regular.')
    return info
  } catch (reason) {
    if (isMissing(reason)) return null
    throw reason
  }
}

export function createRoteiroProjectExportTransaction(files: RoteiroProjectExportFiles = nativeFiles) {
  const queue = createKeyedOperationQueue()

  function targetPath(folder: string, path: string): string {
    const segments = safeRelativeSegments(path)
    if (!isRoteiroProjectExportTransactionPath(path)) throw new Error('Destino fora dos arquivos controlados da exportação de Roteiros.')
    if (segments[0].startsWith(transactionPrefix)) throw new Error('Destino reservado da transação de exportação.')
    const target = resolve(folder, ...segments)
    const rel = relative(folder, target)
    if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || resolve(folder, rel) !== target) {
      throw new Error('Destino de exportação fora da pasta do roteiro.')
    }
    return target
  }

  async function assertSafePath(folder: string, path: string): Promise<string> {
    const target = targetPath(folder, path)
    const segments = safeRelativeSegments(path)
    let current = folder
    for (let index = 0; index < segments.length; index += 1) {
      current = join(current, segments[index])
      let info
      try { info = await files.lstat(current) }
      catch (reason) { if (isMissing(reason)) continue; throw reason }
      if (info.isSymbolicLink() || (index < segments.length - 1 ? !info.isDirectory() : !info.isFile())) {
        throw new Error('A exportação encontrou um caminho não seguro dentro do projeto.')
      }
    }
    return target
  }

  async function assertProjectFolder(folder: string): Promise<boolean> {
    try {
      const info = await files.lstat(folder)
      if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('A pasta de exportação do roteiro não é segura.')
      return true
    } catch (reason) {
      if (isMissing(reason)) return false
      throw reason
    }
  }

  function transactionFolder(folder: string, id: string): string {
    if (!uuidPattern.test(id)) throw new Error('Identificador de transação inválido.')
    return join(folder, `${transactionPrefix}${id}`)
  }

  async function cleanupTransaction(transaction: string, id: string, state: TransactionState): Promise<void> {
    const ownerPath = join(transaction, 'owner')
    const ownerInfo = await existingFile(files, ownerPath)
    if (!ownerInfo) {
      const contents = await files.readdir(transaction)
      if (contents.length) throw new Error('A transação perdeu o marcador de propriedade; preservei seu conteúdo.')
      await files.rmdir(transaction)
      return
    }
    const currentOwner = parseOwner(await files.readFile(ownerPath, 'utf8'))
    if (!currentOwner || currentOwner.transactionId !== id) throw new Error('Marcador de propriedade inválido; preservei a transação.')
    if (currentOwner.state !== state) {
      const temporaryOwner = join(transaction, `owner-${randomUUID()}.tmp`)
      await files.writeFile(temporaryOwner, `${id}\n${state}\n`, { flag: 'wx' })
      await files.rename(temporaryOwner, ownerPath)
    }

    for (const [name, filenamePattern] of [['staged', /^\d+\.tmp$/], ['backups', /^\d+\.bak$/]] as const) {
      try {
        const directory = join(transaction, name)
        const info = await files.lstat(directory)
        if (!info.isDirectory() || info.isSymbolicLink()) throw new Error(`Diretório ${name} da transação é inseguro; preservei seu conteúdo.`)
        for (const entry of await files.readdir(directory, { withFileTypes: true })) {
          if (!filenamePattern.test(entry.name) || !entry.isFile()) throw new Error(`Conteúdo inesperado em ${name}; preservei a transação.`)
          const fileInfo = await files.lstat(join(directory, entry.name))
          if (!fileInfo.isFile() || fileInfo.isSymbolicLink()) throw new Error(`Arquivo inseguro em ${name}; preservei a transação.`)
        }
      } catch (reason) {
        if (!isMissing(reason)) throw reason
      }
    }
    await files.rm(join(transaction, 'staged'), { recursive: true, force: true })
    await files.rm(join(transaction, 'backups'), { recursive: true, force: true })
    for (const name of ['journal.json', 'journal.tmp', 'committed.tmp', 'committed.ok']) {
      await files.rm(join(transaction, name), { force: true })
    }
    for (const entry of await files.readdir(transaction, { withFileTypes: true })) {
      if (!/^owner-[0-9a-f-]{36}\.tmp$/i.test(entry.name)) continue
      const temporaryOwner = join(transaction, entry.name)
      const info = await files.lstat(temporaryOwner)
      if (!info.isFile() || info.isSymbolicLink()) throw new Error('Marcador temporário não seguro; preservei a transação.')
      await files.rm(temporaryOwner, { force: true })
    }
    const remaining = await files.readdir(transaction)
    if (remaining.some((name) => name !== 'owner')) throw new Error('A transação contém arquivos desconhecidos; preservei seu conteúdo.')
    await files.rm(ownerPath, { force: true })
    await files.rmdir(transaction)
  }

  async function recoverOne(folder: string, transaction: string, id: string): Promise<void> {
    const ownerPath = join(transaction, 'owner')
    const journalPath = join(transaction, 'journal.json')
    const ownerInfo = await existingFile(files, ownerPath)
    if (!ownerInfo) {
      const contents = await files.readdir(transaction)
      if (contents.length) throw new Error('Pasta de transação sem proprietário; preservei seu conteúdo.')
      await files.rmdir(transaction)
      return
    }
    const owner = parseOwner(await files.readFile(ownerPath, 'utf8'))
    if (!owner || owner.transactionId !== id) throw new Error('Marcador de propriedade inválido; preservei a transação.')
    if (owner.state !== 'prepared') {
      await cleanupTransaction(transaction, id, owner.state)
      return
    }
    for (const directoryName of ['staged', 'backups']) {
      const directoryPath = join(transaction, directoryName)
      try {
        const info = await files.lstat(directoryPath)
        if (!info.isDirectory() || info.isSymbolicLink()) throw new Error(`Diretório ${directoryName} da transação é inseguro; preservei o journal.`)
      } catch (reason) {
        if (!isMissing(reason)) throw reason
      }
    }
    const journalInfo = await existingFile(files, journalPath)
    if (!journalInfo) {
      const marker = await existingFile(files, join(transaction, 'committed.ok'))
      if (marker) {
        if ((await files.readFile(join(transaction, 'committed.ok'), 'utf8')).trim() !== id) throw new Error('Confirmação de transação inválida; preservei os arquivos para inspeção.')
        await cleanupTransaction(transaction, id, 'committed')
      } else {
        await cleanupTransaction(transaction, id, 'rolledback')
      }
      return
    }
    let journal: Journal
    try { journal = JSON.parse(await files.readFile(journalPath, 'utf8')) as Journal }
    catch (reason) {
      if (reason instanceof SyntaxError) throw new Error('Journal de exportação inválido; preservei os arquivos para inspeção.')
      throw reason
    }

    if (journal.schemaVersion !== 1 || journal.transactionId !== id || !Array.isArray(journal.entries)) {
      throw new Error('Journal de exportação de Roteiros inválido; preservei os arquivos para inspeção.')
    }
    const seen = new Set<string>()
    for (const entry of journal.entries) {
      if (!entry || (entry.action !== 'write' && entry.action !== 'remove') || typeof entry.path !== 'string'
        || typeof entry.hadOriginal !== 'boolean' || entry.hadOriginal && (!isSignature(entry.original) || !isSignature(entry.backup))
        || entry.action === 'write' && !isSignature(entry.staged)
        || entry.action === 'remove' && entry.staged !== undefined
        || !entry.hadOriginal && (entry.original !== undefined || entry.backup !== undefined)
        || !isRoteiroProjectExportTransactionPath(entry.path)) {
        throw new Error('Journal de exportação de Roteiros inválido; preservei os arquivos para inspeção.')
      }
      safeRelativeSegments(entry.path)
      if (seen.has(entry.path)) throw new Error('Journal contém destinos duplicados; preservei os arquivos para inspeção.')
      seen.add(entry.path)
    }

    const markerPath = join(transaction, 'committed.ok')
    const marker = await existingFile(files, markerPath)
    if (marker) {
      if ((await files.readFile(markerPath, 'utf8')).trim() !== id) throw new Error('Confirmação de transação inválida; preservei os arquivos para inspeção.')
      await cleanupTransaction(transaction, id, 'committed')
      return
    }

    for (let index = journal.entries.length - 1; index >= 0; index -= 1) {
      const entry = journal.entries[index]
      const target = await assertSafePath(folder, entry.path)
      const targetInfo = await existingFile(files, target)
      if (!entry.hadOriginal) {
        if (!targetInfo) continue
        if (entry.action !== 'write' || !sameSignature(targetInfo, entry.staged!)) {
          throw new Error(`O arquivo ${entry.path} mudou durante a recuperação; mantive o journal e não o sobrescrevi.`)
        }
        await files.rm(target, { force: true })
        continue
      }

      const backupPath = join(transaction, 'backups', `${index}.bak`)
      const backupInfo = await existingFile(files, backupPath)
      if (targetInfo && (sameSignature(targetInfo, entry.original!) || sameSignature(targetInfo, entry.backup!))) continue
      if (!backupInfo || !sameSignature(backupInfo, entry.backup!) || backupInfo.size !== entry.original!.size) {
        throw new Error(`O backup de ${entry.path} está ausente ou inválido; mantive o journal.`)
      }
      if (targetInfo && (entry.action !== 'write' || !sameSignature(targetInfo, entry.staged!))) {
        throw new Error(`O arquivo ${entry.path} mudou durante a recuperação; mantive o backup e não o sobrescrevi.`)
      }
      if (targetInfo) await files.rm(target, { force: true })
      await files.mkdir(dirname(target), { recursive: true })
      await files.rename(backupPath, target)
      const restored = await files.lstat(target)
      if (!sameSignature(restored, entry.backup!)) throw new Error(`Não foi possível confirmar a restauração de ${entry.path}; mantive o journal.`)
    }
    await cleanupTransaction(transaction, id, 'rolledback')
  }

  async function recoverFolder(folder: string): Promise<void> {
    if (!await assertProjectFolder(folder)) return
    const entries = await files.readdir(folder, { withFileTypes: true })
    const transactions = entries
      .filter((entry) => entry.name.startsWith(transactionPrefix))
      .map((entry) => entry.name)
      .sort()
    for (const name of transactions) {
      const id = name.slice(transactionPrefix.length)
      if (!uuidPattern.test(id)) throw new Error('Pasta de transação de exportação com nome inválido; preservei seu conteúdo.')
      const path = join(folder, name)
      const info = await files.lstat(path)
      if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Caminho de transação inseguro; preservei seu conteúdo.')
      await recoverOne(folder, path, id)
    }
  }

  async function publishFolder(folder: string, changes: RoteiroProjectExportChanges): Promise<void> {
    if (!await assertProjectFolder(folder)) throw new Error('A pasta do projeto não existe para publicar a exportação.')
    const writes = [...changes.writes]
    const removes = [...(changes.removes ?? [])]
    const allPaths = [...writes.map((item) => item.path), ...removes]
    if (new Set(allPaths).size !== allPaths.length) throw new Error('A transação contém destinos duplicados.')
    if (!writes.length && !removes.length) return
    for (const path of allPaths) {
      safeRelativeSegments(path)
      if (!isRoteiroProjectExportTransactionPath(path)) throw new Error('Destino fora dos arquivos controlados da exportação de Roteiros.')
    }

    await recoverFolder(folder)
    const id = randomUUID()
    const transaction = transactionFolder(folder, id)
    await files.mkdir(transaction, { recursive: false })
    let journalPublished = false
    try {
      await files.writeFile(join(transaction, 'owner'), `${id}\nprepared\n`, { flag: 'wx' })
      await files.mkdir(join(transaction, 'staged'), { recursive: true })
      await files.mkdir(join(transaction, 'backups'), { recursive: true })
      const entries: JournalEntry[] = []
      const operations: Array<{ path: string; action: 'write' | 'remove'; write?: RoteiroProjectExportWrite }> = [
        ...writes.map((write) => ({ path: write.path, action: 'write' as const, write })),
        ...removes.map((path) => ({ path, action: 'remove' as const }))
      ]

      for (let index = 0; index < operations.length; index += 1) {
        const operation = operations[index]
        const target = await assertSafePath(folder, operation.path)
        const originalInfo = await existingFile(files, target)
        const entry: JournalEntry = {
          path: operation.path,
          action: operation.action,
          hadOriginal: originalInfo !== null,
          ...(originalInfo ? { original: signature(originalInfo) } : {})
        }
        if (originalInfo) {
          const backupPath = join(transaction, 'backups', `${index}.bak`)
          await files.copyFile(target, backupPath)
          const backupInfo = await files.lstat(backupPath)
          if (!backupInfo.isFile() || backupInfo.size !== originalInfo.size) throw new Error(`Não foi possível verificar o backup de ${operation.path}.`)
          entry.backup = signature(backupInfo)
        }
        if (operation.action === 'write') {
          const write = operation.write!
          const stagedPath = join(transaction, 'staged', `${index}.tmp`)
          if (write.sourcePath) await files.copyFile(write.sourcePath, stagedPath)
          else if (write.bytes) await files.writeFile(stagedPath, write.bytes, { flag: 'wx' })
          else throw new Error(`Conteúdo vazio para exportar em ${operation.path}.`)
          const stagedInfo = await files.lstat(stagedPath)
          if (!stagedInfo.isFile() || write.expectedSize !== undefined && stagedInfo.size !== write.expectedSize) {
            throw new Error(`O arquivo ${operation.path} mudou durante a exportação.`)
          }
          entry.staged = signature(stagedInfo)
        }
        entries.push(entry)
      }

      const journal: Journal = { schemaVersion: 1, transactionId: id, entries }
      const journalTemporary = join(transaction, 'journal.tmp')
      await files.writeFile(journalTemporary, JSON.stringify(journal), { flag: 'wx' })
      await files.rename(journalTemporary, join(transaction, 'journal.json'))
      journalPublished = true

      for (let index = 0; index < journal.entries.length; index += 1) {
        const entry = journal.entries[index]
        const target = await assertSafePath(folder, entry.path)
        const current = await existingFile(files, target)
        if (entry.hadOriginal) {
          if (!current || !sameSignature(current, entry.original!)) throw new Error(`O arquivo ${entry.path} mudou antes da publicação; nenhum conteúdo externo foi sobrescrito.`)
        } else if (current) {
          throw new Error(`O arquivo ${entry.path} surgiu durante a exportação e foi preservado.`)
        }
        if (entry.action === 'remove') {
          await files.rm(target, { force: true })
        } else {
          if (current) await files.rm(target, { force: true })
          await files.mkdir(dirname(target), { recursive: true })
          await files.rename(join(transaction, 'staged', `${index}.tmp`), target)
          const installed = await files.lstat(target)
          if (!sameSignature(installed, entry.staged!)) throw new Error(`A publicação de ${entry.path} não pôde ser confirmada.`)
        }
      }
      const commitTemporary = join(transaction, 'committed.tmp')
      await files.writeFile(commitTemporary, `${id}\n`, { flag: 'wx' })
      await files.rename(commitTemporary, join(transaction, 'committed.ok'))
      await cleanupTransaction(transaction, id, 'committed').catch(() => undefined)
    } catch (error) {
      if (!journalPublished) {
        await cleanupTransaction(transaction, id, 'rolledback').catch(() => undefined)
        throw error
      }
      try { await recoverOne(folder, transaction, id) }
      catch (recoveryError) {
        throw new AggregateError([error, recoveryError], 'A exportação falhou e o journal de recuperação foi preservado para a próxima abertura.')
      }
      throw error
    }
  }

  return {
    recover(folder: string): Promise<void> {
      const root = resolve(folder)
      return queue.run(root, () => recoverFolder(root))
    },
    publish(folder: string, changes: RoteiroProjectExportChanges): Promise<void> {
      const root = resolve(folder)
      return queue.run(root, () => publishFolder(root, changes))
    }
  }
}

/** Publica vários assets e seu manifesto com recuperação por journal. */
import { createHash } from 'node:crypto'
import { dirname, join, resolve, sep } from 'node:path'
import type * as nodeFs from 'node:fs/promises'
import { publishJsonManifest } from './atomicManifest.ts'

export type AssetManifestTransactionFiles = Pick<typeof nodeFs, 'mkdir' | 'readFile' | 'writeFile' | 'unlink' | 'rename' | 'rm'>
export type AssetManifestAsset = { relativePath: string; bytes: Buffer }
export type AssetManifestPublication = {
  files: AssetManifestTransactionFiles
  folder: string
  assets: readonly AssetManifestAsset[]
  manifestValue: unknown
  afterCommit?: () => Promise<void>
}

type Journal = {
  schemaVersion: 1
  previousHash: string | null
  nextHash: string
  entries: Array<{ relativePath: string; backedUp: boolean }>
}
type AssetManifestTransactionConfig = {
  journalDirectory: string
  manifestFileName: string
  domainName: string
}

const digest = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex')
const isMissing = (error: unknown) => (error as NodeJS.ErrnoException)?.code === 'ENOENT'

/** Cada domínio recebe sua própria instância para conservar o isolamento do journal e das operações em voo. */
export function createAssetManifestTransaction(config: AssetManifestTransactionConfig) {
  const pending = new Map<string, Promise<void>>()

  function assetPath(folder: string, relativePath: string): string {
    if (!relativePath.startsWith('assets/') || relativePath.includes('\\')) {
      throw Error(`Caminho de asset fora do ${config.domainName}.`)
    }
    const full = resolve(folder, relativePath)
    if (!full.startsWith(resolve(folder) + sep)) throw Error(`Caminho de asset fora do ${config.domainName}.`)
    return full
  }

  async function maybeRead(files: AssetManifestTransactionFiles, path: string): Promise<Buffer | null> {
    try { return await files.readFile(path) } catch (error) { if (isMissing(error)) return null; throw error }
  }

  function journalPaths(folder: string) {
    const root = join(resolve(folder), config.journalDirectory)
    return { root, manifest: join(root, 'journal.json') }
  }

  async function recover(files: AssetManifestTransactionFiles, folder: string): Promise<void> {
    const key = resolve(folder)
    if (pending.has(key)) await pending.get(key)
    const { root, manifest } = journalPaths(key)
    let journal: Journal
    try { journal = JSON.parse(await files.readFile(manifest, 'utf8')) as Journal }
    catch (error) {
      if (isMissing(error)) return
      // Um journal parcial não inicia escritas de assets; é seguro descartar.
      if (!(error instanceof SyntaxError)) throw error
      await files.rm(root, { recursive: true, force: true })
      return
    }
    if (journal.schemaVersion !== 1 || !Array.isArray(journal.entries) || !/^[0-9a-f]{64}$/.test(journal.nextHash)) {
      throw Error(`Journal de recuperação de ${config.domainName} inválido.`)
    }
    const paths = journal.entries.map((entry, index) => {
      if (typeof entry.relativePath !== 'string' || typeof entry.backedUp !== 'boolean') throw Error('Entrada do journal inválida.')
      return { file: assetPath(key, entry.relativePath), backup: join(root, `${index}.bak`), backedUp: entry.backedUp }
    })
    const current = await maybeRead(files, join(key, config.manifestFileName))
    const confirmed = await maybeRead(files, join(root, 'committed.ok'))
    const committed = confirmed?.toString('utf8') === journal.nextHash
      || (current !== null && digest(current) === journal.nextHash && journal.previousHash !== journal.nextHash)
    if (!committed) {
      for (const entry of paths) {
        if (entry.backedUp) {
          const old = await files.readFile(entry.backup)
          await files.mkdir(dirname(entry.file), { recursive: true })
          await files.writeFile(entry.file, old)
        } else {
          try { await files.unlink(entry.file) } catch (error) { if (!isMissing(error)) throw error }
        }
      }
    }
    await files.rm(root, { recursive: true, force: true })
  }

  async function publish(options: AssetManifestPublication): Promise<void> {
    const { files, assets, manifestValue, afterCommit } = options
    const folder = resolve(options.folder)
    await recover(files, folder)
    const unique = new Map<string, Buffer>()
    for (const item of assets) {
      assetPath(folder, item.relativePath)
      const previous = unique.get(item.relativePath)
      if (previous && !previous.equals(item.bytes)) throw Error('Asset duplicado com conteúdo diferente.')
      unique.set(item.relativePath, item.bytes)
    }
    const { root, manifest } = journalPaths(folder)
    const target = join(folder, config.manifestFileName)
    const nextContents = JSON.stringify(manifestValue, null, 2)
    const previousManifest = await maybeRead(files, target)
    await files.mkdir(root, { recursive: true })
    const entries: Journal['entries'] = []
    try {
      let index = 0
      for (const path of unique.keys()) {
        const original = await maybeRead(files, assetPath(folder, path))
        if (original) await files.writeFile(join(root, `${index}.bak`), original)
        entries.push({ relativePath: path, backedUp: original !== null })
        index++
      }
      const journal: Journal = {
        schemaVersion: 1,
        previousHash: previousManifest === null ? null : digest(previousManifest),
        nextHash: digest(nextContents),
        entries
      }
      await files.writeFile(manifest, JSON.stringify(journal), 'utf8')
    } catch (error) {
      await files.rm(root, { recursive: true, force: true })
      throw error
    }
    let release!: () => void
    const inFlight = new Promise<void>(resolvePending => { release = resolvePending })
    pending.set(folder, inFlight)
    let successfullyCommitted = false
    try {
      for (const [path, bytes] of unique) {
        const destination = assetPath(folder, path)
        await files.mkdir(dirname(destination), { recursive: true })
        await files.writeFile(destination, bytes)
      }
      await publishJsonManifest({
        files, target, temporary: join(folder, `${config.manifestFileName}.txn.tmp`),
        value: manifestValue, indent: 2, afterCommit,
        onCleanupError: () => { /* Um temporário órfão não sobrescreve manifesto confirmado. */ }
      })
      successfullyCommitted = true
      // O marcador confirma o commit quando os bytes do manifesto não mudaram.
      await files.writeFile(join(root, 'committed.ok'), digest(nextContents), 'utf8')
    } finally {
      pending.delete(folder)
      release()
      if (successfullyCommitted) await files.rm(root, { recursive: true, force: true })
      else await recover(files, folder)
    }
  }

  return { recover, publish }
}

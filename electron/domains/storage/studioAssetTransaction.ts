/** Journal de undo para alterações de PNGs do Studio.
 * A versão antiga do studio.json só deixa de ser a fonte da verdade após
 * o rename atômico do manifesto; interrupções antes disso são revertidas.
 * Usa diretório reservado por projeto e nunca atravessa seu limite.
 */
import { createHash } from 'node:crypto'
import { dirname, join, resolve, sep } from 'node:path'
import type * as fs from 'node:fs/promises'
import { publishJsonManifest } from './atomicManifest.ts'

type Files = Pick<typeof fs, 'mkdir' | 'readFile' | 'writeFile' | 'unlink' | 'rename' | 'rm'>
type Asset = { relativePath: string; bytes: Buffer }
type Journal = {
  schemaVersion: 1
  previousHash: string | null
  nextHash: string
  entries: Array<{ relativePath: string; backedUp: boolean }>
}
const JOURNAL = '.studio-assets-transaction'
const digest = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex')
const isMissing = (e: unknown) => (e as NodeJS.ErrnoException)?.code === 'ENOENT'
const pending = new Map<string, Promise<void>>()

function within(folder: string, relativePath: string) {
  if (!relativePath.startsWith('assets/') || relativePath.includes('\\')) throw Error('Caminho de asset fora do Studio.')
  const full = resolve(folder, relativePath)
  if (!full.startsWith(resolve(folder) + sep)) throw Error('Caminho de asset fora do Studio.')
  return full
}
async function maybeRead(files: Files, path: string): Promise<Buffer | null> {
  try { return await files.readFile(path) } catch (e) { if (isMissing(e)) return null; throw e }
}
function journalPaths(folder: string) {
  const root = join(resolve(folder), JOURNAL)
  return { root, manifest: join(root, 'journal.json') }
}

/** Executar na leitura e antes de cada nova gravação. */
export async function recoverStudioAssetTransaction(files: Files, folder: string): Promise<void> {
  const key = resolve(folder)
  if (pending.has(key)) await pending.get(key)
  const { root, manifest } = journalPaths(key)
  let journal: Journal
  try { journal = JSON.parse(await files.readFile(manifest, 'utf8')) as Journal }
  catch (e) {
    if (isMissing(e)) return
    // Um journal parcial não inicia escritas de assets; é seguro descartar.
    if (!(e instanceof SyntaxError)) throw e
    await files.rm(root, { recursive: true, force: true })
    return
  }
  if (journal.schemaVersion !== 1 || !Array.isArray(journal.entries) || !/^[0-9a-f]{64}$/.test(journal.nextHash)) {
    throw Error('Journal de recuperação de Studio inválido.')
  }
  const paths = journal.entries.map((e,i) => {
    if (typeof e.relativePath !== 'string' || typeof e.backedUp !== 'boolean') throw Error('Entrada do journal inválida.')
    return { file: within(key, e.relativePath), backup: join(root, i + '.bak'), backedUp: e.backedUp }
  })
  const current = await maybeRead(files, join(key, 'studio.json'))
  const confirmed = await maybeRead(files, join(root, 'committed.ok'))
  const committed = (confirmed?.toString('utf8') === journal.nextHash) ||
    (current !== null && digest(current) === journal.nextHash && journal.previousHash !== journal.nextHash)
  if (!committed) {
    for (const entry of paths) {
      if (entry.backedUp) {
        const old = await files.readFile(entry.backup)
        await files.mkdir(dirname(entry.file), { recursive: true })
        await files.writeFile(entry.file, old)
      } else {
        try { await files.unlink(entry.file) } catch (e) { if (!isMissing(e)) throw e }
      }
    }
  }
  await files.rm(root, { recursive: true, force: true })
}

export async function publishStudioAssetsAndManifest(options: {
  files: Files
  folder: string
  assets: readonly Asset[]
  manifestValue: unknown
  afterCommit?: () => Promise<void>
}): Promise<void> {
  const { files, assets, manifestValue, afterCommit } = options
  const folder = resolve(options.folder)
  await recoverStudioAssetTransaction(files, folder)
  const unique = new Map<string, Buffer>()
  for (const item of assets) {
    within(folder, item.relativePath)
    const old = unique.get(item.relativePath)
    if (old && !old.equals(item.bytes)) throw Error('Asset duplicado com conteúdo diferente.')
    unique.set(item.relativePath, item.bytes)
  }
  const { root, manifest } = journalPaths(folder)
  const target = join(folder, 'studio.json')
  const nextContents = JSON.stringify(manifestValue, null, 2)
  const previous = await maybeRead(files, target)
  await files.mkdir(root, { recursive: true })
  const entries: Journal['entries'] = []
  try {
    let index = 0
    for (const path of unique.keys()) {
      const original = await maybeRead(files, within(folder, path))
      if (original) await files.writeFile(join(root, index + '.bak'), original)
      entries.push({ relativePath: path, backedUp: original !== null })
      index++
    }
    const journal: Journal = {
      schemaVersion: 1, previousHash: previous === null ? null : digest(previous),
      nextHash: digest(nextContents), entries
    }
    await files.writeFile(manifest, JSON.stringify(journal), 'utf8')
  } catch (e) {
    await files.rm(root, { recursive: true, force: true })
    throw e
  }
  let release!: () => void
  const inFlight = new Promise<void>(resolve => { release = resolve })
  pending.set(folder, inFlight)
  let successfullyCommitted = false
  try {
    for (const [path, bytes] of unique) {
      const destination = within(folder, path)
      await files.mkdir(dirname(destination), { recursive: true })
      await files.writeFile(destination, bytes)
    }
    await publishJsonManifest({
      files, target, temporary: join(folder, 'studio.json.txn.tmp'),
      value: manifestValue, indent: 2, afterCommit,
      onCleanupError: () => { /* Um temporário órfão não sobrescreve manifesto confirmado. */ }
    })
    successfullyCommitted = true
    // Após ack do manifesto, este marcador mantém o commit mesmo quando o JSON é idêntico.
    await files.writeFile(join(root, 'committed.ok'), digest(nextContents), 'utf8')
  } finally {
    pending.delete(folder)
    release()
    if (successfullyCommitted) await files.rm(root, { recursive: true, force: true })
    else await recoverStudioAssetTransaction(files, folder)
  }
}

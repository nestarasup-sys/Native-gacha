/** Crash-recoverable, per-model batch update for expression preset JSON files.
 * Journal is installed BEFORE changing any preset; recovery verifies ALL
 * backups before restoring any. Never touches PNGs, source models or poses.
 */
import { createHash } from 'node:crypto'
import { dirname, join } from 'node:path'
import type * as nodeFs from 'node:fs/promises'
import type { FaceExpressionPreset } from '../../../src/shared/fabricator'

type Files = Pick<typeof nodeFs, 'mkdir' | 'readFile' | 'writeFile' | 'rename' | 'rm' | 'unlink'>
type Entry = { id: string; existed: boolean; sha256: string | null; nextSha256: string }
type Journal = { schemaVersion: 1; modelSlot: number; entries: Entry[] }
const safeId = /^[a-zA-Z0-9_-]{1,80}$/
const sha = (value: Buffer | string) => createHash('sha256').update(value).digest('hex')
const notFound = (reason: unknown) => (reason as NodeJS.ErrnoException)?.code === 'ENOENT'
async function maybeRead(files: Files, path: string): Promise<Buffer | null> {
  try { return await files.readFile(path) } catch (reason) { if (notFound(reason)) return null; throw reason }
}
function validJournal(value: unknown, slot: number): value is Journal {
  if (!value || typeof value !== 'object') return false
  const journal = value as Journal
  return journal.schemaVersion === 1 && journal.modelSlot === slot
    && Array.isArray(journal.entries) && journal.entries.length > 0 && journal.entries.length <= 64
    && journal.entries.every(entry => entry && safeId.test(entry.id)
      && typeof entry.existed === 'boolean'
      && (entry.existed ? typeof entry.sha256 === 'string' && /^[a-f0-9]{64}$/.test(entry.sha256) : entry.sha256 === null)
      && typeof entry.nextSha256 === 'string' && /^[a-f0-9]{64}$/.test(entry.nextSha256))
    && new Set(journal.entries.map(entry => entry.id)).size === journal.entries.length
}

export function createExpressionBatchTransaction(deps: {
  files: Files
  modelFolder: (modelSlot: number) => string
  presetPath: (modelSlot: number, id: string) => string
  validModelSlot: (modelSlot: number) => boolean
  validPreset: (modelSlot: number, preset: FaceExpressionPreset) => boolean
}) {
  const { files, modelFolder, presetPath, validModelSlot, validPreset } = deps
  const folderFor = (slot: number) => join(modelFolder(slot), '.expression-batch-transaction')
  const ensureSlot = (slot: number) => { if (!validModelSlot(slot)) throw Error('Modelo de expressões inválido.') }

  async function recover(slot: number): Promise<void> {
    ensureSlot(slot)
    const folder = folderFor(slot)
    const journalBytes = await maybeRead(files,join(folder,'journal.json'))
    if (!journalBytes) {
      // An incomplete preparation has not changed any preset.
      await files.rm(folder,{recursive:true,force:true})
      return
    }
    let raw: unknown
    try { raw = JSON.parse(journalBytes.toString('utf8')) }
    catch { throw Error('Journal de expressões ilegível; arquivos preservados para recuperação manual.') }
    if (!validJournal(raw,slot)) throw Error('Journal de expressões inválido; arquivos preservados para recuperação manual.')
    const acknowledged = await maybeRead(files,join(folder,'committed.ok'))
    if (acknowledged?.toString('utf8') === sha(journalBytes)) {
      for (const entry of raw.entries) {
        const current = await maybeRead(files,presetPath(slot,entry.id))
        if (!current || sha(current) !== entry.nextSha256) {
          throw Error(`Lote de expressões confirmado, mas preset ${entry.id} divergente; journal preservado para revisão.`)
        }
      }
      await files.rm(folder,{recursive:true,force:true})
      return
    }
    const originals = await Promise.all(raw.entries.map(async entry => {
      const bytes = entry.existed ? await maybeRead(files,join(folder,`${entry.id}.bak`)) : null
      if (entry.existed && (!bytes || sha(bytes) !== entry.sha256))
        throw Error(`Backup da expressão ${entry.id} ausente ou inválido; recuperação bloqueada.`)
      return { entry,bytes }
    }))
    // Backups validated before the first restoration; failures retain journal
    // to retry at next open. Restoration may be safely repeated.
    for (const {entry,bytes} of originals) {
      const target = presetPath(slot,entry.id)
      if (bytes) {
        const temporary = `${target}.batch-restore.tmp`
        await files.writeFile(temporary,bytes)
        await files.rename(temporary,target)
      } else {
        try { await files.unlink(target) } catch(reason) { if (!notFound(reason)) throw reason }
      }
    }
    for (const {entry,bytes} of originals) {
      const current = await maybeRead(files,presetPath(slot,entry.id))
      if ((bytes === null && current !== null) || (bytes !== null && (!current || sha(current) !== entry.sha256)))
        throw Error(`Restauro da expressão ${entry.id} não foi confirmado; journal preservado.`)
    }
    await files.rm(folder,{recursive:true,force:true})
  }

  async function save(slot: number, presets: readonly FaceExpressionPreset[]): Promise<void> {
    ensureSlot(slot)
    if (!Array.isArray(presets) || presets.length < 1 || presets.length > 64
      || presets.some(preset => !preset || !safeId.test(preset.id) || !validPreset(slot,preset))
      || new Set(presets.map(preset=>preset.id)).size !== presets.length) {
      throw Error('Lote de expressões inválido; nenhuma expressão foi gravada.')
    }
    await recover(slot)
    const folder = folderFor(slot)
    const saved = await Promise.all(presets.map(async preset => {
      const old = await maybeRead(files,presetPath(slot,preset.id))
      return { id:preset.id,old, updated:Buffer.from(JSON.stringify(preset),'utf8') }
    }))
    await files.mkdir(folder,{recursive:true})
    let journalReady = false
    let committed = false
    try {
      for(const item of saved) {
        if(item.old) await files.writeFile(join(folder,`${item.id}.bak`),item.old)
      }
      const journal: Journal = { schemaVersion:1,modelSlot:slot,
        entries:saved.map(item=>({id:item.id,existed:item.old!==null,sha256:item.old ? sha(item.old):null,nextSha256:sha(item.updated)})) }
      const record=Buffer.from(JSON.stringify(journal),'utf8')
      await files.writeFile(join(folder,'journal.json.tmp'),record)
      await files.rename(join(folder,'journal.json.tmp'),join(folder,'journal.json'))
      journalReady=true
      for (const item of saved) {
        const target=presetPath(slot,item.id)
        await files.mkdir(dirname(target),{recursive:true})
        await files.writeFile(`${target}.batch-next.tmp`,item.updated)
        await files.rename(`${target}.batch-next.tmp`,target)
      }
      for(const item of saved) {
        const current=await maybeRead(files,presetPath(slot,item.id))
        if(!current || sha(current)!==sha(item.updated)) throw Error('Gravação das expressões não foi confirmada.')
      }
      await files.writeFile(join(folder,'committed.ok'),sha(record),'utf8')
      committed=true
    } catch(reason) {
      if(journalReady) {
        try { await recover(slot) }
        catch(recoveryError) {
          throw Error(`Falha ao aplicar expressões: ${String(reason)}. RESTAURAÇÃO INCOMPLETA: ${String(recoveryError)}. Journal mantido; não edite os presets até recuperar.`)
        }
      } else {
        await files.rm(folder,{recursive:true,force:true})
      }
      throw reason
    } finally {
      if (committed) {
        // A failed cleanup must not undo an already acknowledged transaction.
        try { await files.rm(folder,{recursive:true,force:true}) } catch { /* Recover cleans it at next access. */ }
      }
    }
  }

  return { save,recover }
}

import { mkdir, mkdtemp, rename, rm, unlink, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { basename, dirname, extname, join, resolve, sep } from 'node:path'

const EXPORT_TEMP_PREFIX = 'editor-v6-export-'

/** Creates an isolated export directory under the configured temporary root. */
export async function createEditorV6ExportTempFolder(tempRoot: string): Promise<string> {
  await mkdir(tempRoot, { recursive: true })
  return mkdtemp(join(tempRoot, EXPORT_TEMP_PREFIX))
}

/** Replaces a diagnostic report atomically and removes an incomplete write on failure. */
export async function writeEditorV6ExportReport(reportPath: string, report: unknown): Promise<void> {
  await mkdir(dirname(reportPath), { recursive: true })
  const temporary = `${reportPath}.${randomUUID()}.tmp`
  try {
    await writeFile(temporary, JSON.stringify(report, null, 2), { flag: 'wx' })
    await rename(temporary, reportPath)
  } finally {
    await unlink(temporary).catch(() => {})
  }
}

/** Removes a candidate file while treating an already-removed file as successful cleanup. */
export async function removeEditorV6ExportCandidate(candidate: string): Promise<void> {
  try {
    await unlink(candidate)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
}

/** Publishes a validated MP4, choosing a recovery name only when the destination is temporarily unavailable. */
export async function publishEditorV6Output(
  candidate: string,
  requestedPath: string,
  id: string,
  move: (from: string, to: string) => Promise<void> = rename
): Promise<{ outputPath: string; warning?: string }> {
  try {
    await move(candidate, requestedPath)
    return { outputPath: requestedPath }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException)?.code
    if (!['EPERM', 'EACCES', 'EBUSY', 'EEXIST'].includes(String(code))) throw error
    const extension = extname(requestedPath) || '.mp4'
    const recoveryPath = join(dirname(requestedPath), `${basename(requestedPath, extension)} (recuperado-${id.slice(0, 8)})${extension}`)
    await move(candidate, recoveryPath)
    return { outputPath: recoveryPath, warning: `O destino escolhido estava ocupado; o vídeo foi salvo como ${basename(recoveryPath)}.` }
  }
}

/** Removes only generated export folders located below the configured temp root. */
export async function removeEditorV6ExportTempFolder(tempRoot: string, folder: string): Promise<boolean> {
  const absoluteRoot = resolve(tempRoot)
  const absoluteFolder = resolve(folder)
  if (!absoluteFolder.startsWith(`${absoluteRoot}${sep}`) || !basename(absoluteFolder).startsWith(EXPORT_TEMP_PREFIX)) return false
  await rm(absoluteFolder, { recursive: true, force: true })
  return true
}

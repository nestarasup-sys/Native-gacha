import { mkdir, mkdtemp, rename, rm, unlink, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { basename, dirname, join, resolve, sep } from 'node:path'

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

/** Removes only generated export folders located below the configured temp root. */
export async function removeEditorV6ExportTempFolder(tempRoot: string, folder: string): Promise<boolean> {
  const absoluteRoot = resolve(tempRoot)
  const absoluteFolder = resolve(folder)
  if (!absoluteFolder.startsWith(`${absoluteRoot}${sep}`) || !basename(absoluteFolder).startsWith(EXPORT_TEMP_PREFIX)) return false
  await rm(absoluteFolder, { recursive: true, force: true })
  return true
}

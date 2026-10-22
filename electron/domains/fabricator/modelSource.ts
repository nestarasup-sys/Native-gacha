/**
 * Publicação controlada do Model Source.
 * Substitui o slot inteiro por uma cópia validada, sem tocar no perfil externo.
 * O diretório anterior fica em backup isolado para recuperação manual.
 */
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'
import type { FabricatorAssetSave, FabricatorProjectSave } from '../../../src/shared/fabricator'

export type ModelSourcePublishRequest = {
  project: FabricatorProjectSave
  sourceDataUrl: string
  changedAssets: FabricatorAssetSave[]
}

export function validateModelSourceImage(dataUrl: string, width: number, height: number): Buffer {
  if (typeof dataUrl !== 'string' || dataUrl.length > 70 * 1024 * 1024) throw new Error('Model Source excede o limite de 50 MB.')
  const match = /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl)
  if (!match) throw new Error('Model Source exige PNG válido.')
  const image = Buffer.from(match[1], 'base64')
  if (image.length < 24 || image.length > 50 * 1024 * 1024
    || image.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a'
    || image.toString('ascii', 12, 16) !== 'IHDR') throw new Error('PNG de Model Source inválido.')
  if (image.readUInt32BE(16) !== width || image.readUInt32BE(20) !== height
    || width < 1 || height < 1 || width * height > 32_000_000) throw new Error('Dimensões do Model Source divergentes.')
  return image
}

/** Adaptador obrigatório para domínios ativos em SQLite e armazenamento legado em arquivos. */
export type ModelSourceFiles = {
  mkdir: typeof mkdir
  readFile: typeof readFile
  writeFile: typeof writeFile
  readdir: typeof readdir
  rename: typeof rename
  rm: typeof rm
}

const nativeFiles: ModelSourceFiles = { mkdir, readFile, writeFile, readdir, rename, rm }

async function copyDirectory(source: string, target: string, files: ModelSourceFiles): Promise<void> {
  await files.mkdir(target, { recursive: true })
  const entries = await files.readdir(source, { withFileTypes: true })
  for (const entry of entries) {
    const from = join(source, entry.name)
    const to = join(target, entry.name)
    if (entry.isDirectory()) await copyDirectory(from, to, files)
    else if (entry.isFile()) await files.writeFile(to, await files.readFile(from))
    else throw new Error('Entrada não suportada no catálogo de Model Source.')
  }
}

export async function publishModelSource(
  request: ModelSourcePublishRequest,
  slotPath: (slot: number) => string,
  saveProject: (project: FabricatorProjectSave, changedAssets: FabricatorAssetSave[], folder: string) => Promise<void>,
  files: ModelSourceFiles = nativeFiles
): Promise<string> {
  const { project, sourceDataUrl, changedAssets } = request
  if (!project || project.schemaVersion !== 1 || !Number.isInteger(project.slot)
    || project.slot < 1 || project.slot > 10 || !Array.isArray(project.parts)
    || project.parts.length > 500 || !Array.isArray(changedAssets)
    || changedAssets.length !== project.parts.length
    || new Set(changedAssets.map(asset => asset.id)).size !== project.parts.length
    || project.parts.some(part => !changedAssets.some(asset => asset.id === part.id))) {
    throw new Error('Manifesto ou recortes do Model Source inválidos.')
  }
  const bytes = validateModelSourceImage(sourceDataUrl, project.width, project.height)
  const folder = slotPath(project.slot)
  const base = dirname(folder)
  const suffix = randomUUID()
  const staging = join(base, `.model-source-stage-${project.slot}-${suffix}`)
  const backup = join(base, `.model-source-backup-${project.slot}-${suffix}`)
  const filename = `source-${randomUUID()}.png`
  // Verifica concorrência depois de adquirir a fila de salvamento do slot.
  const old = JSON.parse(await files.readFile(join(folder, 'project.json'), 'utf8')) as { sourceFile?: string }
  if (old.sourceFile !== project.sourceAssetName) throw new Error('O modelo mudou. Reabra o slot antes de publicar.')
  await files.mkdir(base, { recursive: true })
  let movedOld = false
  try {
    await copyDirectory(folder, staging, files)
    await files.writeFile(join(staging, filename), bytes, { flag: 'wx' })
    // Histórico de montagem anterior faz referência aos pixels antigos.
    // A publicação é um novo marco permanente, sem Undo cruzando versões.
    await files.mkdir(join(staging, 'history'), { recursive: true })
    await files.writeFile(join(staging, 'history', 'history.json'), JSON.stringify({ version: 1, undo: [], redo: [] }), 'utf8')
    await files.rm(join(staging, 'history', 'assets'), { recursive: true, force: true })
    await saveProject({ ...project, sourceAssetName: filename }, changedAssets, staging)
    // Duas renomeações no mesmo volume. Se a segunda falhar, restauramos a origem.
    await files.rename(folder, backup)
    movedOld = true
    try {
      await files.rename(staging, folder)
    } catch (error) {
      await files.rename(backup, folder)
      movedOld = false
      throw error
    }
    // Backup fora dos slots visíveis. Nunca apagar em caso de falha.
    return filename
  } finally {
    if (!movedOld) await files.rm(staging, { recursive: true, force: true }).catch(() => undefined)
  }
}

import { createHash, randomUUID } from 'node:crypto'
import * as nativeFiles from 'node:fs/promises'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { createKeyedOperationQueue } from '../storage/keyedOperationQueue.ts'
import { createRoteiroCharacterExportPublication, isRoteiroCharacterExportAssetPath, type RoteiroCharacterExportFiles, type RoteiroCharacterExportWrite } from './characterExportPublication.ts'
import { roteiroV4ProjectsRoot } from './projectPaths.ts'

export type RoteiroExportCharacter = { id: string; name: string }
export type RoteiroExportStart = { id: string; title: string; characters: RoteiroExportCharacter[] }
export type RoteiroExportAsset = { characterId: string; pose: number; expression: string; role: 'base' | 'blink' | 'talk' | 'pt' | 'pt-blink' | 'pt-talk'; dataUrl: string }

type ExportJob = {
  jobId: string
  id: string
  projectFolder: string
  stageFolder: string
  roteiro: RoteiroExportStart
  namesById: Map<string, { characterName: string; folderName: string }>
  files: Set<string>
  integrityByPath: Map<string, { size: number; sha256: string; signature: FileSignature }>
  expressions: Map<string, Set<string>>
  poses: Map<string, Set<number>>
}

type FileSignature = { dev: number; ino: number; size: number; mtimeMs: number }

const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function safeSegment(value: string, fallback: string): string {
  const cleaned = value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9 _-]/g, '-').replace(/[\s_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 72) || fallback
  return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(cleaned) ? `${cleaned}-item` : cleaned
}

function safeDisplayName(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 100 || /[\x00-\x1f]/.test(value)) throw new Error(`${label} inválido.`)
  return value.trim()
}

function safeExpressionSegment(value: string): string {
  const cleaned = value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/_+/g, '_').replace(/^[_-]+|[_-]+$/g, '').slice(0, 72).toLowerCase()
  return cleaned || 'expressao'
}

function samePath(left: string, right: string): boolean { return process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right }

function signature(info: Awaited<ReturnType<RoteiroCharacterExportFiles['lstat']>>): FileSignature {
  return { dev: Number(info.dev), ino: Number(info.ino), size: Number(info.size), mtimeMs: Number(info.mtimeMs) }
}

async function exists(files: RoteiroCharacterExportFiles, path: string): Promise<boolean> {
  try { await files.lstat(path); return true } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error }
}

async function assertSafePath(files: RoteiroCharacterExportFiles, root: string, target: string, includeLeaf = true): Promise<void> {
  const rel = relative(root, target)
  if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || resolve(root, rel) !== target) throw new Error('Caminho fora da pasta do projeto.')
  const segments = rel.split(sep)
  const count = includeLeaf ? segments.length : segments.length - 1
  let current = root
  for (let index = 0; index < count; index += 1) {
    current = join(current, segments[index])
    if (!await exists(files, current)) continue
    const info = await files.lstat(current)
    if (info.isSymbolicLink() || index < count - 1 && !info.isDirectory()) throw new Error('A exportação encontrou um caminho não seguro dentro do projeto.')
  }
}

async function walkFiles(files: RoteiroCharacterExportFiles, root: string, dir = root): Promise<string[]> {
  const entries = await files.readdir(dir, { withFileTypes: true })
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(dir, entry.name)
    if (entry.isSymbolicLink()) throw new Error('A exportação encontrou um link simbólico e foi interrompida por segurança.')
    if (entry.isDirectory()) return walkFiles(files, root, path)
    if (!entry.isFile()) throw new Error('A exportação encontrou um item que não é arquivo regular.')
    return [path]
  }))
  return nested.flat()
}

function normalizeRelative(path: string): string { return path.split(sep).join('/') }

export class RoteiroCharacterExportStore {
  private readonly jobs = new Map<string, ExportJob>()
  private readonly projectOperations = createKeyedOperationQueue()
  private readonly publication: ReturnType<typeof createRoteiroCharacterExportPublication>
  private orphanCleanup: Promise<void> | null = null

  constructor(private readonly tempRoot: string, private readonly projectsRoot = roteiroV4ProjectsRoot, private readonly files: RoteiroCharacterExportFiles = nativeFiles) {
    this.publication = createRoteiroCharacterExportPublication(files)
  }

  private async cleanupOrphanedStages(): Promise<void> {
    if (!this.orphanCleanup) {
      this.orphanCleanup = (async () => {
        const rootInfo = await this.files.lstat(this.tempRoot).catch((reason) => {
          if ((reason as NodeJS.ErrnoException).code === 'ENOENT') return null
          throw reason
        })
        if (!rootInfo) return
        if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) throw new Error('A pasta temporária de exportação de personagens não é segura.')
        for (const entry of await this.files.readdir(this.tempRoot, { withFileTypes: true })) {
          if (!idPattern.test(entry.name)) continue
          if (entry.isSymbolicLink() || !entry.isDirectory()) throw new Error('Staging órfão de personagens não é um diretório seguro; preservei seu conteúdo.')
          if (!this.jobs.has(entry.name)) await this.files.rm(join(this.tempRoot, entry.name), { recursive: true, force: true })
        }
      })()
    }
    return this.orphanCleanup
  }

  async recoverProject(folder: string): Promise<void> {
    await this.cleanupOrphanedStages()
    const root = resolve(folder)
    const key = process.platform === 'win32' ? root.toLowerCase() : root
    await this.projectOperations.run(key, () => this.publication.recoverProject(root))
  }

  async start(input: unknown): Promise<{ jobId: string; folderName: string; assetCountLimit: number }> {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Dados do roteiro inválidos para exportação.')
    const value = input as Partial<RoteiroExportStart>
    if (typeof value.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.id)) throw new Error('ID do roteiro inválido.')
    const title = safeDisplayName(value.title, 'Nome do roteiro')
    if (!Array.isArray(value.characters) || !value.characters.length || value.characters.length > 100) throw new Error('Selecione ao menos um personagem para exportar.')
    const characters = value.characters.map((item) => {
      if (!item || typeof item !== 'object' || typeof item.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(item.id)) throw new Error('Um personagem do elenco tem ID inválido.')
      return { id: item.id, name: safeDisplayName(item.name, 'Nome de personagem') }
    })
    if (new Set(characters.map((character) => character.id)).size !== characters.length) throw new Error('O elenco contém personagens duplicados.')
    if (new Set(characters.map((character) => character.name.toLocaleLowerCase('pt-BR'))).size !== characters.length) throw new Error('Os nomes dos personagens precisam ser diferentes para o Editor V4.')
    const root = resolve(this.projectsRoot)
    const rootInfo = await this.files.lstat(root).catch(() => null)
    if (!rootInfo?.isDirectory() || rootInfo.isSymbolicLink() || !samePath(await this.files.realpath(root), root)) throw new Error(`A pasta de projetos do Editor V4 não está disponível em ${root}.`)
    const folderName = safeSegment(title, `roteiro-${value.id.slice(0, 8)}`)
    const targetFolder = resolve(root, folderName)
    if (dirname(targetFolder) !== root) throw new Error('Nome de pasta do roteiro inválido.')
    if (await exists(this.files, targetFolder)) {
      const targetInfo = await this.files.lstat(targetFolder)
      if (!targetInfo.isDirectory() || targetInfo.isSymbolicLink() || !samePath(await this.files.realpath(targetFolder), targetFolder)) throw new Error('A pasta existente do roteiro não é um diretório seguro.')
    }
    await this.recoverProject(targetFolder)
    const jobId = randomUUID()
    const stageFolder = resolve(this.tempRoot, jobId)
    await this.files.mkdir(this.tempRoot, { recursive: true })
    const tempInfo = await this.files.lstat(this.tempRoot)
    if (!tempInfo.isDirectory() || tempInfo.isSymbolicLink()) throw new Error('A pasta temporária de exportação de personagens não é segura.')
    await this.files.mkdir(stageFolder, { recursive: false })
    const usedFolders = new Set<string>()
    const namesById = new Map<string, { characterName: string; folderName: string }>()
    for (const character of characters) {
      const base = safeSegment(character.name, 'personagem')
      let folder = base
      const suffix = character.id.slice(0, 8)
      let collision = 2
      while (usedFolders.has(folder.toLocaleLowerCase('en-US'))) {
        const disambiguator = `${suffix}${collision > 2 ? `-${collision}` : ''}`
        folder = `${base.slice(0, 72 - disambiguator.length - 1)}-${disambiguator}`
        collision += 1
      }
      usedFolders.add(folder.toLowerCase())
      namesById.set(character.id, { characterName: character.name, folderName: folder })
    }
    this.jobs.set(jobId, { jobId, id: value.id, projectFolder: targetFolder, stageFolder, roteiro: { id: value.id, title, characters }, namesById, files: new Set(), integrityByPath: new Map(), expressions: new Map(), poses: new Map() })
    return { jobId, folderName, assetCountLimit: 20000 }
  }

  async writeAsset(jobId: string, input: unknown): Promise<void> {
    const job = this.jobs.get(jobId)
    if (!job) throw new Error('Exportação de personagens expirada ou inexistente.')
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Asset de personagem inválido.')
    const value = input as Partial<RoteiroExportAsset>
    const character = typeof value.characterId === 'string' ? job.namesById.get(value.characterId) : undefined
    if (!character || !Number.isInteger(value.pose) || value.pose! < 1 || value.pose! > 100 || !['base', 'blink', 'talk', 'pt', 'pt-blink', 'pt-talk'].includes(value.role ?? '')) throw new Error('Referência de asset inválida.')
    const expression = safeExpressionSegment(safeDisplayName(value.expression, 'Expressão'))
    if (typeof value.dataUrl !== 'string' || value.dataUrl.length > 36 * 1024 * 1024) throw new Error('Imagem de personagem excede o limite de exportação.')
    const match = /^data:image\/png;base64,([a-z0-9+/=]+)$/i.exec(value.dataUrl)
    if (!match) throw new Error('A exportação aceita somente imagens PNG renderizadas pelo aplicativo.')
    const bytes = Buffer.from(match[1], 'base64')
    if (bytes.length < 24 || bytes.length > 24 * 1024 * 1024 || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error('O PNG exportado está vazio, inválido ou acima do limite.')
    const isPupilsLeft = value.role === 'pt' || value.role === 'pt-blink' || value.role === 'pt-talk'
    const visualRole = value.role === 'pt' ? 'base' : value.role === 'pt-blink' ? 'blink' : value.role === 'pt-talk' ? 'talk' : value.role!
    const roleSuffix = visualRole === 'base' ? '' : `_${visualRole}`
    const filenameExpression = isPupilsLeft ? `pt_${expression}` : expression
    const relativeFile = ['assets', 'characters', character.folderName, `POSE ${value.pose}`, `${filenameExpression}${roleSuffix}.png`].join('/')
    if (job.files.has(relativeFile)) throw new Error(`A expressão ${expression} foi gerada mais de uma vez para ${character.characterName}, POSE ${value.pose}.`)
    const target = resolve(job.stageFolder, ...relativeFile.split('/'))
    if (!target.startsWith(`${job.stageFolder}${sep}`)) throw new Error('Destino de imagem fora da pasta temporária da exportação.')
    await this.files.mkdir(dirname(target), { recursive: true })
    await this.files.writeFile(target, bytes, { flag: 'wx' })
    const sourceInfo = await this.files.lstat(target)
    job.files.add(relativeFile)
    job.integrityByPath.set(relativeFile, {
      size: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      signature: signature(sourceInfo)
    })
    const expressionSet = job.expressions.get(character.characterName) ?? new Set<string>()
    expressionSet.add(expression)
    job.expressions.set(character.characterName, expressionSet)
    const poseSet = job.poses.get(character.characterName) ?? new Set<number>()
    poseSet.add(value.pose!)
    job.poses.set(character.characterName, poseSet)
  }

  async finish(jobId: string): Promise<{ folderName: string; path: string; characters: number; files: number }> {
    const job = this.jobs.get(jobId)
    if (!job) throw new Error('Exportação de personagens expirada ou inexistente.')
    const key = process.platform === 'win32' ? job.projectFolder.toLowerCase() : job.projectFolder
    return this.projectOperations.run(key, () => this.finishLocked(job))
  }

  private async finishLocked(job: ExportJob): Promise<{ folderName: string; path: string; characters: number; files: number }> {
    await this.publication.recoverProject(job.projectFolder)
    if (!job.files.size || job.roteiro.characters.some((character) => !job.expressions.get(character.name)?.size || !job.poses.get(character.name)?.size)) throw new Error('A exportação ficou incompleta; não publiquei a pasta do projeto.')
    const characters: Record<string, unknown> = {}
    const initialState: Record<string, unknown> = {}
    const poseRelocations = new Map<string, string>()
    for (const character of job.roteiro.characters) {
      const mapping = job.namesById.get(character.id)!
      const poses = [...(job.poses.get(character.name) ?? [])].sort((a, b) => a - b)
      const expressions = [...(job.expressions.get(character.name) ?? [])].sort((a, b) => a.localeCompare(b))
      const poseNameByIndex = new Map(poses.map((_, index) => [poses[index], `POSE ${index + 1}`]))
      const poseNames = poses.map((pose) => poseNameByIndex.get(pose)!)
      const defaultExpression = expressions.includes('normal') ? 'normal' : expressions[0]
      characters[character.name] = {
        asset_dir: `assets/characters/${mapping.folderName}`,
        default_pose: poseNames[0],
        default_expression: defaultExpression,
        default_variant: 'v1',
        poses: Object.fromEntries(poseNames.map((name) => [name, {}]))
      }
      initialState[character.name] = { pose: poseNames[0], expression: defaultExpression, variant: 'v1', visible: true,
        transform: { x: 960, y: 540, scale: 1, rotation: 0, layer: 10, flipX: false, anchorX: .5, anchorY: .5, opacity: 1 } }
      // Preserve source pose slot numbers in the folder names written above.
      for (const pose of poses) {
        const actualName = `POSE ${pose}`
        const actualFolder = join(job.stageFolder, 'assets', 'characters', mapping.folderName, actualName)
        const canonicalName = poseNameByIndex.get(pose)!
        if (actualName !== canonicalName && await exists(this.files, actualFolder)) {
          await this.files.rename(actualFolder, join(dirname(actualFolder), canonicalName))
          poseRelocations.set(`assets/characters/${mapping.folderName}/${actualName}/`, `assets/characters/${mapping.folderName}/${canonicalName}/`)
        }
      }
    }
    if (poseRelocations.size) {
      const integrity = [...job.integrityByPath]
      for (const [path, info] of integrity) {
        for (const [from, to] of poseRelocations) {
          if (!path.startsWith(from)) continue
          job.integrityByPath.delete(path)
          job.integrityByPath.set(`${to}${path.slice(from.length)}`, info)
          break
        }
      }
    }
    const projectFile = `${safeSegment(job.roteiro.title, 'roteiro')}.gacha.json`
    const projectPath = join(job.stageFolder, projectFile)
    const projectDocument = { schema_version: 3, project: { title: job.roteiro.title, resolution: [1920, 1080], fps: 30, background: '' }, characters, initial_state: initialState, timeline: [], timeline_tracks: [], timeline_tracks_version: 1 }
    const manifest = { app: 'NYMI_ROTEIRO_EXPORT_V1', scriptId: job.id, scriptTitle: job.roteiro.title, kind: 'text', editorTarget: 'v4', updatedAt: new Date().toISOString() }
    const projectBytes = Buffer.from(`${JSON.stringify(projectDocument, null, 2)}\n`, 'utf8')
    const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
    await this.files.writeFile(projectPath, projectBytes, { flag: 'wx' })
    await this.files.writeFile(join(job.stageFolder, '.nymi-script.json'), manifestBytes, { flag: 'wx' })
    await this.files.mkdir(dirname(job.projectFolder), { recursive: true })

    if (!await exists(this.files, job.projectFolder)) {
      await this.files.rename(job.stageFolder, job.projectFolder)
    } else {
      await assertSafePath(this.files, dirname(job.projectFolder), job.projectFolder)
      const currentProjectPath = join(job.projectFolder, projectFile)
      await assertSafePath(this.files, job.projectFolder, currentProjectPath)
      let mergedProject = projectDocument
      if (await exists(this.files, currentProjectPath)) {
        const existing = JSON.parse(await this.files.readFile(currentProjectPath, 'utf8')) as Record<string, any>
        if (!existing || typeof existing !== 'object' || !existing.characters || typeof existing.characters !== 'object' || Array.isArray(existing.characters)) throw new Error('O arquivo de projeto existente não tem uma estrutura compatível; preservei a pasta sem alteração.')
        mergedProject = { ...existing, characters: { ...existing.characters, ...characters }, initial_state: { ...(existing.initial_state ?? {}), ...initialState } } as typeof projectDocument
      }

      const files = await walkFiles(this.files, job.stageFolder)
      const stagedRelativePaths = new Set(files.map((file) => normalizeRelative(relative(job.stageFolder, file))))
      const writes: RoteiroCharacterExportWrite[] = []
      for (const stagedFile of files) {
        const rel = normalizeRelative(relative(job.stageFolder, stagedFile))
        if (rel === projectFile) continue
        if (rel === '.nymi-script.json') {
          const destination = join(job.projectFolder, rel)
          await assertSafePath(this.files, job.projectFolder, destination)
          if (!await exists(this.files, destination)) writes.push({ path: rel, bytes: manifestBytes, size: manifestBytes.length, sha256: createHash('sha256').update(manifestBytes).digest('hex') })
          continue
        }
        const integrity = job.integrityByPath.get(rel)
        if (!integrity) throw new Error(`Metadados de integridade ausentes para ${rel}.`)
        writes.push({ path: rel, sourcePath: stagedFile, sourceSignature: integrity.signature, size: integrity.size, sha256: integrity.sha256 })
      }
      const mergedProjectBytes = Buffer.from(`${JSON.stringify(mergedProject, null, 2)}\n`, 'utf8')
      writes.push({ path: projectFile, bytes: mergedProjectBytes, size: mergedProjectBytes.length, sha256: createHash('sha256').update(mergedProjectBytes).digest('hex') })

      const removes: string[] = []
      const exportedCharacterRoots = [...job.namesById.values()].map(({ folderName }) => join('assets', 'characters', folderName))
      for (const relativeRoot of exportedCharacterRoots) {
        const rootPath = resolve(job.projectFolder, relativeRoot)
        await assertSafePath(this.files, job.projectFolder, rootPath)
        if (!await exists(this.files, rootPath)) continue
        for (const oldFile of await walkFiles(this.files, rootPath)) {
          const rel = normalizeRelative(relative(job.projectFolder, oldFile))
          if (!isRoteiroCharacterExportAssetPath(rel) || stagedRelativePaths.has(rel)) continue
          removes.push(rel)
        }
      }

      await this.publication.publish(job.projectFolder, job.jobId, { writes, removes })
    }
    this.jobs.delete(job.jobId)
    await this.files.rm(job.stageFolder, { recursive: true, force: true }).catch(() => undefined)
    return { folderName: basename(job.projectFolder), path: job.projectFolder, characters: job.roteiro.characters.length, files: job.files.size }
  }

  async cancel(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId)
    if (!job) return
    await this.files.rm(job.stageFolder, { recursive: true, force: true })
    this.jobs.delete(jobId)
  }
}

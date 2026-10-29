import { lstat, mkdir, readFile, stat } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import type { RoteiroDocument, RoteiroExportCharacterInfo, RoteiroSectionContent, RoteiroVideoReference } from '../../../src/shared/roteiros'
import { createRoteiroProjectExportTransaction, isRoteiroProjectExportAssetPath, roteiroProjectExportManifestPath, type RoteiroProjectExportWrite } from './projectExportTransaction.ts'
import { roteiroV4ProjectsRoot } from './projectPaths.ts'

const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
type Manifest = { app: 'GACHA_V5_ROTEIRO_EXPORT'; scriptId: string; files: string[] }
const safeSegment = (value: string) => {
  const cleaned = value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9 _-]/g, '-').replace(/[\s_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 72) || 'roteiro'
  return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(cleaned) ? `${cleaned}-item` : cleaned
}
const sectionEntries = (roteiro: RoteiroDocument): Array<{ label: string; section: RoteiroSectionContent }> => [
  { label: 'Abertura', section: roteiro.opening ?? { video: null, blocks: [] } },
  ...roteiro.tiktoks.map((tiktok) => ({ label: tiktok.title, section: { video: tiktok.video ?? null, blocks: tiktok.blocks ?? [], description: tiktok.description, timeline: tiktok.timeline, sceneEndSeconds: tiktok.sceneEndSeconds, firstGroupReactionSeconds: tiktok.firstGroupReactionSeconds, secondGroupReactionSeconds: tiktok.secondGroupReactionSeconds } }))
]
const displayTime = (seconds: number | undefined) => seconds === undefined ? 'não definido' : `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(seconds)} segundos`
const characterFolder = (name: string, id: string) => safeSegment(name || 'personagem') || `personagem-${id.slice(0, 8)}`

export class RoteiroProjectExportStore {
  private readonly transaction = createRoteiroProjectExportTransaction()
  constructor(private readonly resolveBackground: (id: string) => Promise<string>, private readonly resolveGif: (id: string) => Promise<string>, private readonly resolveVideo: (video: RoteiroVideoReference) => Promise<string>, private readonly projectsRoot = roteiroV4ProjectsRoot) {}
  private async projectFolder(roteiro: RoteiroDocument) {
    const root = resolve(this.projectsRoot)
    const info = await lstat(root).catch(() => null)
    if (!info?.isDirectory() || info.isSymbolicLink() || resolve(root) !== root) throw new Error(`A pasta de projetos do Editor V4 não está disponível: ${root}`)
    const folder = resolve(root, safeSegment(roteiro.title))
    if (dirname(folder) !== root) throw new Error('Nome de pasta de roteiro inválido.')
    const existing = await lstat(folder).catch(() => null)
    if (existing && (!existing.isDirectory() || existing.isSymbolicLink())) throw new Error('A pasta existente do projeto não é segura.')
    await mkdir(folder, { recursive: true })
    return folder
  }
  async ensureExportFolder(roteiro: RoteiroDocument, kind: 'characters' | 'background' | 'videos' | 'script' | 'ui') {
    if (!idPattern.test(roteiro.id)) throw new Error('ID do roteiro inválido.')
    const project = await this.projectFolder(roteiro)
    const folder = kind === 'characters' ? join(project, 'assets', 'characters')
      : kind === 'background' ? join(project, 'assets', 'backgrounds')
      : kind === 'videos' ? join(project, 'assets', 'tiktoks') : kind === 'ui' ? join(project, 'assets', 'ui') : project
    await this.transaction.recover(project)
    await mkdir(folder, { recursive: true })
    return folder
  }
  private async writeOwned(folder: string, scriptId: string, outputs: RoteiroProjectExportWrite[], scope: string) {
    await this.transaction.recover(folder)
    const manifestPath = join(folder, roteiroProjectExportManifestPath)
    let manifest: Manifest = { app: 'GACHA_V5_ROTEIRO_EXPORT', scriptId, files: [] }
    try {
      const manifestInfo = await lstat(manifestPath)
      if (!manifestInfo.isFile() || manifestInfo.isSymbolicLink()) throw new Error('O manifesto de exportação é um caminho não seguro.')
      const stored = JSON.parse(await readFile(manifestPath, 'utf8')) as Manifest
      if (stored.app !== manifest.app || stored.scriptId !== scriptId || !Array.isArray(stored.files) || !stored.files.every((item) => typeof item === 'string')) throw new Error('A pasta de exportação pertence a outro roteiro; nenhum arquivo foi alterado.')
      if (stored.files.some((path) => !isRoteiroProjectExportAssetPath(path)) || new Set(stored.files).size !== stored.files.length) throw new Error('O manifesto contém caminhos duplicados ou fora dos arquivos exportados pelo Gacha; nenhum arquivo foi alterado.')
      manifest = stored
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
    const prior = new Set(manifest.files)
    const inScope = (path: string) => scope === 'roteiro.txt' ? path === scope : path.startsWith(scope)
    if (outputs.some(({ path }) => !isRoteiroProjectExportAssetPath(path) || !inScope(path))) throw new Error('A exportação contém um caminho fora do conjunto de arquivos permitido.')
    if (new Set(outputs.map(({ path }) => path)).size !== outputs.length) throw new Error('A exportação contém destinos duplicados.')
    const nextFiles = new Set([...prior].filter((path) => !inScope(path)))
    for (const output of outputs) {
      const target = resolve(folder, ...output.path.split('/'))
      const existing = await lstat(target).catch((error) => {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
        throw error
      })
      if (existing && (!prior.has(output.path) || !existing.isFile() || existing.isSymbolicLink())) throw new Error(`O arquivo ${basename(target)} já existe e não pertence a uma exportação controlada do Gacha V5; foi preservado.`)
      nextFiles.add(output.path)
    }
    const manifestBytes = Buffer.from(`${JSON.stringify({ app: manifest.app, scriptId, files: [...nextFiles].sort() }, null, 2)}\n`, 'utf8')
    await this.transaction.publish(folder, {
      writes: [...outputs, { path: roteiroProjectExportManifestPath, bytes: manifestBytes }],
      removes: [...prior].filter((path) => !nextFiles.has(path)).sort()
    })
    return { folder, files: outputs.length }
  }
  async export(roteiro: RoteiroDocument, kind: 'background' | 'videos' | 'script' | 'gif', characterInfo: RoteiroExportCharacterInfo[] = []) {
    if (!idPattern.test(roteiro.id)) throw new Error('ID do roteiro inválido.')
    const folder = await this.projectFolder(roteiro)
    const outputs: Array<{ path: string; bytes?: Buffer; sourcePath?: string; expectedSize?: number }> = []
    if (kind === 'gif') {
      if (!roteiro.uiGifAssetId || !idPattern.test(roteiro.uiGifAssetId)) throw new Error('Selecione um GIF para este roteiro antes de exportar.')
      const source = await this.resolveGif(roteiro.uiGifAssetId)
      const info = await stat(source)
      if (!info.size || info.size > 50 * 1024 ** 2) throw new Error('O GIF está vazio ou excede 50 MB.')
      outputs.push({ path: 'assets/ui/loading.gif', sourcePath: source, expectedSize: info.size })
    } else if (kind === 'background') {
      if (!roteiro.backgroundAssetId || !idPattern.test(roteiro.backgroundAssetId)) throw new Error('Selecione um fundo para este roteiro antes de exportar.')
      const source = await this.resolveBackground(roteiro.backgroundAssetId)
      const info = await stat(source)
      if (!info.size || info.size > 100 * 1024 ** 2) throw new Error('O arquivo do fundo está vazio ou excede 100 MB.')
      const extension = source.match(/\.(png|jpg|jpeg|webp)$/i)?.[1]?.toLowerCase() ?? 'png'
      outputs.push({ path: `assets/backgrounds/01.${extension}`, sourcePath: source, expectedSize: info.size })
    } else if (kind === 'videos') {
      const sections = sectionEntries(roteiro).filter(({ section }) => section.video)
      if (!sections.length) throw new Error('Este roteiro não tem vídeos para exportar.')
      for (const [index, { section }] of sections.entries()) {
        const reference = section.video!
        if (!idPattern.test(reference.id)) throw new Error('Uma referência de vídeo do roteiro é inválida.')
        const source = await this.resolveVideo(reference)
        const info = await stat(source)
        if (info.size !== reference.size || info.size > 5 * 1024 ** 3) throw new Error(`O arquivo “${reference.name}” não corresponde ao tamanho salvo no roteiro.`)
        outputs.push({ path: `assets/tiktoks/${String(index + 1).padStart(2, '0')}.${reference.extension}`, sourcePath: source, expectedSize: reference.size })
      }
    } else {
      const names = new Map(characterInfo.map((character) => [character.id, character.name]))
      const sections = sectionEntries(roteiro)
      const videoNumbers = new Map<number, string>()
      let videoNumber = 0
      sections.forEach(({ section }, index) => { if (section.video) videoNumbers.set(index, String(++videoNumber).padStart(2, '0')) })
      const lines = ['PERSONAGENS E EXPRESSÕES', '========================', '']
      const charactersById = new Map(characterInfo.map((character) => [character.id, character]))
      const usedFolders = new Set<string>()
      const folderById = new Map<string, string>()
      for (const character of characterInfo) {
        const base = characterFolder(character.name, character.id)
        let folder = base
        if (usedFolders.has(folder.toLocaleLowerCase('en-US'))) folder = `${base}-${character.id.slice(0, 8)}`
        usedFolders.add(folder.toLocaleLowerCase('en-US'))
        folderById.set(character.id, folder)
      }
      const knownIds = new Set(characterInfo.map((character) => character.id))
      for (const id of roteiro.characterIds) {
        const character = charactersById.get(id)
        const name = character?.name ?? `Personagem ${id.slice(0, 8)}`
        const folder = `assets/characters/${folderById.get(id) ?? characterFolder(name, id)}`
        lines.push(name, `Pasta exata: ${folder}`)
        if (character) {
          lines.push(`Modelo Dev: ${character.modelSlot}`, `Cabelo: ${character.hair || 'Não informado.'}`, `Roupa: ${character.outfit || 'Não informada.'}`, `Pele: ${character.skin || 'Não informada.'}`)
          const poseSlots = character.poseSlots.length ? character.poseSlots : [0]
          lines.push('Poses:')
          poseSlots.forEach((slot, index) => lines.push(`- POSE ${index + 1}${slot > 0 ? ` (slot ${String(slot).padStart(2, '0')})` : ' (modelo base)'} · Pasta exata: ${folder}/POSE ${index + 1}`))
          const expressions = [...new Set(['normal', ...character.expressions])]
          lines.push(`Expressões: ${expressions.join(', ')}`, `Variantes por expressão: base, blink, talk${character.hasFaceAppearance ? ', pt, pt-blink, pt-talk' : ''}`)
        } else lines.push('Expressões: normal', 'Aviso: os detalhes deste personagem não estavam disponíveis no Customizador durante a exportação.')
        lines.push('')
      }
      if (!roteiro.characterIds.length) lines.push('Nenhum personagem selecionado.', '')
      const backgroundPath = roteiro.backgroundAssetId ? `assets/backgrounds/01${await this.resolveBackground(roteiro.backgroundAssetId).then((path) => path.match(/\.(png|jpg|jpeg|webp)$/i)?.[0] ?? '.png')}` : null
      if (backgroundPath) lines.push('FUNDO', '=====', `Caminho exato: ${backgroundPath}`, `Nome do arquivo: ${basename(backgroundPath)}`, '')
      else lines.push('FUNDO', '=====', 'Nenhum fundo selecionado para este roteiro.', '')
      lines.push('ROTEIRO', '=======', '', `Roteiro: ${roteiro.title}`, `Título do vídeo: ${roteiro.videoTitle}`, '')
      for (const [index, { label, section }] of sections.entries()) {
        if (index === 0) lines.push('ABERTURA', '========')
        else lines.push(`TIKTOK ${String(index).padStart(2, '0')} — ${label}`, '-'.repeat(Math.max(12, label.length + 12)))
        if (section.video) {
          const number = videoNumbers.get(index)
          lines.push(`Duração total do vídeo: ${displayTime(section.video.durationFrames / 60)}`, `Caminho exato: ${number ? `assets/tiktoks/${number}.${section.video.extension}` : 'vídeo não exportado'}`)
        } else if (index > 0) lines.push('Duração total do vídeo: não disponível', 'Caminho exato: vídeo não exportado')
        lines.push(`Cena da descrição termina no ${displayTime(section.sceneEndSeconds)}`, `Primeira reação em grupo no ${displayTime(section.firstGroupReactionSeconds)}`, `Segunda reação em grupo no ${displayTime(section.secondGroupReactionSeconds)}`)
        lines.push(`Descrição: ${section.description?.trim() || 'Não informada.'}`, `Linha do tempo: ${{ unspecified: 'Indefinido', past: 'Passado', present: 'Presente', future: 'Futuro' }[section.timeline ?? 'unspecified']}`)
        if (!section.blocks.length) lines.push('Sem falas ou pensamentos.')
        section.blocks.forEach((block, blockIndex) => {
          const name = names.get(block.characterId) ?? (knownIds.has(block.characterId) ? `Personagem ${block.characterId.slice(0, 8)}` : 'Personagem não selecionado no elenco')
          lines.push(`${blockIndex + 1} - ${name} (${block.kind === 'fala' ? 'fala' : 'pensamento'}${block.expression ? ` · ${block.expression}` : ''})`, `Português: ${block.textPortuguese || 'Não preenchido.'}`, `English: ${block.textEnglish || 'Não preenchido.'}`)
        })
        if (section.video) lines.push(`Vídeo original: ${section.video.name}`, `ID do vídeo: ${section.video.id}`)
        lines.push('')
      }
      outputs.push({ path: 'roteiro.txt', bytes: Buffer.from(`${lines.join('\n').trim()}\n`, 'utf8') })
    }
    const result = await this.writeOwned(folder, roteiro.id, outputs, kind === 'gif' ? 'assets/ui/' : kind === 'background' ? 'assets/backgrounds/' : kind === 'videos' ? 'assets/tiktoks/' : 'roteiro.txt')
    return { path: result.folder, files: result.files }
  }
}

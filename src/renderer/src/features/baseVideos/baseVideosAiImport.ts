import type { CustomizerCharacter } from '../../../../shared/customizer'
import type { RoteiroDocument, RoteiroReactionBlock, RoteiroSectionContent } from '../../../../shared/roteiros'
import type { BaseVideoDetails } from '../../../../shared/baseVideos'
import type { VideoLibraryItem } from '../../../../shared/mediaLibrary'
import { EDITOR_V6_REACT_IMPORT_FORMAT, parseEditorV6ReactImport, resolveEditorV6ReactVideos, type EditorV6ReactImport, type EditorV6ReactImportSource } from '../../../../shared/editorV6ReactImport.ts'

export const AI_IMPORT_FORMAT = 'NYMI_IMPORTABLE_SCRIPT_V1'
type ImportedVideo = { videoId: string; order: number; startSeconds?: number; durationSeconds?: number }
type ImportedCharacter = { characterId: string; name?: string; model?: 'feminino' | 'masculino' }
type ImportedBlock = { type: 'speech' | 'thought'; characterId: string; videoId: string; text: string; englishText?: string; startAt?: number }
export type AiImportDocument = { format: typeof AI_IMPORT_FORMAT | typeof EDITOR_V6_REACT_IMPORT_FORMAT; title: string; videos: ImportedVideo[]; characters: ImportedCharacter[]; blocks: ImportedBlock[]; opening?: { blocks: Array<{ type: 'speech' | 'thought'; characterId: string; text: string; englishText?: string; startAt?: number }> }; generalContext?: string; sourceDocument?: EditorV6ReactImportSource }
export type AiImportValidation = { data: AiImportDocument | null; errors: string[]; warnings: string[] }
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
const cleanText = (value: unknown) => typeof value === 'string' ? value.trim() : ''

export function validateAiImport(value: unknown, items: VideoLibraryItem[], characters: CustomizerCharacter[], detailsById: Record<string, BaseVideoDetails> = {}): AiImportValidation {
  const source = record(value), errors: string[] = [], warnings: string[] = []
  if (source.format === EDITOR_V6_REACT_IMPORT_FORMAT) return validateEditorV6ReactImport(source, items, characters, detailsById)
  if (source.format !== AI_IMPORT_FORMAT) errors.push(`O formato precisa ser ${AI_IMPORT_FORMAT}.`)
  const title = cleanText(source.title) || 'Roteiro importado'
  if (!cleanText(source.title)) warnings.push('O arquivo não informou título; será usado “Roteiro importado”.')
  const itemById = new Map(items.map((item) => [item.id, item]))
  const rawVideos = Array.isArray(source.videos) ? source.videos : []
  const rawCharacters = Array.isArray(source.characters) ? source.characters : []
  const rawBlocks = Array.isArray(source.blocks) ? source.blocks : []
  if (!rawVideos.length) errors.push('O roteiro precisa selecionar pelo menos um vídeo.')
  if (!Array.isArray(source.videos) || !Array.isArray(source.characters) || !Array.isArray(source.blocks)) errors.push('videos, characters e blocks precisam ser listas JSON.')
  if (rawVideos.length > 500 || rawBlocks.length > 10000) errors.push('O arquivo excede o limite de 500 vídeos ou 10.000 falas/pensamentos.')
  const seenVideoIds = new Set<string>(), seenOrders = new Set<number>()
  const videos: AiImportDocument['videos'] = []
  rawVideos.forEach((entry, index) => {
    const video = record(entry), id = cleanText(video.videoId), order = Number(video.order), local = itemById.get(id)
    if (!local) errors.push(`Vídeos[${index + 1}]: ID “${id || '(vazio)'}” não existe na Base de Vídeos local.`)
    else if (!local.available || local.durationFrames === null) errors.push(`Vídeos[${index + 1}]: “${local.name}” está indisponível ou sem duração reconhecida.`)
    if (!Number.isSafeInteger(order) || order < 1 || order > 500) errors.push(`Vídeos[${index + 1}]: ordem deve ser um inteiro entre 1 e 500.`)
    if (seenVideoIds.has(id)) errors.push(`O vídeo ${id} foi listado mais de uma vez.`)
    if (seenOrders.has(order)) errors.push(`A ordem ${order} foi repetida.`)
    seenVideoIds.add(id); seenOrders.add(order)
    if (local && Number.isSafeInteger(order) && order > 0) videos.push({ videoId: id, order })
  })
  const seenCharacters = new Set<string>(), knownCharacters = new Set(characters.map((character) => character.id))
  const outputCharacters: AiImportDocument['characters'] = []
  rawCharacters.forEach((entry, index) => {
    const character = record(entry), id = cleanText(character.characterId), name = cleanText(character.name)
    if (!id || id.length > 200) errors.push(`Personagens[${index + 1}]: informe characterId válido.`)
    if (seenCharacters.has(id)) errors.push(`O personagem ${id} foi listado mais de uma vez.`)
    if (!knownCharacters.has(id)) {
      if (!name) errors.push(`Personagens[${index + 1}]: personagens novos precisam de nome.`)
      else warnings.push(`“${name}” será criado no Customizador durante a importação.`)
    }
    if (character.model !== undefined && character.model !== 'feminino' && character.model !== 'masculino') errors.push(`Personagens[${index + 1}]: model precisa ser feminino ou masculino.`)
    seenCharacters.add(id)
    if (id) outputCharacters.push({ characterId: id, ...(name ? { name } : {}), ...(character.model === 'feminino' || character.model === 'masculino' ? { model: character.model } : {}) })
  })
  if (rawCharacters.length > 500) errors.push('O roteiro excede 500 personagens.')
  const characterIds = new Set(outputCharacters.map((item) => item.characterId)), videoIds = new Set(videos.map((item) => item.videoId))
  const blocks: AiImportDocument['blocks'] = []
  rawBlocks.forEach((entry, index) => {
    const block = record(entry), type = block.type, characterId = cleanText(block.characterId), videoId = cleanText(block.videoId), text = cleanText(block.text), startAt = block.startAt === undefined ? undefined : Number(block.startAt)
    if (type !== 'speech' && type !== 'thought') errors.push(`Blocos[${index + 1}]: type precisa ser speech ou thought.`)
    if (!text || text.length > 10000) errors.push(`Blocos[${index + 1}]: texto vazio ou acima de 10.000 caracteres.`)
    if (!characterIds.has(characterId)) errors.push(`Blocos[${index + 1}]: personagem não selecionado.`)
    if (!videoIds.has(videoId)) errors.push(`Blocos[${index + 1}]: vídeo não selecionado.`)
    if (startAt !== undefined && (!Number.isFinite(startAt) || startAt < 0 || startAt > 86400)) errors.push(`Blocos[${index + 1}]: startAt inválido.`)
    const englishText = cleanText(block.englishText ?? block.english)
    if ((type === 'speech' || type === 'thought') && text && characterIds.has(characterId) && videoIds.has(videoId) && (startAt === undefined || Number.isFinite(startAt) && startAt >= 0)) blocks.push({ type, characterId, videoId, text, ...(englishText ? { englishText } : {}), ...(startAt === undefined ? {} : { startAt }) })
  })
  const openingSource = record(source.opening), rawOpening = source.opening === undefined ? undefined : Array.isArray(openingSource.blocks) ? openingSource.blocks : null
  if (source.opening !== undefined && !rawOpening) errors.push('opening.blocks precisa ser uma lista.')
  const openingBlocks: NonNullable<AiImportDocument['opening']>['blocks'] = []
  rawOpening?.forEach((entry, index) => {
    const block = record(entry), type = block.type, characterId = cleanText(block.characterId), text = cleanText(block.text), englishText = cleanText(block.englishText ?? block.english)
    if (type !== 'speech' && type !== 'thought' || !text || !characterIds.has(characterId)) errors.push(`Abertura[${index + 1}]: tipo, texto ou personagem inválido.`)
    else openingBlocks.push({ type, characterId, text, ...(englishText ? { englishText } : {}) })
  })
  videos.sort((left, right) => left.order - right.order)
  const data: AiImportDocument = { format: AI_IMPORT_FORMAT, title: title.slice(0, 100), videos, characters: outputCharacters, blocks, ...(rawOpening ? { opening: { blocks: openingBlocks } } : {}), ...(cleanText(source.generalContext) ? { generalContext: cleanText(source.generalContext).slice(0, 20000) } : {}) }
  return { data: errors.length ? null : data, errors, warnings }
}

function validateEditorV6ReactImport(source: Record<string, unknown>, items: VideoLibraryItem[], characters: CustomizerCharacter[], detailsById: Record<string, BaseVideoDetails>): AiImportValidation {
  const errors: string[] = [], warnings: string[] = []
  let parsed: EditorV6ReactImport
  let sourceDocument: EditorV6ReactImportSource
  try {
    const bytes = new TextEncoder().encode(JSON.stringify(source)).byteLength
    if (bytes > 2 * 1024 * 1024) return { data: null, errors: ['O guia V14.5 limita o JSON a 2 MB.'], warnings }
    parsed = parseEditorV6ReactImport(source)
    sourceDocument = JSON.parse(JSON.stringify(source)) as EditorV6ReactImportSource
  } catch (reason) {
    const detail = reason instanceof Error ? reason.message : 'formato inválido'
    return { data: null, errors: [`JSON do Editor V6 inválido: ${detail}`], warnings }
  }

  const charactersById = new Map(characters.map((item) => [item.id, item]))
  const charactersByName = new Map<string, CustomizerCharacter[]>()
  for (const item of characters) {
    const key = item.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('pt-BR')
    charactersByName.set(key, [...(charactersByName.get(key) ?? []), item])
  }
  const resolveCharacter = (reference: string) => {
    const direct = charactersById.get(reference)
    if (direct) return direct
    const key = reference.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('pt-BR')
    const matches = charactersByName.get(key) ?? []
    if (matches.length !== 1) throw new Error(matches.length ? `Nome de personagem ambíguo: “${reference}”.` : `Personagem não encontrado no Customizador: “${reference}”.`)
    return matches[0]
  }
  const castIds = new Set<string>()
  const outputCharacters: ImportedCharacter[] = []
  for (const cast of parsed.cast) {
    try {
      const resolved = resolveCharacter(cast.character)
      if (castIds.has(resolved.id)) errors.push(`O elenco contém o personagem “${resolved.name}” mais de uma vez.`)
      castIds.add(resolved.id)
      outputCharacters.push({ characterId: resolved.id, name: resolved.name })
    } catch (reason) { errors.push(reason instanceof Error ? reason.message : String(reason)) }
  }
  for (const [index, entry] of (parsed.intro ?? []).entries()) {
    if (entry.kind !== 'character') continue
    try {
      const character = resolveCharacter(entry.character)
      if (!castIds.has(character.id)) errors.push(`Intro[${index + 1}]: “${character.name}” precisa estar no elenco.`)
    } catch (reason) {
      errors.push(`Intro[${index + 1}]: ${reason instanceof Error ? reason.message : String(reason)}`)
    }
  }
  if (parsed.intro) warnings.push('A Intro fica no JSON original. Importe esse arquivo no Editor V6 para criar a faixa Intro.')
  // Resolve names and stable video numbers using current library metadata supplied by the caller.
  const currentDetails = Object.values(detailsById)
  let resolvedVideos: EditorV6ReactImport['videos'] = []
  try { resolvedVideos = resolveEditorV6ReactVideos(parsed, items, currentDetails).videos }
  catch (reason) { errors.push(reason instanceof Error ? reason.message : String(reason)) }
  if (!parsed.videos.length) errors.push('O JSON V6 precisa incluir pelo menos um vídeo para virar roteiro na Base de Vídeos.')
  const itemById = new Map(items.map((item) => [item.id, item]))
  const videos: ImportedVideo[] = resolvedVideos.flatMap((video, index) => {
    const item = video.videoId ? itemById.get(video.videoId) : undefined
    if (!item || !item.available || item.durationFrames === null) {
      errors.push(`Vídeos[${index + 1}]: mídia ausente, indisponível ou sem duração reconhecida na Base de Vídeos.`)
      return []
    }
    return [{ videoId: item.id, order: 0, startSeconds: video.startSeconds, ...(video.durationSeconds === undefined ? {} : { durationSeconds: video.durationSeconds }) }]
  }).sort((a, b) => (a.startSeconds ?? 0) - (b.startSeconds ?? 0)).map((video, index) => ({ ...video, order: index + 1 }))
  const videoRefCounts = new Map<string, number>()
  for (const video of videos) videoRefCounts.set(video.videoId, (videoRefCounts.get(video.videoId) ?? 0) + 1)
  for (const [videoId, count] of videoRefCounts) if (count > 1) errors.push(`O vídeo ${videoId} aparece ${count} vezes. A área Roteiros não distingue instâncias repetidas do mesmo arquivo ao associar as falas; use um arquivo por clipe ou importe o JSON diretamente no Editor V6.`)

  const intervals = videos.map((video) => {
    const item = itemById.get(video.videoId)!
    const start = video.startSeconds ?? 0
    const duration = Math.min(video.durationSeconds ?? item.durationFrames! / 60, item.durationFrames! / 60)
    return { video, start, end: start + duration }
  })
  for (let index = 1; index < intervals.length; index++) if (intervals[index].start < intervals[index - 1].end) errors.push(`Os clipes ${intervals[index - 1].video.videoId} e ${intervals[index].video.videoId} se sobrepõem na timeline; Roteiros exige ordem sequencial.`)
  const blocks: ImportedBlock[] = []
  const openingBlocks: NonNullable<AiImportDocument['opening']>['blocks'] = []
  parsed.lines.forEach((line, index) => {
    let character: CustomizerCharacter | undefined
    try { character = resolveCharacter(line.character) } catch (reason) { errors.push(`Linhas[${index + 1}]: ${reason instanceof Error ? reason.message : String(reason)}`) }
    if (!character || !castIds.has(character.id)) {
      if (character) errors.push(`Linhas[${index + 1}]: “${character.name}” não está no elenco.`)
      return
    }
    const active = intervals.find((interval) => line.startSeconds >= interval.start && line.startSeconds < interval.end)
    const blockType = line.kind === 'speech' ? 'speech' : 'thought'
    if (active) {
      blocks.push({ type: blockType, characterId: character.id, videoId: active.video.videoId, text: line.text, ...(line.englishText !== undefined ? { englishText: line.englishText } : {}), startAt: line.startSeconds - active.start })
    } else if (intervals.length && line.startSeconds < intervals[0].start) {
      openingBlocks.push({ type: blockType, characterId: character.id, text: line.text, ...(line.englishText !== undefined ? { englishText: line.englishText } : {}), startAt: line.startSeconds })
    } else {
      errors.push(`Linhas[${index + 1}]: início ${line.startSeconds}s não está dentro de nenhum vídeo da Base; ajuste o tempo ou o intervalo dos clipes.`)
    }
  })
  for (const interval of intervals) {
    const count = blocks.filter((block) => block.videoId === interval.video.videoId).length
    if (count > 200) errors.push(`O vídeo ${interval.video.videoId} tem ${count} falas; Roteiros aceita até 200 blocos por seção.`)
  }
  if (openingBlocks.length > 200) errors.push('A abertura excede o limite de 200 blocos do editor de Roteiros.')
  warnings.push('Esta conversão cria um roteiro de Roteiros: os clipes ficam em sequência e os tempos das falas são rebaseados para cada vídeo; a timeline global e as lacunas não são representadas. Poses, expressões, beats, posições, layouts, durações individuais das falas e parâmetros de automação ficam preservados no JSON original anexado à origem da importação, mas não são editáveis nesta área.')
  const data: AiImportDocument = {
    format: EDITOR_V6_REACT_IMPORT_FORMAT,
    title: parsed.title,
    videos,
    characters: outputCharacters,
    blocks,
    ...(openingBlocks.length ? { opening: { blocks: openingBlocks } } : {}),
    sourceDocument
  }
  return { data: errors.length ? null : data, errors, warnings }
}

export function createRoteiroFromAiImport(document: AiImportDocument, items: VideoLibraryItem[], detailsById: Record<string, BaseVideoDetails>, idMap: Map<string, string>, importId: string, createdCharacterIds: string[], makeId = () => crypto.randomUUID()): RoteiroDocument {
  const itemById = new Map(items.map((item) => [item.id, item]))
  const mapBlock = (block: { type: 'speech' | 'thought'; characterId: string; text: string; englishText?: string; startAt?: number }): RoteiroReactionBlock => ({ id: makeId(), characterId: idMap.get(block.characterId) ?? block.characterId, kind: block.type === 'speech' ? 'fala' : 'pensamento', expression: '', textPortuguese: block.text, textEnglish: block.englishText ?? '', ...(block.startAt === undefined ? {} : { startAt: block.startAt }) })
  const opening: RoteiroSectionContent | undefined = document.opening ? { video: null, blocks: document.opening.blocks.map(mapBlock), description: '', additionalContext: document.generalContext ?? '', timeline: 'unspecified' } : undefined
  const tiktoks = document.videos.map((choice, index) => {
    const item = itemById.get(choice.videoId)!
    const details = detailsById[item.id]
    const blocks = document.blocks.filter((block) => block.videoId === item.id).sort((a, b) => (a.startAt ?? details?.sceneEndSeconds ?? 0) - (b.startAt ?? details?.sceneEndSeconds ?? 0)).map(mapBlock)
    return { id: makeId(), title: `TikTok ${String(index + 1).padStart(2, '0')}`, videoTitle: `Vídeo ${String(index + 1).padStart(2, '0')}`, video: { id: item.id, name: item.name, mimeType: item.mimeType, extension: item.extension, size: item.size, durationFrames: item.durationFrames! }, blocks, description: details?.description ?? '', timeline: details?.timeline ?? 'unspecified', sceneEndSeconds: details?.sceneEndSeconds, firstGroupReactionSeconds: details?.firstGroupReactionSeconds, secondGroupReactionSeconds: details?.secondGroupReactionSeconds, additionalContext: details?.additionalContext ?? document.generalContext ?? '' }
  })
  const importedAt = new Date().toISOString()
  return { id: makeId(), title: document.title, videoTitle: tiktoks[0]?.videoTitle ?? 'Vídeo 01', characterIds: document.characters.map((character) => idMap.get(character.characterId) ?? character.characterId), ...(opening ? { opening } : {}), tiktoks, importOrigin: { kind: 'ai-json', importId, importedAt, createdCharacterIds, sourceTitle: document.title, ...(document.sourceDocument ? { sourceFormat: EDITOR_V6_REACT_IMPORT_FORMAT, sourceDocument: document.sourceDocument } : {}) } }
}

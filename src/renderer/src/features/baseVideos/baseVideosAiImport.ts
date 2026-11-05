import type { CustomizerCharacter } from '../../../../shared/customizer'
import type { RoteiroDocument, RoteiroReactionBlock, RoteiroSectionContent } from '../../../../shared/roteiros'
import type { BaseVideoDetails } from '../../../../shared/baseVideos'
import type { VideoLibraryItem } from '../../../../shared/mediaLibrary'

export const AI_IMPORT_FORMAT = 'NYMI_IMPORTABLE_SCRIPT_V1'
export type AiImportDocument = { format: typeof AI_IMPORT_FORMAT; title: string; videos: Array<{ videoId: string; order: number }>; characters: Array<{ characterId: string; name?: string; model?: 'feminino' | 'masculino' }>; blocks: Array<{ type: 'speech' | 'thought'; characterId: string; videoId: string; text: string; englishText?: string; startAt?: number }>; opening?: { blocks: Array<{ type: 'speech' | 'thought'; characterId: string; text: string; englishText?: string }> }; generalContext?: string }
export type AiImportValidation = { data: AiImportDocument | null; errors: string[]; warnings: string[] }
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
const cleanText = (value: unknown) => typeof value === 'string' ? value.trim() : ''

export function validateAiImport(value: unknown, items: VideoLibraryItem[], characters: CustomizerCharacter[]): AiImportValidation {
  const source = record(value), errors: string[] = [], warnings: string[] = []
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
  return { id: makeId(), title: document.title, videoTitle: tiktoks[0]?.videoTitle ?? 'Vídeo 01', characterIds: document.characters.map((character) => idMap.get(character.characterId) ?? character.characterId), ...(opening ? { opening } : {}), tiktoks, importOrigin: { kind: 'ai-json', importId, importedAt, createdCharacterIds, sourceTitle: document.title } }
}

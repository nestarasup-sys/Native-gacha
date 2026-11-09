import type { BaseVideoCategory, BaseVideoDetails } from '../../../../shared/baseVideos'
import type { CustomizerCharacter } from '../../../../shared/customizer'
import type { CharacterSheet } from '../../../../shared/roteiros'
import type { VideoLibraryItem } from '../../../../shared/mediaLibrary'

export type BaseVideoSimpleExportEntry = {
  item: VideoLibraryItem
  details: BaseVideoDetails
  category?: BaseVideoCategory
}

const timelineLabels: Record<BaseVideoDetails['timeline'], string> = {
  unspecified: 'Indefinido',
  past: 'Passado',
  present: 'Presente',
  future: 'Futuro'
}

const seconds = (value: number | undefined) => `${(value ?? 0).toFixed(2)} segundos`

export function selectSimpleExportEntries(
  entries: BaseVideoSimpleExportEntry[],
  categoryId: string | 'all' | 'uncategorized'
): BaseVideoSimpleExportEntry[] {
  return entries
    .filter(({ details }) => details.videoNumber !== undefined && Boolean(details.description?.trim()))
    .filter(({ details }) => categoryId === 'all' || (categoryId === 'uncategorized' ? !details.categoryId : details.categoryId === categoryId))
    .sort((left, right) => {
      const leftNumber = left.details.videoNumber
      const rightNumber = right.details.videoNumber
      if (leftNumber !== undefined && rightNumber !== undefined) return leftNumber - rightNumber
      if (leftNumber !== undefined) return -1
      if (rightNumber !== undefined) return 1
      return left.item.createdAt.localeCompare(right.item.createdAt) || left.item.name.localeCompare(right.item.name, 'pt-BR')
    })
}

export function formatSimpleVideoExport(entries: BaseVideoSimpleExportEntry[], characters: CustomizerCharacter[] = [], sheets: CharacterSheet[] = []): string {
  const videoSections = entries.map(({ item, details, category }) => {
    const heading = details.videoNumber === undefined
      ? `RASCUNHO — ${item.name}`
      : `VÍDEO ${String(details.videoNumber).padStart(2, '0')} — ${item.name}`
    const duration = item.durationFrames === null ? 'Não reconhecida' : seconds(item.durationFrames / 60)
    return [
      heading,
      `DURAÇÃO DO VÍDEO: ${duration}`,
      'DESCRIÇÃO:', details.description.trim() || 'Não preenchida.',
      `TEMPO QUE TERMINA A CENA DA DESCRIÇÃO: ${seconds(details.sceneEndSeconds)}`,
      `TEMPO DA PRIMEIRA REAÇÃO EM GRUPO: ${seconds(details.firstGroupReactionSeconds)}`,
      `TEMPO DA SEGUNDA REAÇÃO EM GRUPO: ${seconds(details.secondGroupReactionSeconds)}`,
      `CATEGORIA: ${category?.name ?? 'Sem categoria'}`,
      `LINHA DO TEMPO: ${timelineLabels[details.timeline] ?? 'Indefinido'}`,
      'CONTEXTO ADICIONAL PARA IA:', details.additionalContext?.trim() || 'Não informado.'
    ].join('\n')
  })
  const characterSections = characters.map((character, index) => {
    const savedSheet = sheets.find((sheet) => sheet.characterId === character.id)
    const ficha = savedSheet ? {
      personality: savedSheet.personality,
      backstory: savedSheet.backstory,
      fynRelationship: savedSheet.fynRelationship,
      speakingStyle: savedSheet.speakingStyle,
      relationships: savedSheet.relationships.map(({ targetCharacterId, description }) => ({ targetCharacterId, description })),
      additionalRules: savedSheet.additionalRules
    } : {
      personality: '',
      backstory: '',
      fynRelationship: '',
      speakingStyle: '',
      relationships: [],
      additionalRules: ''
    }
    return [`PERSONAGEM ${index + 1}`, `NOME: ${character.name}`, 'FICHA:', JSON.stringify(ficha, null, 2)].join('\n')
  })
  return [...videoSections, ...characterSections].join('\n\n') + (videoSections.length || characterSections.length ? '\n' : '')
}

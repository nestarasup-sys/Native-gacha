import type { BaseVideoCategory, BaseVideoDetails } from '../../../../shared/baseVideos'
import type { CharacterSheet } from '../../../../shared/roteiros'
import type { CustomizerCharacter } from '../../../../shared/customizer'
import type { VideoLibraryItem } from '../../../../shared/mediaLibrary'

export function buildBaseVideosAiPackage(items: VideoLibraryItem[], detailsById: Record<string, BaseVideoDetails>, categories: BaseVideoCategory[], characters: CustomizerCharacter[], sheets: CharacterSheet[]): string {
  const categoryNames = new Map(categories.map((category) => [category.id, category.name]))
  const orderedItems = [...items].sort((left, right) => {
    const leftNumber = detailsById[left.id]?.videoNumber, rightNumber = detailsById[right.id]?.videoNumber
    if (leftNumber !== undefined && rightNumber !== undefined) return leftNumber - rightNumber
    if (leftNumber !== undefined) return -1
    if (rightNumber !== undefined) return 1
    return left.createdAt.localeCompare(right.createdAt) || left.name.localeCompare(right.name, 'pt-BR')
  })
  const videos = orderedItems.map((item, index) => {
    const details = detailsById[item.id]
    return { videoId: item.id, order: index + 1, videoNumber: details?.videoNumber ?? null, name: item.name, available: item.available, durationSeconds: item.durationFrames === null ? null : Number((item.durationFrames / 60).toFixed(2)), description: details?.description ?? '', sceneEndSeconds: details?.sceneEndSeconds ?? null, firstGroupReactionSeconds: details?.firstGroupReactionSeconds ?? null, secondGroupReactionSeconds: details?.secondGroupReactionSeconds ?? null, category: details?.categoryId ? categoryNames.get(details.categoryId) ?? null : null, additionalContext: details?.additionalContext ?? '' }
  })
  const characterData = characters.map((character) => {
    const sheet = sheets.find((entry) => entry.characterId === character.id)
    return { characterId: character.id, name: character.name, ficha: sheet ? { personality: sheet.personality, backstory: sheet.backstory, fynRelationship: sheet.fynRelationship, speakingStyle: sheet.speakingStyle, relationships: sheet.relationships.map(({ targetCharacterId, description }) => ({ targetCharacterId, characterName: characters.find((target) => target.id === targetCharacterId)?.name ?? 'Personagem relacionado', description })), additionalRules: sheet.additionalRules } : null }
  })
  return `# Pacote completo para criar roteiro no Native-gacha\n\nUse somente os vídeos e personagens listados abaixo. Escolha os vídeos, ordene-os e escreva falas/pensamentos naturais. Não invente acontecimentos incompatíveis com a descrição. IDs de vídeo e personagem são referências obrigatórias.\n\n## Resposta exigida\n\nRetorne somente um JSON com este formato:\n\n\`\`\`json\n${JSON.stringify({ format: 'NYMI_IMPORTABLE_SCRIPT_V1', title: 'Título do roteiro', videos: [{ videoId: 'ID_EXATO_DO_VIDEO', order: 1 }], characters: [{ characterId: 'ID_EXISTENTE_OU_NOVO', name: 'Nome', model: 'feminino' }], blocks: [{ type: 'speech', characterId: 'ID_DO_PERSONAGEM', videoId: 'ID_DO_VIDEO', text: 'Fala em português', englishText: 'English line', startAt: 1.25 }], opening: { blocks: [{ type: 'thought', characterId: 'ID_DO_PERSONAGEM', text: 'Pensamento antes do primeiro vídeo' }] }, generalContext: 'Contexto opcional' }, null, 2)}\n\`\`\`\n\nRegras: use <code>speech</code> ou <code>thought</code>; cada bloco deve referenciar personagem e vídeo selecionados; <code>startAt</code> é opcional e em segundos; <code>opening</code> é opcional; para um personagem novo, use um ID único, nome e <code>model</code> (<code>feminino</code> ou <code>masculino</code>). Não envie caminhos de arquivos.\n\n## Vídeos disponíveis\n\n\`\`\`json\n${JSON.stringify(videos, null, 2)}\n\`\`\`\n\n## Personagens selecionados\n\n\`\`\`json\n${JSON.stringify(characterData, null, 2)}\n\`\`\`\n`
}

import type { BaseVideoDetails } from '../../../../shared/baseVideos'
import type { CustomizerCharacter } from '../../../../shared/customizer'
import type { VideoLibraryItem } from '../../../../shared/mediaLibrary'
import type { CharacterSheet, RoteiroDocument, RoteiroSectionContent } from '../../../../shared/roteiros'
import type { VideoBackgroundLibraryItem } from '../../../../shared/studio'
import type { FabricatorPoseSummary } from '../../../../shared/fabricator'

export type RoteiroV6ModelInventory = {
  modelSlot: number
  selectedPoses: Array<{ selection: number; slot: number; name: string; available: boolean }>
  expressions: Array<{ id: string; name: string }>
}

export function selectRoteiroV6Poses(modelSlot: number, summaries: FabricatorPoseSummary[], saved: Array<number | null> | null): RoteiroV6ModelInventory['selectedPoses'] {
  const poses = summaries.filter((pose): pose is NonNullable<FabricatorPoseSummary> => Boolean(pose && pose.sourceModelSlot === modelSlot)).sort((a, b) => a.slot - b.slot)
  const selected = saved ?? poses.slice(0, 5).map((pose) => pose.slot)
  return selected.flatMap((slot, index) => {
    if (slot === null) return []
    const pose = poses.find((item) => item.slot === slot)
    return [{ selection: index + 1, slot, name: pose?.name ?? `Pose ${slot}`, available: Boolean(pose) }]
  })
}

/** Human-readable input for the V14.1 AI guide; IDs refer to the current app libraries. */
export function buildRoteiroEditorV6Text(input: {
  roteiro: RoteiroDocument; characters: CustomizerCharacter[]; sheets: CharacterSheet[]
  models: RoteiroV6ModelInventory[]; videos: VideoLibraryItem[]; details: BaseVideoDetails[]; backgrounds: VideoBackgroundLibraryItem[]
}): string {
  const { roteiro } = input
  const byCharacter = new Map(input.characters.map((item) => [item.id, item]))
  const bySheet = new Map(input.sheets.map((item) => [item.characterId, item]))
  const byModel = new Map(input.models.map((item) => [item.modelSlot, item]))
  const byVideo = new Map(input.videos.map((item) => [item.id, item]))
  const byDetails = new Map(input.details.map((item) => [item.videoId, item]))
  const sections: Array<{ label: string; content: RoteiroSectionContent }> = [
    { label: 'ABERTURA', content: roteiro.opening ?? { video: null, blocks: [] } },
    ...roteiro.tiktoks.map((item, index) => ({ label: `TIKTOK ${String(index + 1).padStart(2, '0')} — ${item.title}`, content: { video: item.video ?? null, blocks: item.blocks ?? [], description: item.description, additionalContext: item.additionalContext, timeline: item.timeline, sceneEndSeconds: item.sceneEndSeconds, firstGroupReactionSeconds: item.firstGroupReactionSeconds, secondGroupReactionSeconds: item.secondGroupReactionSeconds } }))
  ]
  const lines = [
    'ROTEIRO PARA O IMPORTADOR DO EDITOR V6',
    'Use este TXT junto ao guia V14.1 para gerar NYMI_EDITOR_V6_REACT_V1.',
    'Preserve literalmente o texto, tipo, personagem e ordem de todas as falas e pensamentos.',
    'Os campos Português e English são strings JSON: decodifique as aspas e sequências de escape para recuperar o texto exato.',
    'IDs são referências da biblioteca atual. Não invente poses, expressões ou mídias. Poses indisponíveis não podem ser usadas.',
    'Tempos de cena e reações são relativos ao início de cada vídeo; o JSON do V6 usa tempos absolutos em segundos.',
    'O formato V6 aceita uma língua por linha; preserve o português e trate traduções existentes conforme o guia.',
    '', `Roteiro: ${roteiro.title}`, `Título do vídeo: ${roteiro.videoTitle}`, `ID do roteiro: ${roteiro.id}`, '',
    'PERSONAGENS DO CUSTOMIZADOR', '============================'
  ]
  for (const id of roteiro.characterIds) {
    const character = byCharacter.get(id), sheet = bySheet.get(id)
    lines.push('', `Personagem: ${character?.name ?? 'INDISPONÍVEL'}`, `characterId: ${id}`)
    if (!character) { lines.push('AVISO: personagem não encontrado no Customizador; resolva antes de importar.'); continue }
    const modelSlot = character.customization.modelSlot ?? 1, model = byModel.get(modelSlot)
    lines.push(`Modelo do Fabricador: ${modelSlot}`, `Aparência facial: ${character.customization.faceAppearance ? 'configurada' : 'não configurada'}`, 'Poses selecionadas no Poses Dev para Editor V6 Importer:')
    if (!model?.selectedPoses.length) lines.push('- Nenhuma pose selecionada; a pose base pode ser usada com poseSlot: null.')
    for (const pose of model?.selectedPoses ?? []) lines.push(`- Seleção ${pose.selection}: poseSlot ${pose.slot} · ${pose.name}${pose.available ? '' : ' · INDISPONÍVEL, NÃO USAR'}`)
    lines.push('Presets reais de expressão deste modelo (use ID exato):')
    if (!character.customization.faceAppearance) lines.push('- Rosto não configurado; não especifique expression até configurá-lo.')
    else if (!model?.expressions.length) lines.push('- Nenhum preset salvo; a aparência original do personagem será usada.')
    else for (const preset of model.expressions) lines.push(`- ${JSON.stringify(preset.name)} · expression: ${preset.id}`)
    lines.push('Ficha narrativa:')
    if (!sheet) lines.push('Não preenchida.')
    else lines.push(JSON.stringify({ personality: sheet.personality, backstory: sheet.backstory, fynRelationship: sheet.fynRelationship, speakingStyle: sheet.speakingStyle, relationships: sheet.relationships.map((item) => ({ characterId: item.targetCharacterId, name: byCharacter.get(item.targetCharacterId)?.name ?? 'Personagem não disponível', description: item.description })), additionalRules: sheet.additionalRules }, null, 2))
  }
  const background = roteiro.backgroundAssetId ? input.backgrounds.find((item) => item.id === roteiro.backgroundAssetId) : undefined
  lines.push('', 'FUNDO', '=====', roteiro.backgroundAssetId ? `backgroundLibraryId: ${roteiro.backgroundAssetId} · ${background?.name ?? 'não encontrado'} · ${background?.available ? 'disponível' : 'INDISPONÍVEL'}` : 'Nenhum fundo selecionado; use backgroundColor ou escolha um fundo na biblioteca.', '', 'ROTEIRO E VÍDEOS', '================')
  for (const { label, content } of sections) {
    lines.push('', label)
    const reference = content.video, video = reference ? byVideo.get(reference.id) : undefined, detail = reference ? byDetails.get(reference.id) : undefined
    if (reference) {
      lines.push(`videoId: ${reference.id}`, `Nome: ${video?.name ?? reference.name}`, `Número na Base: ${detail?.videoNumber ?? 'não publicado'}`, `Disponibilidade: ${video?.available && video.durationFrames !== null ? 'disponível' : 'INDISPONÍVEL — corrigir na Base de Vídeos'}`, `Duração do vídeo: ${(video?.durationFrames ?? reference.durationFrames) / 60} segundos${video?.durationFrames == null ? ' (referência salva no roteiro; verificar mídia)' : ''}`)
      if (detail) lines.push(`Dados atuais da Base deste vídeo: ${JSON.stringify({ description: detail.description, additionalContext: detail.additionalContext ?? '', timeline: detail.timeline, sceneEndSeconds: detail.sceneEndSeconds ?? null, firstGroupReactionSeconds: detail.firstGroupReactionSeconds ?? null, secondGroupReactionSeconds: detail.secondGroupReactionSeconds ?? null })}`)
    } else lines.push('Vídeo: nenhum vinculado.')
    const time = (value: number | undefined) => value === undefined ? 'não informado' : `${value} segundos`
    lines.push(`Cena da descrição termina em: ${time(content.sceneEndSeconds)}`, `Primeira reação em grupo: ${time(content.firstGroupReactionSeconds)}`, `Segunda reação em grupo: ${time(content.secondGroupReactionSeconds)}`, `Linha do tempo: ${content.timeline ?? 'unspecified'}`, `Descrição: ${content.description || 'Não informada.'}`, `Contexto adicional: ${content.additionalContext || 'Não informado.'}`)
    if (!content.blocks.length) lines.push('Sem falas ou pensamentos.')
    content.blocks.forEach((block, index) => {
      const name = byCharacter.get(block.characterId)?.name ?? 'Personagem não selecionado'
      lines.push('', `${index + 1} - ${name} · characterId: ${block.characterId || 'não informado'} · ${block.kind === 'fala' ? 'speech' : 'thought'}${block.startAt === undefined ? '' : ` · início informado: ${block.startAt} s`}${block.expression ? ` · expressão informada: ${block.expression}` : ''}`, `Português: ${JSON.stringify(block.textPortuguese)}`, `English: ${JSON.stringify(block.textEnglish)}`)
    })
  }
  return `${lines.join('\n')}\n`
}

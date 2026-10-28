/** Validação de documentos Roteiros; independente do processo Electron. */
import type { RoteiroDocument, RoteiroReactionBlock, RoteiroSectionContent, RoteiroTikTok, RoteiroVideoReference } from '../../../src/shared/roteiros'

export function isRoteiroDocument(value: unknown): value is RoteiroDocument {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const roteiro = value as Partial<RoteiroDocument>
  const isText = (text: unknown, max: number) => typeof text === 'string' && text.trim().length > 0 && text.length <= max
  const isId = (id: unknown) => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
  const isOptionalSeconds = (seconds: unknown) => seconds === undefined || typeof seconds === 'number' && Number.isFinite(seconds) && seconds >= 0 && seconds <= 86400
  const isVideo = (video: unknown): video is RoteiroVideoReference | null | undefined => video === undefined || video === null || Boolean(video && typeof video === 'object' && !Array.isArray(video)
    && isId((video as RoteiroVideoReference).id) && isText((video as RoteiroVideoReference).name, 255)
    && ({ mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', m4v: 'video/x-m4v' } as Record<string, string>)[(video as RoteiroVideoReference).extension] === (video as RoteiroVideoReference).mimeType
    && Number.isSafeInteger((video as RoteiroVideoReference).size) && (video as RoteiroVideoReference).size > 0 && (video as RoteiroVideoReference).size <= 5 * 1024 ** 3
    && Number.isSafeInteger((video as RoteiroVideoReference).durationFrames) && (video as RoteiroVideoReference).durationFrames > 0)
  const isContent = (content: unknown, characters: string[]): content is RoteiroSectionContent | undefined => content === undefined || Boolean(content && typeof content === 'object' && !Array.isArray(content)
    && isVideo((content as RoteiroSectionContent).video) && Array.isArray((content as RoteiroSectionContent).blocks) && (content as RoteiroSectionContent).blocks.length <= 200
    && ((content as RoteiroSectionContent).description === undefined || typeof (content as RoteiroSectionContent).description === 'string' && (content as RoteiroSectionContent).description!.length <= 20_000)
    && ((content as RoteiroSectionContent).additionalContext === undefined || typeof (content as RoteiroSectionContent).additionalContext === 'string' && (content as RoteiroSectionContent).additionalContext!.length <= 20_000)
    && ((content as RoteiroSectionContent).timeline === undefined || ['unspecified', 'past', 'present', 'future'].includes((content as RoteiroSectionContent).timeline!))
    && isOptionalSeconds((content as RoteiroSectionContent).sceneEndSeconds)
    && isOptionalSeconds((content as RoteiroSectionContent).firstGroupReactionSeconds)
    && isOptionalSeconds((content as RoteiroSectionContent).secondGroupReactionSeconds)
    && (content as RoteiroSectionContent).blocks.every((block: RoteiroReactionBlock) => Boolean(block && isId(block.id)
      && (block.characterId === '' || isId(block.characterId) && characters.includes(block.characterId))
      && (block.kind === 'fala' || block.kind === 'pensamento')
      && typeof block.expression === 'string' && block.expression.length <= 500
      && typeof block.textPortuguese === 'string' && block.textPortuguese.length <= 10000
      && typeof block.textEnglish === 'string' && block.textEnglish.length <= 10000)))
  return isId(roteiro.id) && isText(roteiro.title, 100) && isText(roteiro.videoTitle, 100)
    && Array.isArray(roteiro.characterIds) && roteiro.characterIds.length <= 500 && roteiro.characterIds.every(isId)
    && (roteiro.backgroundAssetId === undefined || roteiro.backgroundAssetId === null || isId(roteiro.backgroundAssetId))
    && (roteiro.uiGifAssetId === undefined || roteiro.uiGifAssetId === null || isId(roteiro.uiGifAssetId))
    && (roteiro.previewDetailsCollapsed === undefined || typeof roteiro.previewDetailsCollapsed === 'boolean')
    && Array.isArray(roteiro.tiktoks) && roteiro.tiktoks.length <= 500
    && isContent(roteiro.opening, roteiro.characterIds ?? [])
    && roteiro.tiktoks.every((item: RoteiroTikTok) => Boolean(item && isId(item.id) && isText(item.title, 100) && isText(item.videoTitle, 100)
      && isVideo(item.video) && isContent({ video: item.video ?? null, blocks: item.blocks ?? [], description: item.description, timeline: item.timeline, sceneEndSeconds: item.sceneEndSeconds, firstGroupReactionSeconds: item.firstGroupReactionSeconds, secondGroupReactionSeconds: item.secondGroupReactionSeconds, additionalContext: item.additionalContext }, roteiro.characterIds ?? [])))
}

/** Valida o lote atômico completo e protege IDs duplicados entre documentos. */
export function isRoteiroDocumentList(value: unknown): value is RoteiroDocument[] {
  return Array.isArray(value) && value.length <= 2000 && value.every(isRoteiroDocument)
    && new Set(value.map((roteiro) => roteiro.id)).size === value.length
    && new Set(value.flatMap((roteiro) => roteiro.tiktoks.map((tiktok) => tiktok.id))).size
      === value.reduce((total, roteiro) => total + roteiro.tiktoks.length, 0)
}


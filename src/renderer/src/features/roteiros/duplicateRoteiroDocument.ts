import type { RoteiroDocument, RoteiroReactionBlock, RoteiroSectionContent, RoteiroVideoReference } from '../../../../shared/roteiros'
import { emptyRoteiroContent } from './roteiroDefaults'

function duplicateVideoReference(reference: RoteiroVideoReference | null | undefined) {
  return reference ? { ...reference } : reference
}

function duplicateBlocks(blocks: RoteiroReactionBlock[] | undefined, createId: () => string) {
  return blocks?.map((block) => ({ ...block, id: createId() }))
}

function duplicateSection(section: RoteiroSectionContent, createId: () => string): RoteiroSectionContent {
  return {
    ...section,
    video: duplicateVideoReference(section.video) ?? null,
    blocks: duplicateBlocks(section.blocks, createId) ?? []
  }
}

/** Copies a script document while assigning new IDs to document-owned records and retaining live media references. */
export function duplicateRoteiroDocument(source: RoteiroDocument, createId: () => string): RoteiroDocument {
  return {
    ...source,
    id: createId(),
    title: `${source.title.slice(0, 92)} (cópia)`,
    characterIds: [...source.characterIds],
    opening: source.opening ? duplicateSection(source.opening, createId) : emptyRoteiroContent(),
    tiktoks: source.tiktoks.map((tiktok) => ({
      ...tiktok,
      id: createId(),
      video: duplicateVideoReference(tiktok.video),
      blocks: duplicateBlocks(tiktok.blocks, createId)
    }))
  }
}

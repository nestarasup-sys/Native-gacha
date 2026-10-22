/** Contratos de peças por painel: nomes esquerda/direita, seleção e miniaturas.
 * Os PNGs continuam fontes permanentes do Fabricador DEV; nenhuma escrita aqui.
 */
import type { FaceComponentAsset, WardrobeCategory, WardrobeSet, WardrobeSetSummary } from '../../../../shared/fabricator'
import type { CustomizerFaceAppearance, CustomizerWardrobeGroup, CustomizerWardrobePaletteKey } from '../../../../shared/customizer'
import type { ClothingGroupCategory } from '../../characters/characterRenderer'
import { loadCachedImage } from '../../characters/characterRenderer'
import { configureCharacterSampling } from './renderResolution'

export type WardrobePanel = { id: CustomizerWardrobePaletteKey; label: string; category: ClothingGroupCategory; side: 'left' | 'right' | null; source?: WardrobeCategory[] }
export const upperWardrobePanels: WardrobePanel[] = [
  { id: 'shirt', label: 'Camisa', category: 'camisa', side: null },
  { id: 'jacket', label: 'Jaqueta', category: 'jaqueta', side: null },
  { id: 'upper-left', label: 'Manga superior esquerda', category: 'manga-superior', side: 'left' },
  { id: 'upper-right', label: 'Manga superior direita', category: 'manga-superior', side: 'right' },
  { id: 'lower-left', label: 'Manga inferior esquerda', category: 'manga-inferior', side: 'left' },
  { id: 'lower-right', label: 'Manga inferior direita', category: 'manga-inferior', side: 'right' }
]
export const upperWardrobePageTwoPanels: WardrobePanel[] = [
  { id: 'gloves-left', label: 'Luvas esquerda', category: 'luvas', side: 'left' },
  { id: 'gloves-right', label: 'Luvas direita', category: 'luvas', side: 'right' },
  { id: 'cape', label: 'Capa', category: 'capa', side: null },
  { id: 'belt', label: 'Cinto', category: 'cinto', side: null },
  { id: 'skirt', label: 'Saia superior', category: 'saia-superior', side: null, source: ['saia'] }
]
export const accessoryWardrobePanels: WardrobePanel[] = [
  { id: 'glasses', label: 'Óculos', category: 'oculos', side: null },
  { id: 'head-accessory', label: 'Acessório de cabeça', category: 'acessorio-cabeca', side: null }
]
export const lowerWardrobePanels: WardrobePanel[] = [
  { id: 'pants-left', label: 'Calça', category: 'calca', side: null, source: ['calca-coxa', 'calca-canela'] },
  { id: 'shorts-right', label: 'Bermuda', category: 'calca', side: null, source: ['shorts'] },
  { id: 'sock-left', label: 'Esquerda Meia', category: 'meia', side: 'left' },
  { id: 'sock-right', label: 'Direita Meia', category: 'meia', side: 'right' },
  { id: 'shoe-left', label: 'Esquerda Sapato', category: 'sapato', side: 'left' },
  { id: 'shoe-right', label: 'Direita Sapato', category: 'sapato', side: 'right' }
]
export const lowerWardrobePageTwoPanels: WardrobePanel[] = [
  { id: 'lower-skirt', label: 'Saia inferior', category: 'saia-inferior', side: null, source: ['saia'] }
]
export function wardrobeComponentMatchesPanel(component: WardrobeSet['components'][number], panel: WardrobePanel): boolean {
  if (panel.source ? !panel.source.includes(component.category) : component.category !== panel.category) return false
  if (!panel.side) return true
  const sideHint = `${component.name} ${component.attachedPartId}`.toLocaleLowerCase()
  const left = /\besquerd[oa]\b|\bleft\b/.test(sideHint)
  const right = /\bdireit[oa]\b|\bright\b/.test(sideHint)
  return panel.side === 'left' ? left && !right : right && !left
}

export type WardrobePanelCandidate = { summary: WardrobeSetSummary; set: WardrobeSet; component: WardrobeSet['components'][number]; components: WardrobeSet['components']; headExtraAsset?: FaceComponentAsset }

export function isWardrobePanelCandidateSelected(candidate: WardrobePanelCandidate, panel: WardrobePanel, groups: CustomizerWardrobeGroup[], appearance?: CustomizerFaceAppearance): boolean {
  if (candidate.headExtraAsset) return appearance?.modelSlot === candidate.summary.modelSlot && appearance.headExtras?.glasses === candidate.headExtraAsset.id
  return candidate.components.every((component) => groups.some((group) => group.modelSlot === candidate.summary.modelSlot && group.setId === candidate.summary.id && group.category === panel.category && group.componentId === component.id))
}

async function renderWardrobeThumbnail(set: WardrobeSet, categories: WardrobeCategory[], componentIds?: string[], resolution = 112): Promise<string | null> {
  const allowedIds = componentIds ? new Set(componentIds) : null
  const pieces = set.components.filter((component) => categories.includes(component.category) && (!allowedIds || allowedIds.has(component.id)))
  if (!pieces.length) return null
  const left = Math.min(...pieces.map((piece) => piece.x))
  const top = Math.min(...pieces.map((piece) => piece.y))
  const right = Math.max(...pieces.map((piece) => piece.x + piece.width))
  const bottom = Math.max(...pieces.map((piece) => piece.y + piece.height))
  const scale = Math.min(resolution / Math.max(1, right - left), resolution / Math.max(1, bottom - top))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.ceil((right - left) * scale))
  canvas.height = Math.max(1, Math.ceil((bottom - top) * scale))
  const context = canvas.getContext('2d')
  if (context) configureCharacterSampling(context)
  if (!context) return null
  for (const piece of pieces) {
    try {
      const image = await loadCachedImage(piece.dataUrl)
      context.save()
      context.translate((piece.x - left + piece.width / 2) * scale, (piece.y - top + piece.height / 2) * scale)
      context.rotate(piece.rotation * Math.PI / 180)
      context.drawImage(image, -piece.width * scale / 2, -piece.height * scale / 2, piece.width * scale, piece.height * scale)
      context.restore()
    } catch { continue }
  }
  return canvas.toDataURL('image/png')
}


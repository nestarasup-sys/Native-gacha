import { clothingCategories } from '../../characters/characterRenderer'

export const customizerTopTabs: { id: string; label: string }[] = [
  { id: 'modelos', label: 'Modelos' },
  { id: 'corpo', label: 'Corpo' },
  { id: 'cabeca', label: 'Cabeça' },
  { id: 'roupas', label: 'Roupas' },
  { id: 'outros', label: 'Outros' },
  { id: 'perfil', label: 'Perfil' }
]

export const customizerModuleByTab: Record<string, string> = {
  modelos: 'Modelos', corpo: 'Modelos', cabeca: 'Cabeça', roupas: 'Roupas', outros: 'Acessórios', perfil: 'Perfil'
}
export const customizerModuleNames = [...new Set(Object.values(customizerModuleByTab))]

export const customizerHeadTabs = [
  { id: 'hair', label: 'Cabelo', icon: 'bow' },
  { id: 'eyes', label: 'Olhos', icon: 'face' },
  { id: 'face', label: 'Rosto', icon: 'face' },
  { id: 'extra', label: 'Extras', icon: 'sparkles' },
  { id: 'adjust', label: 'Ajustar', icon: 'sliders' }
] as const

export const customizerClothesTabs = [
  { id: 'hats', label: 'Chapéus', icon: 'sparkles' },
  { id: 'accessories', label: 'Acess.', icon: 'bow' },
  { id: 'upper', label: 'Superior', icon: 'shirt' },
  { id: 'lower', label: 'Inferior', icon: 'body' },
  { id: 'other', label: 'Outros', icon: 'flower' },
  { id: 'extra', label: 'Extra', icon: 'sparkles' },
  { id: 'adjust', label: 'Ajustar', icon: 'sliders' }
] as const

export function clothesAdjustmentDefinitions(tab: Exclude<(typeof customizerClothesTabs)[number]['id'], 'adjust'>) {
  if (tab === 'upper') return clothingCategories.Superior
  if (tab === 'lower') return clothingCategories.Inferior
  if (tab === 'accessories') return clothingCategories.Superior.filter((item) => item.id === 'oculos' || item.id === 'acessorio-cabeca')
  if (tab === 'other') return clothingCategories.Superior.filter((item) => item.id === 'luvas' || item.id === 'capa' || item.id === 'cinto' || item.id === 'saia-superior')
  return []
}

export function headAdjustmentItemsFor(tab: Exclude<(typeof customizerHeadTabs)[number]['id'], 'adjust'>) {
  const ids = tab === 'hair' ? new Set(['backHair', 'rearHair', 'ponytail', 'frontHair', 'ahoge'])
    : tab === 'eyes' ? new Set(['eye-left', 'eye-right', 'pupil-left', 'pupil-right', 'brow-left', 'brow-right', 'eye-highlight-left', 'eye-highlight-right'])
      : tab === 'face' ? new Set(['nose', 'mouth', 'blush', 'facial-shadow'])
        : new Set(['oculos', 'acessorio-cabeca'])
  return headAdjustmentItems.filter((item) => ids.has(item.id))
}

export const customizerOtherTabs = [
  { id: 'extra', label: 'Extra', icon: 'brush' },
  { id: 'extra2', label: 'Extra 2', icon: 'flower' },
  { id: 'hide', label: 'Ocultar', icon: 'eyeOff' },
  { id: 'text', label: 'Texto', icon: 'message' },
  { id: 'pets', label: 'Pets', icon: 'paw' },
  { id: 'objects', label: 'Objetos', icon: 'box' }
] as const

export const headAdjustmentItems = [
  { id: 'backHair', label: 'Cabelo traseiro', icon: 'bow' },
  { id: 'rearHair', label: 'Cabelo posterior', icon: 'bow' },
  { id: 'ponytail', label: 'Rabo de cavalo', icon: 'bow' },
  { id: 'frontHair', label: 'Cabelo frontal', icon: 'bow' },
  { id: 'ahoge', label: 'Ahoge', icon: 'bow' },
  { id: 'eye-left', label: 'Olho esquerdo', icon: 'face' },
  { id: 'eye-right', label: 'Olho direito', icon: 'face' },
  { id: 'pupil-left', label: 'Pupila esquerda', icon: 'eye' },
  { id: 'pupil-right', label: 'Pupila direita', icon: 'eye' },
  { id: 'brow-left', label: 'Sobrancelha esquerda', icon: 'face' },
  { id: 'brow-right', label: 'Sobrancelha direita', icon: 'face' },
  { id: 'nose', label: 'Nariz', icon: 'face' },
  { id: 'mouth', label: 'Boca', icon: 'message' },
  { id: 'eye-highlight-left', label: 'Brilho do olho esquerdo', icon: 'sparkles' },
  { id: 'eye-highlight-right', label: 'Brilho do olho direito', icon: 'sparkles' },
  { id: 'blush', label: 'Blush', icon: 'flower' },
  { id: 'facial-shadow', label: 'Sombra facial', icon: 'brush' },
  { id: 'oculos', label: 'Óculos', icon: 'eye' },
  { id: 'acessorio-cabeca', label: 'Acessório de cabeça', icon: 'sparkles' }
] as const

export function CustomizerCategoryIcon({ category }: { category: string }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  return <svg viewBox="0 0 48 48" aria-hidden="true" {...common}>
    {category === 'modelos' && <>
      <rect x="13" y="8" width="27" height="32" rx="5" opacity=".65" />
      <rect x="7" y="12" width="27" height="32" rx="5" />
      <circle cx="20.5" cy="23" r="5" />
      <path d="M12.5 37c1.3-4.2 4.1-6.4 8-6.4s6.7 2.2 8 6.4" />
    </>}
    {category === 'corpo' && <>
      <circle cx="24" cy="9.5" r="5.5" />
      <path d="M17 18h14l4 10-5 3-2-4v15H20V27l-2 4-5-3 4-10Z" />
      <path d="m20 31-4 11m12-11 4 11M20 21l4 5 4-5" />
    </>}
    {category === 'cabeca' && <>
      <path d="M12 22c0-10 5-16 13-16 8.5 0 13 6.3 13 16v5c0 2.1-1.7 3.8-3.8 3.8-.7 4.7-4.8 8.2-9.2 8.2s-8.5-3.5-9.2-8.2A3.8 3.8 0 0 1 12 27v-5Z" />
      <path d="M12 22c.8-6 4.2-9 8-10 .4 3 2.4 4.8 5.5 5.4 2.7.5 5.3 2.1 7.2 4.6M19.5 27h.1m9-.1h.1M21 33c1.8 1.3 4.2 1.3 6 0" />
    </>}
    {category === 'roupas' && <>
      <path d="m17 9 7 3 7-3 10 7-5 9-5-2v18H17V23l-5 2-5-9 10-7Z" />
      <path d="m17 9 7 8 7-8M24 17v24" />
    </>}
    {category === 'outros' && <>
      <path d="m24 5 3.1 10.2L37 18.5l-9.9 3.2L24 32l-3.1-10.3-9.9-3.2 9.9-3.3L24 5Z" />
      <path d="m37 29 1.8 5.2L44 36l-5.2 1.8L37 43l-1.8-5.2L30 36l5.2-1.8L37 29ZM10 6l1.5 4.5L16 12l-4.5 1.5L10 18l-1.5-4.5L4 12l4.5-1.5L10 6Z" />
    </>}
    {category === 'perfil' && <>
      <rect x="7" y="6" width="34" height="36" rx="4" />
      <circle cx="18" cy="19" r="5" />
      <path d="M10.5 33c1.2-4 3.7-6 7.5-6s6.3 2 7.5 6M29 17h7m-7 6h7m-7 7h7m-18 8h18" />
    </>}
  </svg>
}

import type { WardrobeSet } from '../../../../../shared/fabricator'

export type WardrobePairedSheetKind = 'sleeves' | 'pants' | 'shoes'

const PAIRED_GRID_IMPORT_KINDS = new Set([
  'sleeve-grid-3x4',
  'pants-grid-3x4',
  'shoe-grid-3x4'
])

export function wardrobePairedGridImportKind(kind: WardrobePairedSheetKind): NonNullable<WardrobeSet['importKind']> {
  if (kind === 'pants') return 'pants-grid-3x4'
  if (kind === 'shoes') return 'shoe-grid-3x4'
  return 'sleeve-grid-3x4'
}

export function isWardrobePairedGridImportKind(importKind: string | undefined): boolean {
  return PAIRED_GRID_IMPORT_KINDS.has(importKind ?? '')
}

export function wardrobePairImageMode(importKind: WardrobeSet['importKind'], category?: string): 'copy' | 'mirror' {
  return importKind === 'shoe-grid-3x4' || category === 'sapato' ? 'copy' : 'mirror'
}

import type { CharacterColorOverrides, HairColorOverrides } from '../../../shared/customizer'
import type { FabricatorAssetColorMode } from '../../../shared/fabricator'
import type { HairTintOptions } from './characterImageTint'

/** Keeps records without an explicit mode on the same renderer they used before. */
export function effectiveAssetColorMode(
  mode: FabricatorAssetColorMode | undefined,
  legacyDefault: FabricatorAssetColorMode
): FabricatorAssetColorMode {
  return mode ?? legacyDefault
}

/**
 * The image-derived recolorer uses the older five role names. The Customizer's
 * newer clothes/hair controls use the equivalent fixed-palette names.
 */
export function toAssetColorOverrides(colors?: CharacterColorOverrides): HairColorOverrides | undefined {
  if (!colors) return undefined
  const current = colors as Partial<Record<'outline' | 'shadow' | 'base' | 'light' | 'detail', string>>
  const legacy = colors as HairColorOverrides
  const mapped: HairColorOverrides = {}
  const assign = (role: keyof HairColorOverrides, value: string | undefined) => { if (value) mapped[role] = value }
  assign('outline', current.outline ?? legacy.outline)
  assign('fade', legacy.fade ?? current.shadow)
  assign('base', current.base ?? legacy.base)
  assign('highlight', legacy.highlight ?? current.light)
  assign('accent', legacy.accent ?? current.detail)
  return Object.values(mapped).some(Boolean) ? mapped : undefined
}

export function loadAssetColorModeImage<T>(
  source: string,
  colors: CharacterColorOverrides | undefined,
  mode: FabricatorAssetColorMode | undefined,
  legacyDefault: FabricatorAssetColorMode,
  loaders: {
    fixedPalette: (source: string, colors: CharacterColorOverrides | undefined, options?: HairTintOptions) => Promise<T>
    assetColors: (source: string, colors: HairColorOverrides | undefined, options?: HairTintOptions) => Promise<T>
  },
  options?: HairTintOptions
): Promise<T> {
  return effectiveAssetColorMode(mode, legacyDefault) === 'fixed-palette'
    ? loaders.fixedPalette(source, colors, options)
    : loaders.assetColors(source, toAssetColorOverrides(colors), options)
}

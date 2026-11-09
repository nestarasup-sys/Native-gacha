import type { FabricatorAssetColorMode } from '../../../../shared/fabricator'

export function AssetColorModeToggle({ value, disabled = false, onChange }: {
  value: FabricatorAssetColorMode
  disabled?: boolean
  onChange: (mode: FabricatorAssetColorMode) => void
}) {
  return <div className="fabricator-color-mode" role="group" aria-label="Modo de paleta">
    <button type="button" disabled={disabled} aria-pressed={value === 'fixed-palette'} className={value === 'fixed-palette' ? 'selected' : ''} onClick={() => onChange('fixed-palette')}>Paleta fixa</button>
    <button type="button" disabled={disabled} aria-pressed={value === 'asset-colors'} className={value === 'asset-colors' ? 'selected' : ''} onClick={() => onChange('asset-colors')}>Cores do asset</button>
  </div>
}

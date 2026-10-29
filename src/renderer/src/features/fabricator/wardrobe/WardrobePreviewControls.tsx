import { Icon } from '../../../ui/components/Icon'

type WardrobePreviewToolbarProps = {
  showToolbar: boolean
  body: {
    moving: boolean
    disabled: boolean
    canReset: boolean
    onToggleMove: () => void
    onReset: () => void
  }
  deformation: {
    active: boolean
    disabled: boolean
    canRestore: boolean
    onToggle: () => void
    onRestore: () => void
  }
  magnet: {
    enabled: boolean
    disabled: boolean
    onToggle: () => void
  }
  viewport: {
    canCenter: boolean
    onCenter: () => void
  }
  background: {
    color: string
    onChange: (color: string) => void
  }
}

type WardrobeDeformationBrushControlsProps = {
  active: boolean
  ready: boolean
  radius: number
  strength: number
  onRadiusChange: (value: number) => void
  onStrengthChange: (value: number) => void
}

export function WardrobePreviewToolbar({ showToolbar, body, deformation, magnet, viewport, background }: WardrobePreviewToolbarProps) {
  if (!showToolbar) return null
  return <div className="wardrobe-preview-controls">
    <button className={`pose-button wardrobe-control-move ${body.moving ? 'primary' : 'secondary'}`} disabled={body.disabled} aria-label="Mover corpo" title="Mover o corpo para conferir o encaixe" aria-pressed={body.moving} onClick={body.onToggleMove} type="button"><Icon name="move" /><span className="wardrobe-control-label-wide">Mover corpo</span><span className="wardrobe-control-label-compact">Mover</span></button>
    <button className={`pose-button wardrobe-control-deform ${deformation.active ? 'primary' : 'secondary'}`} disabled={deformation.disabled} aria-pressed={deformation.active} title="Arraste sobre a roupa selecionada para deformar somente aquela região" onClick={deformation.onToggle} type="button"><span className="wardrobe-control-label-wide">{deformation.active ? 'Concluir deformação' : '〰 Deformar'}</span><span className="wardrobe-control-label-compact">{deformation.active ? 'Concluir' : '〰 Deformar'}</span></button>
    <button className="pose-button secondary wardrobe-deformation-restore" type="button" aria-label="Restaurar deformação" disabled={!deformation.canRestore} title="Restaurar deformação e devolver a peça à forma anterior" onClick={deformation.onRestore}><Icon name="undo" /><span>Restaurar</span></button>
    <button className="pose-button secondary wardrobe-control-reset" aria-label="Repor corpo" disabled={!body.canReset || deformation.active} onClick={body.onReset} title="Repor corpo" type="button"><Icon name="reset" /><span>Repor</span></button>
    <button className={`pose-button wardrobe-control-magnet ${magnet.enabled ? 'primary' : 'secondary'}`} disabled={magnet.disabled} type="button" aria-label={magnet.enabled ? 'Ímã ligado' : 'Ímã desligado'} aria-pressed={magnet.enabled} title={`Ímã ${magnet.enabled ? 'ligado' : 'desligado'}: aproxima bordas e centros durante o arraste`} onClick={magnet.onToggle}><span className="wardrobe-control-label-wide">{magnet.enabled ? 'Ímã ligado' : 'Ímã desligado'}</span><span className="wardrobe-control-label-compact">Ímã {magnet.enabled ? '✓' : '×'}</span></button>
    <button className="pose-button secondary wardrobe-control-center" aria-label="Centralizar prévia" disabled={!viewport.canCenter || deformation.active} onClick={viewport.onCenter} title="Centralizar prévia" type="button"><Icon name="frame" /><span>Centralizar</span></button>
    <label className="preview-background-picker" title="Mudar a cor do fundo em Modelos, Poses, Rosto e Roupas"><span>Fundo</span><input type="color" aria-label="Cor do fundo das prévias" value={background.color} onChange={(event) => background.onChange(event.target.value)} /><code>{background.color.toUpperCase()}</code></label>
  </div>
}

export function WardrobeDeformationBrushControls({ active, ready, radius, strength, onRadiusChange, onStrengthChange }: WardrobeDeformationBrushControlsProps) {
  if (!active) return null
  return <div className="wardrobe-warp-controls" aria-label="Configurações do pincel de deformação" onPointerDown={(event) => event.stopPropagation()}>
    <label><span>Raio <output>{radius}px</output></span><input aria-label="Raio do pincel de deformação" type="range" min="12" max="280" step="1" value={radius} onChange={(event) => onRadiusChange(Number(event.target.value))} /></label>
    <label><span>Força <output>{strength}%</output></span><input aria-label="Força do pincel de deformação" type="range" min="10" max="100" step="1" value={strength} onChange={(event) => onStrengthChange(Number(event.target.value))} /></label>
    <small>{ready ? 'Arraste para deformar; salve o conjunto para aplicar no Customizador.' : 'Preparando a imagem da peça…'}</small>
  </div>
}

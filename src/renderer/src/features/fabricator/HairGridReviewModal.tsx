import type { HairWorkspace } from '../../../../shared/fabricator'
import { getHairThreeStyleRegions, type HairGridSplits } from './hairGridLayout'
import { useState, type CSSProperties } from 'react'

type HairAsset = NonNullable<HairWorkspace['front']>
type StylePreview = { front: HairAsset; back: HairAsset; rowBoundary: number[] }

type Props = {
  sourceImageDataUrl: string
  styles: StylePreview[]
  paddingPercent: number
  splits: HairGridSplits
  busy: boolean
  saving: boolean
  error?: string
  onPaddingChange: (value: number) => void
  onSplitsChange: (value: HairGridSplits) => void
  onCancel: () => void
  onSave: () => void
}

export function HairGridReviewModal({ sourceImageDataUrl, styles, paddingPercent, splits, busy, saving, error, onPaddingChange, onSplitsChange, onCancel, onSave }: Props) {
  const [sourceSize, setSourceSize] = useState<{ width: number; height: number } | null>(null)
  const adjustSplit = (key: keyof HairGridSplits, value: number) => onSplitsChange({ ...splits, [key]: value })
  const sourceAspectRatio = sourceSize ? sourceSize.width / sourceSize.height : 1
  const guideStyle = {
    '--hair-grid-col-one': `${splits.firstColumnPercent}%`,
    '--hair-grid-col-two': `${splits.secondColumnPercent}%`,
    aspectRatio: sourceSize ? `${sourceSize.width} / ${sourceSize.height}` : undefined,
    minHeight: sourceSize ? 0 : 120,
    width: sourceSize ? `min(100%, ${sourceAspectRatio * 42}vh)` : '100%'
  } as CSSProperties
  const sourceRegions = sourceSize ? getHairThreeStyleRegions(sourceSize.width, sourceSize.height, splits) : []
  const splitRow = sourceSize ? Math.floor(sourceSize.height * splits.posteriorRowPercent / 100) : 0
  return <div className="pose-modal-backdrop hair-grid-review-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onCancel() }}>
    <section className="pose-model-picker hair-grid-review-modal" role="dialog" aria-modal="true" aria-labelledby="hair-grid-review-title">
      <header><span><small>IMPORTAÇÃO DE TRÊS CABELOS</small><strong id="hair-grid-review-title">Confira os recortes</strong></span><button onClick={onCancel} aria-label="Fechar" disabled={saving} type="button">×</button></header>
      <p>As divisões das colunas procuram os espaços entre os cabelos. Dentro de cada coluna, o corte horizontal acompanha os fios e procura uma passagem com pouca opacidade perto da altura escolhida. Posterior fica em cima e traseiro embaixo.</p>
      <div className="hair-grid-review-content">
        <section className="hair-grid-original-panel" aria-label="Folha original com guias de corte">
          <h3>Folha original · 3 colunas × 2 fileiras</h3>
          <div className="hair-grid-original-image" style={guideStyle}><img src={sourceImageDataUrl} alt="Folha original dos três cabelos" onLoad={(event) => setSourceSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })} />
            <i className="hair-grid-guide hair-grid-guide-column-one" /><i className="hair-grid-guide hair-grid-guide-column-two" />
            {sourceSize && <svg className="hair-grid-guide-seams" viewBox={`0 0 ${sourceSize.width} ${sourceSize.height}`} preserveAspectRatio="none" aria-hidden="true">
              <line className="hair-grid-guide-row" x1="0" y1={splitRow} x2={sourceSize.width} y2={splitRow} />
              {styles.map((style, index) => {
                const region = sourceRegions[index]?.source
                if (!region || style.rowBoundary.length !== region.width) return null
                const points = style.rowBoundary.map((row, x) => `${region.x + x + .5},${row}`).join(' ')
                return <g key={index}><polyline className="hair-grid-seam-shadow" points={points} /><polyline className="hair-grid-seam" points={points} /></g>
              })}
            </svg>}
          </div>
          <small>A linha tracejada indica a altura escolhida; a linha rosa mostra o caminho do corte em cada coluna. A transparência e as bordas dos fios são preservadas.</small>
        </section>
        <section className="hair-grid-crop-panel" aria-label="Seis partes recortadas">
          <h3>Prévia dos seis recortes</h3>
          <div className="hair-grid-crop-columns">
            {styles.map((style, index) => <div className="hair-grid-crop-column" key={index}>
              <figure><figcaption>Conjunto {index + 1} · Posterior</figcaption><span><img src={style.front.dataUrl} alt={`Posterior do conjunto ${index + 1}`} /></span></figure>
              <figure><figcaption>Conjunto {index + 1} · Traseiro</figcaption><span><img src={style.back.dataUrl} alt={`Traseiro do conjunto ${index + 1}`} /></span></figure>
            </div>)}
          </div>
        </section>
      </div>
      <section className="hair-grid-adjustments" aria-label="Ajustes das linhas de corte">
        <label className="hair-grid-adjust-control"><span><b>Divisão 1ª coluna</b><output>{splits.firstColumnPercent.toFixed(1)}%</output></span>
          <input type="range" min="10" max={Math.min(80, splits.secondColumnPercent - 10)} step="0.1" value={splits.firstColumnPercent} disabled={busy || saving} onChange={(event) => adjustSplit('firstColumnPercent', Number(event.target.value))} />
          <small>Reposicione a linha entre o primeiro e o segundo cabelo.</small>
        </label>
        <label className="hair-grid-adjust-control"><span><b>Divisão 2ª coluna</b><output>{splits.secondColumnPercent.toFixed(1)}%</output></span>
          <input type="range" min={Math.max(20, splits.firstColumnPercent + 10)} max="90" step="0.1" value={splits.secondColumnPercent} disabled={busy || saving} onChange={(event) => adjustSplit('secondColumnPercent', Number(event.target.value))} />
          <small>Reposicione a linha entre o segundo e o terceiro cabelo.</small>
        </label>
        <label className="hair-grid-adjust-control"><span><b>Altura de referência</b><output>{splits.posteriorRowPercent.toFixed(1)}%</output></span>
          <input type="range" min="10" max="90" step="0.1" value={splits.posteriorRowPercent} disabled={busy || saving} onChange={(event) => adjustSplit('posteriorRowPercent', Number(event.target.value))} />
          <small>O corte desvia dos fios a partir desta altura.</small>
        </label>
        <label className="hair-grid-adjust-control"><span><b>Margem transparente</b><output>{paddingPercent}%</output></span>
          <input type="range" min="0" max="12" step="1" value={paddingPercent} disabled={busy || saving} onChange={(event) => onPaddingChange(Number(event.target.value))} />
          <small>Ignora ruído isolado e mantém folga nos fios. Todas as mudanças atualizam as prévias.</small>
        </label>
      </section>
      {busy && <div className="hair-grid-review-status" role="status">Recalculando os seis recortes…</div>}
      {error && <div className="hair-grid-review-error" role="alert">{error}</div>}
      <footer className="hair-grid-review-footer"><button className="pose-button secondary" disabled={saving} onClick={onCancel} type="button">Cancelar</button><button className="pose-button primary" disabled={busy || saving || styles.length !== 3 || Boolean(error)} onClick={onSave} type="button">{saving ? 'Salvando…' : 'Salvar os 3 conjuntos'}</button></footer>
    </section>
  </div>
}

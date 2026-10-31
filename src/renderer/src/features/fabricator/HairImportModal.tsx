import { Icon } from '../../ui/components/Icon'

type Props = {
  disabled?: boolean
  onClose: () => void
  onImportSingle: () => void
  onImportPairSheet: () => void
  onImportThreeStyleGrid: () => void
}

export function HairImportModal({ disabled = false, onClose, onImportSingle, onImportPairSheet, onImportThreeStyleGrid }: Props) {
  return <div className="pose-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="pose-model-picker hair-dev-import-modal" role="dialog" aria-modal="true" aria-labelledby="hair-dev-import-title">
      <header><span><small>CABELOS DEV</small><strong id="hair-dev-import-title">Como deseja importar?</strong></span><button onClick={onClose} aria-label="Fechar" type="button">×</button></header>
      <p>Escolha uma peça, um conjunto com duas partes ou uma folha com três conjuntos.</p>
      <div className="pose-model-options">
        <button className="pose-model-option" disabled={disabled} onClick={onImportSingle} type="button">
          <span className="pose-model-number"><Icon name="plus" /></span>
          <span><b>Importar uma peça</b><small>Adiciona a imagem à categoria de cabelo selecionada.</small></span>
          <Icon name="chevronRight" />
        </button>
        <button className="pose-model-option" disabled={disabled} onClick={onImportPairSheet} type="button">
          <span className="pose-model-number">1</span>
          <span><b>Importar um conjunto</b><small>Uma folha: posterior na metade de cima e traseiro na metade de baixo.</small></span>
          <Icon name="chevronRight" />
        </button>
        <button className="pose-model-option" disabled={disabled} onClick={onImportThreeStyleGrid} type="button">
          <span className="pose-model-number">3</span>
          <span><b>Importar 3 conjuntos</b><small>Três colunas, um cabelo por coluna. Em cada coluna: posterior em cima e traseiro embaixo.</small></span>
          <Icon name="chevronRight" />
        </button>
      </div>
    </section>
  </div>
}

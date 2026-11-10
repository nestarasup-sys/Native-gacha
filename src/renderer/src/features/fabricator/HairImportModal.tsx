import { Icon } from '../../ui/components/Icon'
import { useState } from 'react'
import type { CharacterGender } from '../../../../shared/customizer'

type Props = {
  initialGender: CharacterGender
  disabled?: boolean
  onClose: () => void
  onImportSingle: (gender: CharacterGender) => void
  onImportPairSheet: (gender: CharacterGender) => void
  onImportThreeStyleGrid: (gender: CharacterGender) => void
}

export function HairImportModal({ initialGender, disabled = false, onClose, onImportSingle, onImportPairSheet, onImportThreeStyleGrid }: Props) {
  const [gender, setGender] = useState<CharacterGender>(initialGender)

  return <div className="pose-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="pose-model-picker hair-dev-import-modal" role="dialog" aria-modal="true" aria-labelledby="hair-dev-import-title">
      <header><span><small>CABELOS DEV</small><strong id="hair-dev-import-title">Como deseja importar?</strong></span><button onClick={onClose} aria-label="Fechar" type="button">×</button></header>
      <p>Escolha uma peça, um conjunto com duas partes ou uma folha com três conjuntos.</p>
      <div className="hair-dev-import-gender" role="group" aria-label="Gênero do conjunto importado">
        <span>Gênero do conjunto</span>
        <div className="hair-dev-import-gender-options">
          <button className={`hair-dev-gender-toggle female${gender === 'female' ? ' active' : ''}`} type="button" aria-pressed={gender === 'female'} onClick={() => setGender('female')}>Feminino</button>
          <button className={`hair-dev-gender-toggle male${gender === 'male' ? ' active' : ''}`} type="button" aria-pressed={gender === 'male'} onClick={() => setGender('male')}>Masculino</button>
        </div>
      </div>
      <div className="pose-model-options">
        <button className="pose-model-option" disabled={disabled} onClick={() => onImportSingle(gender)} type="button">
          <span className="pose-model-number"><Icon name="plus" /></span>
          <span><b>Importar uma peça</b><small>Adiciona a imagem à categoria de cabelo selecionada.</small></span>
          <Icon name="chevronRight" />
        </button>
        <button className="pose-model-option" disabled={disabled} onClick={() => onImportPairSheet(gender)} type="button">
          <span className="pose-model-number">1</span>
          <span><b>Importar um conjunto</b><small>Uma folha: posterior na metade de cima e traseiro na metade de baixo.</small></span>
          <Icon name="chevronRight" />
        </button>
        <button className="pose-model-option" disabled={disabled} onClick={() => onImportThreeStyleGrid(gender)} type="button">
          <span className="pose-model-number">3</span>
          <span><b>Importar 3 conjuntos</b><small>Três colunas, um cabelo por coluna. Em cada coluna: posterior em cima e traseiro embaixo.</small></span>
          <Icon name="chevronRight" />
        </button>
      </div>
    </section>
  </div>
}

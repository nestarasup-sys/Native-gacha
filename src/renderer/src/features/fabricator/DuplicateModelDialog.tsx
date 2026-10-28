import { Icon } from '../../ui/components/Icon'

type DuplicateModelDialogProps = {
  modelName: string
  sourceSlot: number
  destinationSlots: number[]
  targetSlot: number | null
  busy: boolean
  error: string
  onSelectSlot: (slot: number) => void
  onCancel: () => void
  onDuplicate: () => void
}

export function DuplicateModelDialog({
  modelName,
  sourceSlot,
  destinationSlots,
  targetSlot,
  busy,
  error,
  onSelectSlot,
  onCancel,
  onDuplicate
}: DuplicateModelDialogProps) {
  const canDuplicate = targetSlot !== null && destinationSlots.includes(targetSlot)

  return (
    <div className="pose-modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !busy) onCancel()
    }}>
      <section
        className="pose-model-picker fabricator-duplicate-picker"
        role="dialog"
        aria-modal="true"
        aria-labelledby="fabricator-duplicate-title"
      >
        <header>
          <span>
            <small>BIBLIOTECA DE MODELOS</small>
            <strong id="fabricator-duplicate-title">Duplicar “{modelName}”</strong>
          </span>
          <button onClick={onCancel} disabled={busy} aria-label="Fechar" type="button">×</button>
        </header>
        <p>
          Escolha um slot vazio. A cópia inclui as peças, cores, juntas e configurações;
          o modelo original continua no slot {String(sourceSlot).padStart(2, '0')}.
        </p>
        <div className="pose-model-options">
          {destinationSlots.map((slot) => (
            <button
              key={slot}
              className={`pose-model-option fabricator-duplicate-option${targetSlot === slot ? ' selected' : ''}`}
              aria-pressed={targetSlot === slot}
              disabled={busy}
              onClick={() => onSelectSlot(slot)}
              type="button"
            >
              <span className="pose-model-number">{String(slot).padStart(2, '0')}</span>
              <span>
                <b>Slot {String(slot).padStart(2, '0')}</b>
                <small>Vazio · pronto para receber a cópia</small>
              </span>
              {targetSlot === slot && <Icon name="check" />}
            </button>
          ))}
          {destinationSlots.length === 0 && (
            <div className="pose-model-none">Não há slots vazios para receber a cópia. Libere um slot e tente novamente.</div>
          )}
        </div>
        {error && <p className="fabricator-duplicate-error" role="alert">{error}</p>}
        <footer className="fabricator-duplicate-footer">
          <button className="pose-button secondary" onClick={onCancel} disabled={busy} type="button">Cancelar</button>
          <button className="pose-button primary" onClick={onDuplicate} disabled={busy || !canDuplicate} type="button">
            <Icon name="box" />
            {busy ? 'Duplicando…' : `Duplicar para slot ${targetSlot ? String(targetSlot).padStart(2, '0') : '—'}`}
          </button>
        </footer>
      </section>
    </div>
  )
}

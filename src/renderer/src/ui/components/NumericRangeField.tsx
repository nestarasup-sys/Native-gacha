import { useEffect, useState } from 'react'

type NumericRangeFieldProps = {
  label: string
  value: number
  onChange: (value: number, record?: boolean) => void
  onStart: () => void
  onFinish?: () => void
  disabled: boolean
  min: number
  max: number
  suffix: string
}

export function NumericRangeField({ label, value, onChange, onStart, onFinish, disabled, min, max, suffix }: NumericRangeFieldProps) {
  const format = (number: number) => String(Number(number.toFixed(1)))
  const [draft, setDraft] = useState(() => format(value))

  useEffect(() => { setDraft(format(value)) }, [value])

  const commit = () => {
    const parsed = Number(draft)
    if (!draft.trim() || !Number.isFinite(parsed)) {
      setDraft(format(value))
      return
    }
    const next = Math.min(max, Math.max(min, parsed))
    setDraft(format(next))
    if (next !== value) { onStart(); onChange(next, false); onFinish?.() }
  }

  return <div className="numeric-range-field">
    <span>{label}</span>
    <input
      type="number"
      inputMode="decimal"
      value={draft}
      min={min}
      max={max}
      step="0.1"
      disabled={disabled}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') { event.preventDefault(); commit() }
        if (event.key === 'Escape') { setDraft(format(value)) }
      }}
      aria-label={label}
    />
    <small>{suffix}</small>
    <input
      className="numeric-range-field__range"
      type="range"
      min={min}
      max={max}
      step="0.1"
      value={Math.min(max, Math.max(min, value))}
      disabled={disabled}
      onPointerDown={onStart}
      onPointerUp={() => onFinish?.()}
      onPointerCancel={() => onFinish?.()}
      onKeyDown={(event) => { if (event.key.startsWith('Arrow') || event.key === 'Home' || event.key === 'End') onStart() }}
      onKeyUp={() => onFinish?.()}
      onChange={(event) => { const next = Number(event.target.value); setDraft(format(next)); onChange(next, false) }}
      aria-label={`${label} pela barra`}
    />
  </div>
}

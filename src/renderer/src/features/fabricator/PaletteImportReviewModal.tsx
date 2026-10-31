import { useEffect, useMemo, useRef, useState } from 'react'
import { PALETTES, type PaletteAssetKind, type PaletteNormalizationReport, type PaletteOverrides, type PaletteRole } from './paletteNormalizer'
import './palette-import.css'

interface WorkerResponse {
  id: number
  type: 'complete' | 'error'
  blob?: Blob
  report?: PaletteNormalizationReport
  message?: string
}

interface Props {
  file: File
  kind: PaletteAssetKind
  onCancel: () => void
  onConfirm: (dataUrl: string | null) => void
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Não foi possível preparar a imagem normalizada.'))
    reader.onerror = () => reject(reader.error ?? new Error('Não foi possível preparar a imagem normalizada.'))
    reader.readAsDataURL(blob)
  })
}

function paletteTitle(kind: PaletteAssetKind): string {
  return kind === 'wardrobe' ? 'Roupas DEV · paleta de cinco cores' : 'Cabelos DEV · paleta de quatro cores'
}

export function PaletteImportReviewModal({ file, kind, onCancel, onConfirm }: Props) {
  const [enabled, setEnabled] = useState(true)
  const [overrides, setOverrides] = useState<PaletteOverrides>({})
  const [sensitivity, setSensitivity] = useState(55)
  const [report, setReport] = useState<PaletteNormalizationReport | null>(null)
  const [normalizedUrl, setNormalizedUrl] = useState('')
  const [originalUrl, setOriginalUrl] = useState('')
  const [processing, setProcessing] = useState(true)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState('')
  const [showOriginal, setShowOriginal] = useState(true)
  const requestRef = useRef(0)
  const palette = PALETTES[kind]
  const titleId = `palette-import-title-${kind}`

  useEffect(() => {
    const url = URL.createObjectURL(file)
    setOriginalUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  useEffect(() => {
    const id = ++requestRef.current
    const worker = new Worker(new URL('./paletteNormalizer.worker.ts', import.meta.url), { type: 'module' })
    setProcessing(true)
    setError('')
    worker.onmessage = ({ data }: MessageEvent<WorkerResponse>) => {
      if (id !== requestRef.current) return
      if (data.type === 'error' || !data.blob || !data.report) {
        setError(data.message ?? 'Não foi possível normalizar a paleta.')
        setProcessing(false)
        worker.terminate()
        return
      }
      setReport(data.report)
      setNormalizedUrl((current) => { if (current) URL.revokeObjectURL(current); return URL.createObjectURL(data.blob!) })
      setProcessing(false)
      worker.terminate()
    }
    worker.onerror = () => {
      if (id === requestRef.current) { setError('Falha ao processar a imagem localmente.'); setProcessing(false) }
      worker.terminate()
    }
    const timer = window.setTimeout(() => worker.postMessage({ id, file, kind, overrides, sensitivity }), 120)
    return () => { requestRef.current += 1; window.clearTimeout(timer); worker.terminate() }
  }, [file, kind, overrides, sensitivity])

  useEffect(() => () => { if (normalizedUrl) URL.revokeObjectURL(normalizedUrl) }, [normalizedUrl])

  const activeGroups = useMemo(() => report?.groups ?? [], [report])
  const changeRole = (key: string, value: string) => {
    const role = value as PaletteRole
    setOverrides((current) => {
      const next = { ...current }
      if (!value) delete next[key]
      else next[key] = role
      return next
    })
  }

  const confirm = async () => {
    if (processing || confirming || (enabled && !normalizedUrl)) return
    setConfirming(true)
    setError('')
    try {
      const dataUrl = enabled
        ? await blobToDataUrl(await (await fetch(normalizedUrl)).blob())
        : await blobToDataUrl(file)
      onConfirm(dataUrl)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível preparar esta imagem para importar.')
      setConfirming(false)
    }
  }

  const number = (value: number) => value.toLocaleString('pt-BR')
  return <div className="pose-modal-backdrop palette-import-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !confirming) onCancel() }}>
    <section className="pose-model-picker palette-import-modal" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <header><span><small>REVISÃO ANTES DE IMPORTAR</small><strong id={titleId}>{paletteTitle(kind)}</strong></span><button onClick={onCancel} disabled={confirming} aria-label="Fechar" type="button">×</button></header>
      <label className="palette-import-enabled"><input type="checkbox" checked={enabled} disabled={confirming} onChange={(event) => setEnabled(event.target.checked)} /><span><b>Normalização automática de paleta</b><small>Ligada por padrão. A imagem original no disco não é alterada.</small></span></label>
      <div className="palette-import-preview-head"><strong>Comparação da imagem</strong><button type="button" className="pose-button secondary" onClick={() => setShowOriginal((value) => !value)}>{showOriginal ? 'Ocultar original' : 'Mostrar original'}</button></div>
      <div className={`palette-import-previews${showOriginal ? '' : ' single'}`}>
        {showOriginal && <figure><figcaption>Original</figcaption><div><img src={originalUrl} alt="Imagem original selecionada" /></div></figure>}
        <figure><figcaption>Normalizada {processing ? '· processando…' : enabled ? '· será importada' : '· prévia'}</figcaption><div>{normalizedUrl ? <img src={normalizedUrl} alt="Prévia com a paleta padronizada" /> : <span>{processing ? 'Analisando cores…' : 'Prévia indisponível'}</span>}</div></figure>
      </div>
      <div className="palette-import-swatches" aria-label="Cores oficiais">
        {palette.map((entry) => <span key={entry.role}><i style={{ background: entry.hex }} />{entry.label}<code>{entry.hex}</code></span>)}
      </div>
      <label className="palette-import-sensitivity"><span><b>Sensibilidade de cor e chroma</b><output>{sensitivity}%</output></span><input type="range" min="0" max="100" step="1" value={sensitivity} disabled={processing || confirming} onChange={(event) => setSensitivity(Number(event.target.value))} /><small>{kind === 'wardrobe' ? 'Ajusta a detecção de tons ciano e roxos e do fundo verde.' : 'Ajusta os limites entre sombra, base e luz e a remoção do fundo verde.'}</small></label>
      {report && <div className="palette-import-report">
        <p>{report.width} × {report.height} px · {number(report.visiblePixels)} pixels visíveis{report.chromaKeyDetected ? ` · chroma verde detectado; ${number(report.chromaRemovedPixels)} pixels removidos ou despigmentados` : ' · fundo verde de borda não detectado'}</p>
        {report.chromaKeyDetected && <p className="palette-import-warning" role="status">{report.chromaRemovedPixels > 0 ? 'Confira a prévia: tons de verde foram tratados como fundo, inclusive aberturas internas. Se algum verde for parte do desenho, associe o grupo à cor correta abaixo.' : report.groups.some((group) => group.chroma === 'preserved') ? 'O verde foi detectado, mas as associações manuais o mantiveram como parte do desenho.' : 'O chroma verde foi detectado, mas os pixels não foram separados com segurança e foram mantidos. Revise a amostra e ajuste a cor abaixo se necessário.'}</p>}
        {report.uncertainPixels > 0 && <p className="palette-import-warning" role="status">{number(report.uncertainPixels)} pixels precisam de conferência. Ajuste os grupos abaixo ou revise a comparação antes de importar.</p>}
        {activeGroups.length > 0 && <div className="palette-import-groups"><strong>Corrigir associação de cor (opcional)</strong><small>Uma escolha se aplica ao grupo de tons próximo mostrado pela amostra. Para verde removido, escolha um papel para restaurá-lo como parte do desenho.</small>{activeGroups.map((group) => <label className="palette-import-group" key={group.key}><span><i style={{ background: group.sourceHex }} /><code>{group.sourceHex}</code><small>{number(group.pixels)} px · {group.chroma === 'removed' ? 'removido como fundo' : group.chroma === 'preserved' ? 'verde preservado por correção' : group.confidence === 'low' ? 'revisar' : group.confidence === 'medium' ? 'média' : 'alta'}</small></span><select disabled={confirming} value={overrides[group.key] ?? ''} onChange={(event) => changeRole(group.key, event.target.value)} aria-label={`Papel para a cor ${group.sourceHex}`}><option value="">Automático · {group.chroma === 'removed' ? 'transparência do chroma' : palette.find((entry) => entry.role === group.role)?.label ?? 'base'}</option>{palette.map((entry) => <option value={entry.role} key={entry.role}>{entry.label}</option>)}</select></label>)}</div>}
      </div>}
      {error && <p className="palette-import-error" role="alert">{error}</p>}
      <footer><button className="pose-button secondary" onClick={onCancel} disabled={confirming} type="button">Cancelar</button><button className="pose-button primary" onClick={() => void confirm()} disabled={processing || confirming || (enabled && !normalizedUrl)} type="button">{confirming ? 'Preparando…' : enabled ? 'Importar normalizada' : 'Importar original'}</button></footer>
    </section>
  </div>
}

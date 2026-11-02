import { useEffect, useRef } from 'react'

export function DiagnosticsReportPreviewDialog({
  open,
  busy,
  onCancel,
  onConfirm
}: {
  open: boolean
  busy: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return <dialog
    className="options-report-dialog"
    ref={dialogRef}
    aria-labelledby="options-report-preview-title"
    aria-describedby="options-report-preview-description"
    onCancel={(event) => { event.preventDefault(); onCancel() }}
  >
    <div className="options-report-dialog-content">
      <header>
        <span className="options-eyebrow">EXPORTAÇÃO LOCAL</span>
        <h2 id="options-report-preview-title">Revisar relatório de diagnóstico</h2>
      </header>
      <p id="options-report-preview-description">Antes de escolher onde salvar, confira os grupos de informação que serão incluídos:</p>
      <ul>
        <li>Versões do Native-gacha, Electron, Chromium e Node; memória e tempo aberto; lista de processos com PID e memória, sem somar os processos entre si.</li>
        <li>CPU por processo somente quando houver uma janela entre leituras. A primeira leitura informa a CPU como indisponível.</li>
        <li>Uso agregado por categoria, resumo do catálogo e objetos referenciados; essa leitura é atualizada quando você confirmar.</li>
        <li>Quantidade, verificação e tamanho total dos backups, sem copiar o conteúdo dos backups.</li>
        <li>Até 250 eventos locais recentes, com as mensagens e metadados sanitizados.</li>
      </ul>
      <p className="options-report-privacy">O relatório não inclui documentos de projeto nem os bytes de personagens ou mídias. Caminhos, URLs e credenciais conhecidos são removidos, mas mensagens técnicas são texto livre e podem manter contexto específico. Revise o JSON gerado antes de compartilhar.</p>
      <footer>
        <button className="options-button secondary" type="button" onClick={onCancel} disabled={busy}>Voltar</button>
        <button className="options-button primary" type="button" onClick={onConfirm} disabled={busy}>{busy ? 'Preparando…' : 'Escolher arquivo local'}</button>
      </footer>
    </div>
  </dialog>
}

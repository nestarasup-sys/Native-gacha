import { useState } from 'react'
import editorV6Guide from '../../../../../docs/editor-v6/GUIA_V14_1_NATIVE_GACHA_EDITOR_V6_JSON_REACT.md?raw'

export function BaseVideosV6GuideModal({ onClose }: { onClose: () => void }) {
  const [notice, setNotice] = useState('')
  const copyGuide = async () => {
    try {
      await navigator.clipboard.writeText(editorV6Guide)
      setNotice('Guia copiado.')
    } catch {
      setNotice('Não foi possível copiar automaticamente. Selecione o texto para copiá-lo.')
    }
  }
  return <div className="roteiro-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="base-videos-ai-modal" role="dialog" aria-modal="true" aria-labelledby="base-videos-v6-guide-title">
      <header><div><span>GUIA DO EDITOR V6</span><h2 id="base-videos-v6-guide-title">GUIA V14.1</h2><p>Contrato de JSON React editável usado pelo Editor V6.</p></div><button type="button" aria-label="Fechar" onClick={onClose}>×</button></header>
      <div className="base-videos-ai-body">
        <pre style={{ maxHeight: '62vh', overflow: 'auto', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{editorV6Guide}</pre>
        {notice && <p className="base-videos-ai-note" role="status">{notice}</p>}
      </div>
      <footer><button type="button" onClick={onClose}>Fechar</button><button type="button" className="primary" onClick={() => void copyGuide()}>Copiar guia</button></footer>
    </section>
  </div>
}

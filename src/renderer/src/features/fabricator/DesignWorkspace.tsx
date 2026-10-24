import { useState } from 'react'
import { Icon } from '../../ui/components/Icon'
import { normalizeImageFile } from './normalizeImage'
import { DESIGN_BANNER_HEIGHT_PX, DESIGN_BANNER_IMAGE_HEIGHT_PX, DESIGN_BANNER_IMAGE_WIDTH_PX, DESIGN_BANNER_WIDTH_PX, designLimits, saveDesignSettings, useDesignSettings, type DesignBannerSlide } from '../../ui/designSettings'
import { DesignBanner } from '../../ui/components/DesignBanner'

function createSlide(): DesignBannerSlide {
  return { id: crypto.randomUUID(), title: 'Nova novidade', subtitle: 'Escreva uma descrição curta.', imageDataUrl: null }
}

export { DesignBanner } from '../../ui/components/DesignBanner' // compatibilidade legada

export function DesignWorkspace() {
  const settings = useDesignSettings()
  const [error, setError] = useState('')

  const updateSlide = (id: string, update: Partial<DesignBannerSlide>) => saveDesignSettings({
    ...settings,
    bannerSlides: settings.bannerSlides.map((slide) => slide.id === id ? { ...slide, ...update } : slide)
  })

  const addSlide = () => {
    if (settings.bannerSlides.length >= designLimits.maxSlides) return
    saveDesignSettings({ ...settings, bannerSlides: [...settings.bannerSlides, createSlide()] })
  }

  const moveSlide = (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= settings.bannerSlides.length) return
    const bannerSlides = [...settings.bannerSlides]
    ;[bannerSlides[index], bannerSlides[target]] = [bannerSlides[target], bannerSlides[index]]
    saveDesignSettings({ ...settings, bannerSlides })
  }

  const removeSlide = (id: string) => {
    if (settings.bannerSlides.length <= 1) return
    saveDesignSettings({ ...settings, bannerSlides: settings.bannerSlides.filter((slide) => slide.id !== id) })
  }

  const readImage = async (id: string, file?: File) => {
    setError('')
    if (!file) return
    if (!file.type.startsWith('image/')) { setError('Escolha um arquivo de imagem.'); return }
    if (file.size > designLimits.maxImageBytes) { setError('A imagem deve ter no máximo 1,5 MB.'); return }
    try { updateSlide(id, { imageDataUrl: (await normalizeImageFile(file)).dataUrl }) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível carregar essa imagem.') }
  }

  return <section className="fabricator-workspace design-dev-workspace" aria-label="Design Dev">
    <header className="design-dev-toolbar">
      <span className="design-dev-heading-icon"><Icon name="flower" /></span>
      <span><small>IDENTIDADE DO APLICATIVO</small><strong>Design Dev</strong><em>Personalize o banner que aparece no início do Customizar.</em></span>
      <span className="design-dev-autosave"><Icon name="check" /> Salvo automaticamente</span>
    </header>
    <div className="design-dev-content">
      <section className="design-dev-banner-editor" aria-labelledby="design-banner-editor-title">
        <header className="design-dev-section-heading">
          <span><strong id="design-banner-editor-title">Banner da página inicial</strong><small>As imagens passam automaticamente a cada 5 segundos.</small></span>
          <button className="design-dev-add" onClick={addSlide} disabled={settings.bannerSlides.length >= designLimits.maxSlides} type="button"><Icon name="plus" /> Adicionar imagem</button>
        </header>
        <div className="design-dev-slide-list">
          {settings.bannerSlides.map((slide, index) => <article className="design-dev-slide-card" key={slide.id}>
            <div className="design-dev-slide-preview">
              {slide.imageDataUrl ? <img src={slide.imageDataUrl} alt="Prévia do banner" /> : <div><span>{slide.title || 'Seu título'}</span><small>{slide.subtitle || 'Sua descrição'}</small><i aria-hidden="true">✿</i></div>}
              <span className="design-dev-slide-number">{String(index + 1).padStart(2, '0')}</span>
            </div>
            <div className="design-dev-slide-fields">
              <label>Título<input value={slide.title} maxLength={80} onChange={(event) => updateSlide(slide.id, { title: event.target.value })} placeholder="Título do banner" /></label>
              <label>Subtítulo<input value={slide.subtitle} maxLength={120} onChange={(event) => updateSlide(slide.id, { subtitle: event.target.value })} placeholder="Descrição curta" /></label>
              <div className="design-dev-slide-actions">
                <label className="design-dev-upload"><Icon name="camera" />{slide.imageDataUrl ? 'Trocar imagem' : 'Escolher imagem'}<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { void readImage(slide.id, event.target.files?.[0]); event.currentTarget.value = '' }} /></label>
                {slide.imageDataUrl && <button onClick={() => updateSlide(slide.id, { imageDataUrl: null })} type="button">Usar fundo</button>}
                <button aria-label={`Mover banner ${index + 1} para cima`} title="Mover para cima" disabled={index === 0} onClick={() => moveSlide(index, -1)} type="button">↑</button>
                <button aria-label={`Mover banner ${index + 1} para baixo`} title="Mover para baixo" disabled={index === settings.bannerSlides.length - 1} onClick={() => moveSlide(index, 1)} type="button">↓</button>
                <button className="danger" aria-label={`Remover banner ${index + 1}`} title="Remover banner" disabled={settings.bannerSlides.length <= 1} onClick={() => removeSlide(slide.id)} type="button"><Icon name="trash" /></button>
              </div>
            </div>
          </article>)}
        </div>
        <p className="design-dev-limit-note">Até {designLimits.maxSlides} imagens · PNG, JPG ou WebP estático · até 1,5 MB por arquivo. A marca Gacha Nymi e a pétala rosa permanecem no cabeçalho.</p>
        {error && <p className="design-dev-error" role="alert">{error}</p>}
      </section>
      <aside className="design-dev-preview-panel" aria-label="Prévia ao vivo do banner">
        <header><strong>Prévia ao vivo</strong><small>Como aparece no Customizar</small></header>
        <DesignBanner compact />
        <p className="design-dev-banner-dimensions">Banner completo: <b>{DESIGN_BANNER_WIDTH_PX} × {DESIGN_BANNER_HEIGHT_PX} px</b><br />Área da imagem: <b>{DESIGN_BANNER_IMAGE_WIDTH_PX} × {DESIGN_BANNER_IMAGE_HEIGHT_PX} px</b></p>
      </aside>
    </div>
  </section>
}

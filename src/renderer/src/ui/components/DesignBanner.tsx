import { useEffect, useState } from 'react'
import { Icon } from './Icon'
import { defaultDesignSettings, DESIGN_BANNER_WIDTH_PX, useDesignSettings } from '../designSettings'

export function DesignBanner({ compact = false }: { compact?: boolean }) {
  const { bannerSlides } = useDesignSettings()
  const [activeIndex, setActiveIndex] = useState(0)
  const slides = bannerSlides.length ? bannerSlides : defaultDesignSettings.bannerSlides
  const currentIndex = activeIndex % slides.length
  const slide = slides[currentIndex]

  useEffect(() => {
    if (slides.length < 2) return
    const timer = window.setInterval(() => setActiveIndex((index) => (index + 1) % slides.length), 5000)
    return () => window.clearInterval(timer)
  }, [slides.length])

  const showAdjacent = (direction: number) => setActiveIndex((index) => (index + direction + slides.length) % slides.length)

  return <section className={`design-banner${compact ? ' compact' : ''}`} style={{ width: DESIGN_BANNER_WIDTH_PX }} aria-label="Banner Gacha Nymi">
    <header className="design-banner-brand"><strong>GACHA NYMI</strong><span aria-label="Flor de cerejeira">🌸</span></header>
    <div className="design-banner-stage" aria-live="polite">
      {slide.imageDataUrl ? <img src={slide.imageDataUrl} alt="" /> : <div className="design-banner-placeholder"><span>{slide.title}</span><small>{slide.subtitle}</small><i aria-hidden="true">✿</i></div>}
      <button className="design-banner-arrow previous" onClick={() => showAdjacent(-1)} type="button" aria-label="Banner anterior" title="Banner anterior"><Icon name="chevronRight" /></button>
      <button className="design-banner-arrow next" onClick={() => showAdjacent(1)} type="button" aria-label="Próximo banner" title="Próximo banner"><Icon name="chevronRight" /></button>
      <span className="design-banner-counter">{currentIndex + 1} / {slides.length}</span>
    </div>
  </section>
}


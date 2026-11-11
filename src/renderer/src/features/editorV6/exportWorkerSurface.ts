import { createRoot } from 'react-dom/client'
import type { SyntheticEvent } from 'react'

export function encodeEditorV6PaintToken(token: number): string[] {
  if (!Number.isInteger(token) || token < 1 || token > 0xffffff) throw Error('Identificador de quadro inválido na exportação.')
  return Array.from({ length: 24 }, (_, bit) => ((token >>> bit) & 1) === 1 ? '#fff' : '#000')
}

export function createEditorV6SvgImageReadiness() {
  const loadedSources = new WeakMap<SVGImageElement, string>()
  const onLoad = (event: SyntheticEvent<SVGImageElement>) => {
    const image = event.currentTarget
    loadedSources.set(image, image.getAttribute('href') ?? '')
  }
  const waitForImage = (image: SVGImageElement, expectedSource: string) => {
    if (loadedSources.get(image) === expectedSource) return Promise.resolve()
    return new Promise<void>((resolve, reject) => {
      let timeout: ReturnType<typeof setTimeout>
      const finish = (error?: Error) => {
        clearTimeout(timeout)
        image.removeEventListener('load', onImageLoad)
        image.removeEventListener('error', onImageError)
        if (error) reject(error)
        else resolve()
      }
      const onImageLoad = () => {
        const source = image.getAttribute('href') ?? ''
        loadedSources.set(image, source)
        if (source === expectedSource) finish()
      }
      const onImageError = () => finish(Error('Uma imagem da cena falhou ao carregar no renderizador de exportação.'))
      image.addEventListener('load', onImageLoad)
      image.addEventListener('error', onImageError)
      timeout = setTimeout(() => finish(Error('Tempo limite ao carregar uma imagem da cena para exportação.')), 60000)
      if (loadedSources.get(image) === expectedSource) finish()
    })
  }
  return { onLoad, waitForImage }
}

/** Builds the hidden render surface and compositor token used by export capture. */
export function createEditorV6ExportWorkerSurface(width: number, height: number) {
  const rootElement = document.getElementById('root')
  if (!rootElement) throw Error('A superfície do renderizador de exportação não foi encontrada.')
  rootElement.style.width = `${width}px`
  rootElement.style.height = `${height}px`
  rootElement.style.overflow = 'hidden'

  const paintTokenElement = document.createElement('div')
  paintTokenElement.setAttribute('aria-hidden', 'true')
  Object.assign(paintTokenElement.style, {
    position: 'fixed', left: `${width}px`, top: '0', width: '24px', height: '16px',
    pointerEvents: 'none', zIndex: '2147483647', opacity: '1', contain: 'strict'
  })
  const cells = Array.from({ length: 24 }, (_, bit) => {
    const cell = document.createElement('div')
    Object.assign(cell.style, {
      position: 'absolute', left: `${(bit % 6) * 4}px`, top: `${Math.floor(bit / 6) * 4}px`,
      width: '4px', height: '4px', backgroundColor: '#000'
    })
    paintTokenElement.append(cell)
    return cell
  })
  document.body.append(paintTokenElement)

  return {
    root: createRoot(rootElement),
    setPaintToken(token: number) {
      encodeEditorV6PaintToken(token).forEach((color, bit) => { cells[bit].style.backgroundColor = color })
    }
  }
}

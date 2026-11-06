import { createRoot, type Root } from 'react-dom/client'
import { flushSync } from 'react-dom'
import type { SyntheticEvent } from 'react'
import { SceneSurface } from '../SceneSurface'
import type { EditorV6FrameSurface, EditorV6FrameSurfaceRequest, EditorV6FrameSurfaceTimings } from '../engine/frameSurface'

/** Current compatibility renderer. A native Canvas/WebGL surface can replace this adapter behind the same frame contract. */
export function createReactSvgFrameSurface(rootElement: HTMLElement, width: number, height: number): EditorV6FrameSurface {
  rootElement.style.width = `${width}px`
  rootElement.style.height = `${height}px`
  rootElement.style.overflow = 'hidden'

  const marker = document.createElement('div')
  marker.setAttribute('aria-hidden', 'true')
  Object.assign(marker.style, {
    position: 'fixed', left: `${width}px`, top: '0', width: '24px', height: '16px',
    pointerEvents: 'none', zIndex: '2147483647', opacity: '1', contain: 'strict'
  })
  const cells = Array.from({ length: 24 }, (_, bit) => {
    const cell = document.createElement('div')
    Object.assign(cell.style, {
      position: 'absolute', left: `${(bit % 6) * 4}px`, top: `${Math.floor(bit / 6) * 4}px`,
      width: '4px', height: '4px', backgroundColor: '#000'
    })
    marker.append(cell)
    return cell
  })
  document.body.append(marker)

  const root: Root = createRoot(rootElement)
  const loadedImages = new WeakMap<SVGImageElement, string>()
  const onImageLoad = (event: SyntheticEvent<SVGImageElement>) => {
    const image = event.currentTarget
    loadedImages.set(image, image.getAttribute('href') ?? '')
  }
  let previousToken = 0
  let inFlight = false
  let disposed = false

  const waitForImage = (image: SVGImageElement, expectedSource: string): Promise<void> => {
    if (loadedImages.get(image) === expectedSource) return Promise.resolve()
    return new Promise<void>((resolve, reject) => {
      let timeout: ReturnType<typeof setTimeout>
      const finish = (error?: Error) => {
        clearTimeout(timeout)
        image.removeEventListener('load', onLoad)
        image.removeEventListener('error', onError)
        if (error) reject(error)
        else resolve()
      }
      const onLoad = () => {
        const source = image.getAttribute('href') ?? ''
        loadedImages.set(image, source)
        if (source === expectedSource) finish()
      }
      const onError = () => finish(Error('Uma imagem da cena falhou ao carregar no renderizador de exportação.'))
      image.addEventListener('load', onLoad)
      image.addEventListener('error', onError)
      timeout = setTimeout(() => finish(Error('Tempo limite ao carregar uma imagem da cena para exportação.')), 60_000)
      if (loadedImages.get(image) === expectedSource) finish()
    })
  }

  const present = async (request: EditorV6FrameSurfaceRequest): Promise<EditorV6FrameSurfaceTimings> => {
    if (disposed) throw Error('A superfície de cena já foi liberada.')
    if (inFlight) throw Error('A superfície de cena recebeu quadros concorrentes.')
    if (!Number.isSafeInteger(request.paintToken) || request.paintToken <= previousToken || request.paintToken > 0xffffff) {
      throw Error('Identificador de quadro inválido na exportação.')
    }
    inFlight = true
    try {
      const commitStarted = performance.now()
      flushSync(() => root.render(<SceneSurface scene={request.scene} assets={request.assets} outputWidth={request.width} outputHeight={request.height} renderLayer={request.renderLayer} onImageLoad={onImageLoad} rasterCanvases={request.rasterCanvases} />))
      const renderMs = performance.now() - commitStarted

      const imageWaitStarted = performance.now()
      await Promise.all(Array.from(rootElement.querySelectorAll<SVGImageElement>('svg image')).flatMap((image) => {
        const source = image.getAttribute('href') ?? ''
        return source ? [waitForImage(image, source)] : []
      }))
      const imageWaitMs = performance.now() - imageWaitStarted

      for (let bit = 0; bit < cells.length; bit++) cells[bit].style.backgroundColor = ((request.paintToken >>> bit) & 1) === 1 ? '#fff' : '#000'
      const presentationStarted = performance.now()
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      const presentationWaitMs = performance.now() - presentationStarted
      previousToken = request.paintToken
      return { renderMs, imageWaitMs, presentationWaitMs, surfaceMode: 'svg' }
    } finally {
      inFlight = false
    }
  }

  return {
    present,
    setActive(active) { marker.style.display = active ? 'block' : 'none' },
    dispose() {
      if (disposed) return
      disposed = true
      root.unmount()
      marker.remove()
    }
  }
}

import type { EditorV6Asset, EditorV6Element, EditorV6SceneElement } from '../../../../../shared/editorV6'
import { editorV6ElementSize } from '../../../../../shared/editorV6SceneModel'
import { editorV6ElementsWithBalloonsOnTop } from '../editorV6SceneLayerOrder'
import { createSpeechBalloonPath, createThoughtBalloonPath, createThoughtBalloonSketchPath } from '../speechBalloonPath'
import { EDITOR_V6_SCENE_FONT as FONT, wrapSceneText } from '../engine/sceneTextLayout'
import type { EditorV6FrameSurface, EditorV6FrameSurfaceRequest, EditorV6FrameSurfaceTimings } from '../engine/frameSurface'

const sceneScaleX = 19.2
const sceneScaleY = 10.8
const SVG_NS = 'http://www.w3.org/2000/svg'

function getCanvasContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext('2d', { alpha: true })
  if (!context) throw Error('O Chromium não disponibilizou Canvas2D para a superfície de cena.')
  return context
}

function svgNode(name: string, attributes: Record<string, string>): SVGElement {
  const element = document.createElementNS(SVG_NS, name)
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value)
  return element
}

/** Rasterize only the small vector dialogue layer; the returned bitmap is composited into the single output Canvas. */
function renderBalloonOverlay(elements: readonly EditorV6SceneElement[]): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('xmlns', SVG_NS)
  svg.setAttribute('width', '1920')
  svg.setAttribute('height', '1080')
  svg.setAttribute('viewBox', '0 0 1920 1080')
  for (const element of editorV6ElementsWithBalloonsOnTop(elements)) {
    if (element.kind !== 'speech' && element.kind !== 'thought') continue
    const size = editorV6ElementSize(element)
    const scale = Math.max(1, Math.min(2.5, (element.balloonScalePercent ?? 100) / 100))
    const width = size.width * sceneScaleX * scale
    const height = size.height * sceneScaleY * scale
    const y = element.y + (element.balloonOffsetY ?? 0)
    const group = svgNode('g', { transform: `translate(${(50 + element.x) * sceneScaleX} ${(50 + y) * sceneScaleY}) rotate(${element.rotation})` })
    const outline = element.speakerColor ?? '#624d5b'
    if (element.kind === 'speech') group.append(svgNode('path', { d: createSpeechBalloonPath(width, height), fill: '#ffffff', stroke: outline, 'stroke-width': '5', 'stroke-linejoin': 'round' }))
    else {
      group.append(svgNode('path', { d: createThoughtBalloonPath(width, height), fill: '#ffffff', stroke: outline, 'stroke-width': '2.5', 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }))
      group.append(svgNode('path', { d: createThoughtBalloonSketchPath(width, height), fill: 'none', stroke: outline, 'stroke-width': '1.3', 'stroke-linejoin': 'round', 'stroke-linecap': 'round', opacity: '.9' }))
    }
    const fontSize = Math.max(8, Math.min(32, height * .3, width / 2))
    const lineHeight = fontSize * 1.22
    const speakerName = element.speakerName?.trim()
    const speakerMaxChars = speakerName ? Math.max(4, Math.floor((width - 32) / (fontSize * .62))) : 0
    const speakerLabel = speakerName && speakerName.length > speakerMaxChars ? `${speakerName.slice(0, Math.max(1, speakerMaxChars - 1))}…` : speakerName
    const textInset = Math.max(20, width * .045)
    const textTop = -height / 2 + 6
    const bodyBottom = element.kind === 'speech'
      ? height / 2 - Math.min(height * .2, Math.max(0, height / 2 - Math.min(width * .22, height * .25)))
      : -height / 2 + height * .83
    const textSafeHeight = Math.max(0, bodyBottom - textTop - 6)
    const maxLines = Math.max(1, Math.floor((textSafeHeight - (speakerName ? fontSize + 8 : 8)) / lineHeight))
    const clipId = `v6-text-${element.id.replace(/[^a-zA-Z0-9_-]/g, '_')}`
    const defs = svgNode('defs', {})
    const clip = svgNode('clipPath', { id: clipId })
    clip.append(svgNode('rect', { x: `${-width / 2 + textInset}`, y: `${textTop}`, width: `${Math.max(0, width - textInset * 2)}`, height: `${textSafeHeight}`, rx: `${Math.min(width, height) * .12}` }))
    defs.append(clip)
    group.append(defs)
    if (speakerLabel) {
      const speaker = svgNode('text', { x: '0', y: `${-height / 2 + 8 + fontSize / 2}`, 'font-family': FONT, 'font-size': `${fontSize}`, 'font-weight': '750', 'text-anchor': 'middle', 'dominant-baseline': 'middle', fill: outline, 'clip-path': `url(#${clipId})` })
      speaker.textContent = speakerLabel
      group.append(speaker)
    }
    const text = svgNode('text', { 'font-family': FONT, 'font-size': `${fontSize}`, 'font-weight': '600', 'text-anchor': 'middle', 'dominant-baseline': 'middle', fill: '#352d35', 'clip-path': `url(#${clipId})` })
    const lines = wrapSceneText(element.text, Math.max(1, width - textInset * 2), fontSize, maxLines)
    lines.forEach((line, index) => {
      const lineY = speakerName ? -height / 2 + 12 + fontSize + lineHeight * (.5 + index) : (index - (lines.length - 1) / 2) * lineHeight
      const span = svgNode('tspan', { x: '0', y: `${lineY}` })
      span.textContent = line
      text.append(span)
    })
    group.append(text)
    svg.append(group)
  }
  return svg
}

function balloonOverlayKey(elements: readonly EditorV6SceneElement[]): string {
  return JSON.stringify(editorV6ElementsWithBalloonsOnTop(elements).filter((element) => element.kind === 'speech' || element.kind === 'thought'))
}

type NarratorSceneElement = EditorV6Element & { kind: 'narrator'; speakerColor?: string }

function renderNarratorVector(element: NarratorSceneElement): SVGSVGElement {
  const size = editorV6ElementSize(element)
  const width = size.width * sceneScaleX
  const height = size.height * sceneScaleY
  const fontSize = Math.max(8, Math.min(32, height * .3, width / 2))
  const lineHeight = fontSize * 1.22
  const lines = wrapSceneText(element.text, Math.max(1, width - 32), fontSize, Math.max(1, Math.floor((height - 18) / lineHeight)))
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('xmlns', SVG_NS)
  svg.setAttribute('width', `${width}`)
  svg.setAttribute('height', `${height}`)
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`)
  const outline = element.speakerColor ?? '#624d5b'
  svg.append(svgNode('rect', { x: '0', y: '0', width: `${width}`, height: `${height}`, rx: '16', fill: '#ffffff', 'fill-opacity': '.94', stroke: outline, 'stroke-width': '2' }))
  const clipId = `v6-narrator-${element.id.replace(/[^a-zA-Z0-9_-]/g, '_')}`
  const defs = svgNode('defs', {})
  const clip = svgNode('clipPath', { id: clipId })
  clip.append(svgNode('rect', { x: '10', y: '8', width: `${Math.max(0, width - 20)}`, height: `${height - 16}` }))
  defs.append(clip)
  svg.append(defs)
  const text = svgNode('text', { 'font-family': FONT, 'font-size': `${fontSize}`, 'font-weight': '600', 'text-anchor': 'middle', 'dominant-baseline': 'middle', fill: '#352d35', 'clip-path': `url(#${clipId})` })
  lines.forEach((line, index) => {
    const span = svgNode('tspan', { x: `${width / 2}`, y: `${height / 2 + (index - (lines.length - 1) / 2) * lineHeight}` })
    span.textContent = line
    text.append(span)
  })
  svg.append(text)
  return svg
}

function narratorVectorKey(element: NarratorSceneElement): string {
  return JSON.stringify({ text: element.text, width: element.width, height: element.height, speakerColor: element.speakerColor })
}

/** Experimental direct Canvas2D adapter; it is intentionally not selected by production exports yet. */
export function createCanvas2dFrameSurface(rootElement: HTMLElement, width: number, height: number): EditorV6FrameSurface & { readonly canvas: HTMLCanvasElement } {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  Object.assign(rootElement.style, { position: 'relative', width: `${width}px`, height: `${height}px`, overflow: 'hidden' })
  Object.assign(canvas.style, { position: 'absolute', inset: '0', display: 'block', width: '100%', height: '100%' })
  rootElement.replaceChildren(canvas)
  const context = getCanvasContext(canvas)
  const imageCache = new Map<string, { asset: EditorV6Asset; promise: Promise<HTMLImageElement> }>()
  const narratorVectorCache = new Map<string, Promise<HTMLImageElement>>()
  const maskScratchByElement = new Map<string, HTMLCanvasElement>()
  let dialogueBitmapKey = ''
  let dialogueBitmap: HTMLImageElement | undefined
  const imageFor = (asset: EditorV6Asset): Promise<HTMLImageElement> => {
    const cached = imageCache.get(asset.id)
    if (cached?.asset === asset) {
      imageCache.delete(asset.id)
      imageCache.set(asset.id, cached)
      return cached.promise
    }
    if (cached) imageCache.delete(asset.id)
    const promise = new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image()
      image.onerror = () => reject(Error(`Não foi possível preparar ${asset.name} para o Canvas2D.`))
      image.onload = () => { void image.decode().then(() => resolve(image), reject) }
      image.src = asset.dataUrl
    })
    imageCache.set(asset.id, { asset, promise })
    if (imageCache.size > 32) imageCache.delete(imageCache.keys().next().value!)
    return promise
  }
  const assetImages = async (request: EditorV6FrameSurfaceRequest) => {
    const neededIds = new Set<string>()
    if (request.renderLayer !== 'foreground' && request.scene.background.backgroundAssetId) neededIds.add(request.scene.background.backgroundAssetId)
    if (request.renderLayer !== 'background') for (const element of request.scene.elements) {
      if (element.assetId) neededIds.add(element.assetId)
      if (element.mouthPatch) neededIds.add(element.mouthPatch.assetId)
    }
    const images = new Map<string, HTMLImageElement>()
    await Promise.all(request.assets.filter((asset) => neededIds.has(asset.id)).map(async (asset) => { images.set(asset.id, await imageFor(asset)) }))
    return images
  }
  const narratorImages = async (elements: readonly EditorV6SceneElement[]) => {
    const images = new Map<string, HTMLImageElement>()
    await Promise.all(elements.filter((element): element is NarratorSceneElement => element.kind === 'narrator').map(async (element) => {
      const key = narratorVectorKey(element)
      let imagePromise = narratorVectorCache.get(key)
      if (!imagePromise) {
        imagePromise = (async () => {
          const svg = renderNarratorVector(element)
          const objectUrl = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' }))
          const image = new Image()
          image.src = objectUrl
          try { await image.decode() } catch (error) { throw Error(`Não foi possível rasterizar o narrador: ${error instanceof Error ? error.message : String(error)}`) }
          finally { URL.revokeObjectURL(objectUrl) }
          return image
        })()
        narratorVectorCache.set(key, imagePromise)
        if (narratorVectorCache.size > 16) narratorVectorCache.delete(narratorVectorCache.keys().next().value!)
      }
      images.set(element.id, await imagePromise)
    }))
    return images
  }
  const marker = document.createElement('div')
  marker.setAttribute('aria-hidden', 'true')
  Object.assign(marker.style, { position: 'fixed', left: `${width}px`, top: '0', width: '24px', height: '16px', pointerEvents: 'none', zIndex: '2147483647', opacity: '1', contain: 'strict' })
  const markerCells = Array.from({ length: 24 }, (_, bit) => {
    const cell = document.createElement('div')
    Object.assign(cell.style, { position: 'absolute', left: `${(bit % 6) * 4}px`, top: `${Math.floor(bit / 6) * 4}px`, width: '4px', height: '4px', backgroundColor: '#000' })
    marker.append(cell)
    return cell
  })
  document.body.append(marker)
  let previousToken = 0
  let inFlight = false
  let disposed = false

  const drawImage = (target: CanvasRenderingContext2D, image: CanvasImageSource, x: number, y: number, destinationWidth: number, destinationHeight: number, source?: { x: number; y: number; width: number; height: number }) => {
    if (source) target.drawImage(image, source.x, source.y, source.width, source.height, x, y, destinationWidth, destinationHeight)
    else target.drawImage(image, x, y, destinationWidth, destinationHeight)
  }

  const drawElement = (target: CanvasRenderingContext2D, element: EditorV6SceneElement, images: ReadonlyMap<string, HTMLImageElement>, rasterCanvas?: HTMLCanvasElement, narratorImage?: HTMLImageElement) => {
    const size = editorV6ElementSize(element)
    const balloon = element.kind === 'speech' || element.kind === 'thought'
    const balloonScale = balloon ? Math.max(1, Math.min(2.5, (element.balloonScalePercent ?? 100) / 100)) : 1
    const elementWidth = size.width * sceneScaleX * balloonScale
    const elementHeight = size.height * sceneScaleY * balloonScale
    const displayY = element.y + (balloon ? element.balloonOffsetY ?? 0 : 0)
    target.save()
    target.translate((50 + element.x) * sceneScaleX, (50 + displayY) * sceneScaleY)
    target.rotate(element.rotation * Math.PI / 180)

    const isImage = element.kind === 'image' || element.kind === 'character'
    if (isImage && (rasterCanvas || element.assetId)) {
      target.save()
      if (element.flipX) target.scale(-1, 1)
      const image = rasterCanvas ?? (element.assetId ? images.get(element.assetId) : undefined)
      if (image) {
        const patch = element.mouthPatch
        const mouth = patch ? images.get(patch.assetId) : undefined
        const x = -elementWidth / 2, y = -elementHeight / 2
        const sprite = element.motionSprite
        const source = sprite ? { x: sprite.x, y: sprite.y, width: sprite.width, height: sprite.height } : undefined
        let destinationX = x, destinationY = y, destinationWidth = elementWidth, destinationHeight = elementHeight
        if (element.kind === 'image' && !rasterCanvas && !source) {
          const sourceWidth = image instanceof HTMLImageElement ? image.naturalWidth : image.width
          const sourceHeight = image instanceof HTMLImageElement ? image.naturalHeight : image.height
          const scale = Math.min(elementWidth / sourceWidth, elementHeight / sourceHeight)
          destinationWidth = sourceWidth * scale
          destinationHeight = sourceHeight * scale
          destinationX = -destinationWidth / 2
          destinationY = -destinationHeight / 2
        }
        if (patch?.replace && mouth) {
          let scratch = maskScratchByElement.get(element.id)
          if (!scratch) { scratch = document.createElement('canvas'); maskScratchByElement.set(element.id, scratch) }
          const scratchWidth = Math.max(1, Math.ceil(elementWidth)), scratchHeight = Math.max(1, Math.ceil(elementHeight))
          if (scratch.width !== scratchWidth) scratch.width = scratchWidth
          if (scratch.height !== scratchHeight) scratch.height = scratchHeight
          const scratchContext = getCanvasContext(scratch)
          scratchContext.clearRect(0, 0, scratch.width, scratch.height)
          drawImage(scratchContext, image, 0, 0, scratch.width, scratch.height, source)
          const bounds = patch.replaceBounds ?? { x: 0, y: 0, width: 1, height: 1 }
          scratchContext.clearRect((patch.x + bounds.x * patch.width) * scratch.width, (patch.y + bounds.y * patch.height) * scratch.height, bounds.width * patch.width * scratch.width, bounds.height * patch.height * scratch.height)
          target.drawImage(scratch, x, y, elementWidth, elementHeight)
        } else drawImage(target, image, destinationX, destinationY, destinationWidth, destinationHeight, source)

        if (patch && mouth) {
          const destinationX = x + patch.x * elementWidth
          const destinationY = y + patch.y * elementHeight
          const destinationWidth = patch.width * elementWidth
          const destinationHeight = patch.height * elementHeight
          drawImage(target, mouth, destinationX, destinationY, destinationWidth, destinationHeight, patch.sprite)
        }
      }
      target.restore()
      target.restore()
      return
    }

    if (element.kind === 'speech' || element.kind === 'thought') {
      target.restore()
      return
    }

    if (element.kind === 'narrator') {
      if (narratorImage) target.drawImage(narratorImage, -elementWidth / 2, -elementHeight / 2, elementWidth, elementHeight)
    }
    target.restore()
  }

  const present = async (request: EditorV6FrameSurfaceRequest): Promise<EditorV6FrameSurfaceTimings> => {
    if (disposed) throw Error('A superfície de cena já foi liberada.')
    if (inFlight) throw Error('A superfície de cena recebeu quadros concorrentes.')
    if (!Number.isSafeInteger(request.paintToken) || request.paintToken <= previousToken || request.paintToken > 0xffffff) throw Error('Identificador de quadro inválido na exportação.')
    if (request.scene.mediaVideo) throw Error('O Canvas2D experimental ainda não compõe vídeo embutido; use a superfície de compatibilidade.')
    inFlight = true
    try {
      const imagesStarted = performance.now()
      const images = await assetImages(request)
      const narratorImageByElement = request.renderLayer === 'background' ? new Map<string, HTMLImageElement>() : await narratorImages(request.scene.elements)
      const imageWaitMs = performance.now() - imagesStarted
      const commitStarted = performance.now()
      context.setTransform(1, 0, 0, 1, 0, 0)
      context.clearRect(0, 0, width, height)
      context.scale(width / 1920, height / 1080)
      const background = request.scene.background
      if (request.renderLayer !== 'foreground') {
        context.fillStyle = background.backgroundColor
        context.fillRect(0, 0, 1920, 1080)
        const backgroundAsset = background.backgroundAssetId ? images.get(background.backgroundAssetId) : undefined
        if (backgroundAsset) {
          const imageWidth = background.backgroundWidth * sceneScaleX
          const imageHeight = background.backgroundHeight * sceneScaleY
          context.save()
          context.translate((50 + background.backgroundX) * sceneScaleX, (50 + background.backgroundY) * sceneScaleY)
          context.rotate(background.backgroundRotation * Math.PI / 180)
          context.drawImage(backgroundAsset, -imageWidth / 2, -imageHeight / 2, imageWidth, imageHeight)
          context.restore()
        }
      }
      if (request.renderLayer !== 'background') {
        for (const element of editorV6ElementsWithBalloonsOnTop(request.scene.elements)) {
          drawElement(context, element, images, request.rasterCanvases.get(element.id), narratorImageByElement.get(element.id))
        }
        const nextDialogueKey = balloonOverlayKey(request.scene.elements)
        if (nextDialogueKey !== '[]') {
          if (nextDialogueKey !== dialogueBitmapKey) {
            dialogueBitmap = undefined
            const overlaySvg = renderBalloonOverlay(request.scene.elements)
            const source = new Blob([new XMLSerializer().serializeToString(overlaySvg)], { type: 'image/svg+xml' })
            const objectUrl = URL.createObjectURL(source)
            const image = new Image()
            image.src = objectUrl
            try { await image.decode() } catch (error) { throw Error(`Não foi possível rasterizar o texto vetorial do quadro: ${error instanceof Error ? error.message : String(error)}`) }
            finally { URL.revokeObjectURL(objectUrl) }
            dialogueBitmap = image
            dialogueBitmapKey = nextDialogueKey
          }
          context.drawImage(dialogueBitmap!, 0, 0, 1920, 1080)
        } else {
          dialogueBitmap = undefined
          dialogueBitmapKey = nextDialogueKey
        }
      } else {
        dialogueBitmap = undefined
        dialogueBitmapKey = ''
      }
      const commitMs = performance.now() - commitStarted
      for (let bit = 0; bit < markerCells.length; bit++) markerCells[bit].style.backgroundColor = ((request.paintToken >>> bit) & 1) === 1 ? '#fff' : '#000'
      const presentationStarted = performance.now()
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      const presentationWaitMs = performance.now() - presentationStarted
      previousToken = request.paintToken
      return { commitMs, imageWaitMs, presentationWaitMs }
    } finally {
      inFlight = false
    }
  }

  return {
    canvas,
    present,
    dispose() {
      if (disposed) return
      disposed = true
      imageCache.clear()
      narratorVectorCache.clear()
      dialogueBitmap = undefined
      for (const scratch of maskScratchByElement.values()) scratch.width = scratch.height = 1
      maskScratchByElement.clear()
      marker.remove()
      canvas.width = canvas.height = 1
      rootElement.replaceChildren()
    }
  }
}

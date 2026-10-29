import { studioElementSize } from '../../../../shared/studioSceneModel.ts'
import type { StudioDocument, StudioElement } from '../../../../shared/studio'

export function makeCanvasPrint(studio: StudioDocument, outputWidth = 1920, outputHeight = 1080, mimeType = 'image/png'): Promise<string> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas')
    canvas.width = outputWidth
    canvas.height = outputHeight
    const context = canvas.getContext('2d')
    if (!context) return reject(new Error('Não foi possível preparar a imagem do print.'))
    context.scale(outputWidth / 1920, outputHeight / 1080)
    context.fillStyle = studio.backgroundColor
    context.fillRect(0, 0, canvas.width, canvas.height)

    const loadImage = (src: string) => new Promise<HTMLImageElement>((ok, fail) => {
      const image = new Image()
      image.onload = () => ok(image)
      image.onerror = () => fail(new Error('Uma imagem da cena não pôde ser carregada para o print.'))
      image.src = src
    })

    const drawImage = (image: HTMLImageElement, x: number, y: number, width: number, height: number, rotation: number, flipX = false) => {
      context.save()
      context.translate((50 + x) * 19.2, (50 + y) * 10.8)
      context.rotate(rotation * Math.PI / 180)
      if (flipX) context.scale(-1, 1)
      context.drawImage(image, -width * 9.6, -height * 5.4, width * 19.2, height * 10.8)
      context.restore()
    }
    const drawText = (element: StudioElement) => {
      const cx = (50 + element.x) * 19.2
      const cy = (50 + element.y) * 10.8
      const width = element.width * 19.2
      const height = element.height * 10.8
      context.save()
      context.translate(cx, cy)
      context.rotate(element.rotation * Math.PI / 180)
      context.fillStyle = element.kind === 'narrator' ? 'rgba(255,255,255,.90)' : 'rgba(255,250,253,.96)'
      context.strokeStyle = '#604b59'
      context.lineWidth = 4
      context.beginPath()
      context.roundRect(-width / 2, -height / 2, width, height, element.kind === 'narrator' ? 20 : height / 2)
      context.fill()
      context.stroke()
      context.fillStyle = '#352d35'
      context.font = `600 ${Math.max(22, Math.round(height * .3))}px sans-serif`
      context.textAlign = 'center'
      context.textBaseline = 'middle'
      const words = element.text.split(/\s+/)
      const lines: string[] = []
      let line = ''
      for (const word of words) {
        const candidate = line ? `${line} ${word}` : word
        if (context.measureText(candidate).width > width - 36 && line) { lines.push(line); line = word } else line = candidate
      }
      if (line) lines.push(line)
      lines.slice(0, 5).forEach((value, index, values) => context.fillText(value, 0, (index - (values.length - 1) / 2) * Math.max(28, height * .32), width - 30))
      context.restore()
    }

    void (async () => {
      try {
        const assetsById = new Map<string, (typeof studio.assets)[number]>()
        for (const asset of studio.assets) if (!assetsById.has(asset.id)) assetsById.set(asset.id, asset)
        const background = studio.backgroundAssetId ? assetsById.get(studio.backgroundAssetId) : undefined
        const elements = [...studio.elements].sort((a, b) => a.zIndex - b.zIndex)
        type PrintLayer =
          | { source: string; draw: (image: HTMLImageElement) => void }
          | { draw: () => void }
        const layers: PrintLayer[] = []
        if (background) layers.push({ source: background.dataUrl, draw: (image) => drawImage(image, studio.backgroundX, studio.backgroundY, studio.backgroundWidth, studio.backgroundHeight, studio.backgroundRotation) })
        for (const element of elements) {
          if (element.kind === 'image' || element.kind === 'character') {
            const asset = element.assetId ? assetsById.get(element.assetId) : undefined
            if (asset) {
              const size = studioElementSize(element)
              layers.push({ source: asset.dataUrl, draw: (image) => drawImage(image, element.x, element.y, size.width, size.height, element.rotation, element.kind === 'character' && element.flipX === true) })
            }
          } else layers.push({ draw: () => drawText(element) })
        }

        const sources = [...new Set(layers.flatMap((layer) => 'source' in layer ? [layer.source] : []))]
        const lastUseIndex = new Map<string, number>()
        layers.forEach((layer, index) => { if ('source' in layer) lastUseIndex.set(layer.source, index) })
        const decodedImages = new Map<string, HTMLImageElement>()
        const pendingImages = new Map<string, Promise<HTMLImageElement>>()
        const failedImages = new Map<string, unknown>()
        let nextSourceIndex = 0
        const startLoading = (source: string) => {
          const pending = loadImage(source).then((image) => {
            if (pendingImages.get(source) === pending) {
              pendingImages.delete(source)
              decodedImages.set(source, image)
            }
            return image
          }, (reason: unknown) => {
            if (pendingImages.get(source) === pending) pendingImages.delete(source)
            failedImages.set(source, reason)
            throw reason
          })
          pendingImages.set(source, pending)
          void pending.catch(() => undefined)
          return pending
        }
        const fillDecodeWindow = () => {
          while (decodedImages.size + pendingImages.size < 4 && nextSourceIndex < sources.length) {
            const source = sources[nextSourceIndex++]
            if (!decodedImages.has(source) && !pendingImages.has(source) && !failedImages.has(source)) startLoading(source)
          }
        }
        const getImage = async (source: string, layerIndex: number) => {
          if (failedImages.has(source)) throw failedImages.get(source)
          let image = decodedImages.get(source)
          if (image) return image
          let pending = pendingImages.get(source)
          while (!pending) {
            if (decodedImages.size + pendingImages.size >= 4) {
              const stale = [...decodedImages.keys()].find((candidate) => (lastUseIndex.get(candidate) ?? -1) <= layerIndex)
              const evictable = stale ?? [...decodedImages.keys()]
                .filter((candidate) => (lastUseIndex.get(candidate) ?? -1) > layerIndex)
                .sort((left, right) => (lastUseIndex.get(right) ?? -1) - (lastUseIndex.get(left) ?? -1))[0]
              if (evictable) decodedImages.delete(evictable)
              else {
                const pendingDecode = pendingImages.values().next().value
                if (pendingDecode) await pendingDecode
                else throw new Error('Não foi possível liberar uma imagem para continuar renderizando o print.')
              }
            }
            if (!pending && !decodedImages.has(source)) pending = startLoading(source)
          }
          image = await pending
          return image
        }

        fillDecodeWindow()
        for (const [index, layer] of layers.entries()) {
          if ('source' in layer) {
            const image = await getImage(layer.source, index)
            layer.draw(image)
            if (lastUseIndex.get(layer.source) === index) decodedImages.delete(layer.source)
          } else layer.draw()
          fillDecodeWindow()
        }
        resolve(canvas.toDataURL(mimeType, mimeType === 'image/jpeg' ? 0.78 : undefined))
      } catch (reason) { reject(reason) }
    })()
  })
}

export function makeStudioThumbnail(studio: StudioDocument): Promise<string> {
  return makeCanvasPrint(studio, 480, 270, 'image/jpeg')
}

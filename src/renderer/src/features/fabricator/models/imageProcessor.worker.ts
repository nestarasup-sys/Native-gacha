import { despillGreenFringes, sampleBackground } from './chroma'
import type { ImageProcessorMessage, ImageProcessorRequest } from './imageProcessorProtocol'
import { inferImportedModelPartName, isHeadFragmentCandidate, mergeHeadFragments } from './imageProcessorNaming'

const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<ImageProcessorRequest>) => void) | null
  postMessage: (message: ImageProcessorMessage, transfer?: Transferable[]) => void
}

workerScope.onmessage = async (event: MessageEvent<ImageProcessorRequest>) => {
  const { id, sourceDataUrl, tolerance } = event.data
  try {
    const source = await createImageBitmap(await (await fetch(sourceDataUrl)).blob())
    if (source.width * source.height > 32_000_000) throw new Error('Esta imagem tem mais de 32 milhões de pixels. Reduza suas dimensões para continuar com segurança.')
    const canvas = new OffscreenCanvas(source.width, source.height)
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) throw new Error('Não foi possível preparar a imagem para edição.')
    context.drawImage(source, 0, 0)
    const image = context.getImageData(0, 0, source.width, source.height)
    const pixels = image.data
    const originalPixels = new Uint8ClampedArray(pixels)
    const background = sampleBackground(pixels, source.width, source.height)
    const keyed = new Uint8Array(source.width * source.height)
    const foregroundBounds = { minX: source.width, minY: source.height, maxX: -1, maxY: -1 }
    let foregroundPixelCount = 0
    const feather = 44
    for (let offset = 0, pixel = 0; offset < pixels.length; offset += 4, pixel += 1) {
      const distance = Math.hypot(pixels[offset] - background[0], pixels[offset + 1] - background[1], pixels[offset + 2] - background[2])
      if (distance <= tolerance) pixels[offset + 3] = 0
      else if (distance < tolerance + feather) {
        const matte = (distance - tolerance) / feather
        if (matte < 0.12) pixels[offset + 3] = 0
        else {
          const backgroundWeight = 1 - matte
          pixels[offset] = clampChannel((pixels[offset] - background[0] * backgroundWeight) / matte)
          pixels[offset + 1] = clampChannel((pixels[offset + 1] - background[1] * backgroundWeight) / matte)
          pixels[offset + 2] = clampChannel((pixels[offset + 2] - background[2] * backgroundWeight) / matte)
          pixels[offset + 3] = Math.round(pixels[offset + 3] * matte)
        }
      }
      if (pixels[offset + 3] > 24) {
        keyed[pixel] = 1
        foregroundPixelCount += 1
        const x = pixel % source.width
        const y = Math.floor(pixel / source.width)
        if (x < foregroundBounds.minX) foregroundBounds.minX = x
        if (x > foregroundBounds.maxX) foregroundBounds.maxX = x
        if (y < foregroundBounds.minY) foregroundBounds.minY = y
        if (y > foregroundBounds.maxY) foregroundBounds.maxY = y
      }
    }
    despillGreenFringes(pixels, background, tolerance)
    context.putImageData(image, 0, 0)

    const total = source.width * source.height
    const visited = new Uint8Array(total)
    const queue = new Int32Array(total)
    let parts: Extract<ImageProcessorMessage, { type: 'complete' }>['parts'] = []
    const headFragmentIds = new Set<string>()
    let progress = 0
    for (let start = 0; start < total; start += 1) {
      if (!keyed[start] || visited[start]) continue
      let read = 0
      let write = 0
      queue[write++] = start
      visited[start] = 1
      let minX = source.width; let minY = source.height; let maxX = 0; let maxY = 0
      while (read < write) {
        const index = queue[read++]
        const x = index % source.width
        const y = Math.floor(index / source.width)
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
        if (x > 0) visit(index - 1)
        if (x + 1 < source.width) visit(index + 1)
        if (y > 0) visit(index - source.width)
        if (y + 1 < source.height) visit(index + source.width)
      }
      function visit(index: number): void {
        if (keyed[index] && !visited[index]) { visited[index] = 1; queue[write++] = index }
      }
      if (write < 80) continue
      const cropMinX = Math.max(0, minX - 4)
      const cropMinY = Math.max(0, minY - 4)
      const cropMaxX = Math.min(source.width - 1, maxX + 4)
      const cropMaxY = Math.min(source.height - 1, maxY + 4)
      const width = cropMaxX - cropMinX + 1
      const height = cropMaxY - cropMinY + 1
      const partCanvas = new OffscreenCanvas(width, height)
      const partContext = partCanvas.getContext('2d', { willReadFrequently: true })
      if (!partContext) continue
      const partImage = partContext.createImageData(width, height)
      for (let cursor = 0; cursor < write; cursor += 1) {
        const index = queue[cursor]
        const x = index % source.width
        const y = Math.floor(index / source.width)
        const sourceOffset = index * 4
        const targetOffset = ((y - cropMinY) * width + x - cropMinX) * 4
        partImage.data[targetOffset] = pixels[sourceOffset]
        partImage.data[targetOffset + 1] = pixels[sourceOffset + 1]
        partImage.data[targetOffset + 2] = pixels[sourceOffset + 2]
        partImage.data[targetOffset + 3] = pixels[sourceOffset + 3]
      }
      partContext.putImageData(partImage, 0, 0)
      const blob = await partCanvas.convertToBlob({ type: 'image/png' })
      const png = await blob.arrayBuffer()
      // Preserve the component and a narrow anti-alias fringe from the source.
      // Reapplying chroma can then move in either direction without bringing
      // back the entire rectangular crop or neighboring body parts.
      const baseImage = new ImageData(width, height)
      const componentPixels = new Uint8Array(width * height)
      const fringeRadius = 4
      for (let cursor = 0; cursor < write; cursor += 1) {
        const index = queue[cursor]
        const x = index % source.width
        const y = Math.floor(index / source.width)
        for (let dy = -fringeRadius; dy <= fringeRadius; dy += 1) for (let dx = -fringeRadius; dx <= fringeRadius; dx += 1) {
          const sourceX = x + dx
          const sourceY = y + dy
          if (sourceX < cropMinX || sourceY < cropMinY || sourceX > cropMaxX || sourceY > cropMaxY) continue
          const localIndex = (sourceY - cropMinY) * width + sourceX - cropMinX
          componentPixels[localIndex] = 1
        }
      }
      for (let localIndex = 0; localIndex < componentPixels.length; localIndex += 1) {
        if (!componentPixels[localIndex]) continue
        const sourceX = cropMinX + localIndex % width
        const sourceY = cropMinY + Math.floor(localIndex / width)
        const sourceOffset = (sourceY * source.width + sourceX) * 4
        const targetOffset = localIndex * 4
        baseImage.data[targetOffset] = originalPixels[sourceOffset]
        baseImage.data[targetOffset + 1] = originalPixels[sourceOffset + 1]
        baseImage.data[targetOffset + 2] = originalPixels[sourceOffset + 2]
        baseImage.data[targetOffset + 3] = originalPixels[sourceOffset + 3]
      }
      const baseCanvas = new OffscreenCanvas(width, height)
      const baseContext = baseCanvas.getContext('2d')
      if (!baseContext) continue
      baseContext.putImageData(baseImage, 0, 0)
      const basePng = await (await baseCanvas.convertToBlob({ type: 'image/png' })).arrayBuffer()
      const namingInput = {
        partBounds: { minX, minY, maxX, maxY },
        sourceWidth: source.width,
        sourceHeight: source.height,
        foregroundBounds,
        componentPixelCount: write,
        foregroundPixelCount
      }
      const partId = crypto.randomUUID()
      if (isHeadFragmentCandidate(namingInput)) headFragmentIds.add(partId)
      parts.push({
        id: partId,
        name: inferImportedModelPartName(namingInput),
        x: cropMinX, y: cropMinY, width, height, png, basePng
      })
      progress += write
      if (parts.length % 2 === 0) workerScope.postMessage({ type: 'progress', id, value: Math.min(96, Math.round(progress / total * 100)) })
    }
    parts = await mergeHeadFragments(parts, headFragmentIds, composePartImages)
    parts.sort((a, b) => a.y - b.y || a.x - b.x)
    workerScope.postMessage({ type: 'complete', id, width: source.width, height: source.height, parts }, parts.flatMap((part) => [part.png, part.basePng]))
    source.close()
  } catch (error) {
    workerScope.postMessage({ type: 'error', id, message: error instanceof Error ? error.message : 'Falha ao processar imagem.' })
  }
}

function clampChannel(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)))
}

async function composePartImages(parts: Extract<ImageProcessorMessage, { type: 'complete' }>['parts']): Promise<(typeof parts)[number]> {
  const x = Math.min(...parts.map((part) => part.x))
  const y = Math.min(...parts.map((part) => part.y))
  const right = Math.max(...parts.map((part) => part.x + part.width))
  const bottom = Math.max(...parts.map((part) => part.y + part.height))
  const width = right - x
  const height = bottom - y

  const compose = async (key: 'png' | 'basePng') => {
    const canvas = new OffscreenCanvas(width, height)
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) throw new Error('Não foi possível unir a cabeça e os recortes próximos.')
    const combined = context.createImageData(width, height)
    for (const part of parts) {
      const bitmap = await createImageBitmap(new Blob([part[key]], { type: 'image/png' }))
      const partCanvas = new OffscreenCanvas(part.width, part.height)
      const partContext = partCanvas.getContext('2d', { willReadFrequently: true })
      if (!partContext) {
        bitmap.close()
        throw new Error('Não foi possível preparar um recorte da cabeça.')
      }
      partContext.drawImage(bitmap, 0, 0)
      bitmap.close()
      const source = partContext.getImageData(0, 0, part.width, part.height).data
      for (let py = 0; py < part.height; py += 1) for (let px = 0; px < part.width; px += 1) {
        const sourceOffset = (py * part.width + px) * 4
        const targetOffset = ((part.y - y + py) * width + part.x - x + px) * 4
        if (source[sourceOffset + 3] <= combined.data[targetOffset + 3]) continue
        combined.data[targetOffset] = source[sourceOffset]
        combined.data[targetOffset + 1] = source[sourceOffset + 1]
        combined.data[targetOffset + 2] = source[sourceOffset + 2]
        combined.data[targetOffset + 3] = source[sourceOffset + 3]
      }
    }
    context.putImageData(combined, 0, 0)
    return (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer()
  }

  const [png, basePng] = await Promise.all([compose('png'), compose('basePng')])
  return { ...parts[0], x, y, width, height, png, basePng }
}

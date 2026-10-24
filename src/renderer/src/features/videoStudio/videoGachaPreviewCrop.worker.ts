export {}

type CropRequest = { id: number; bitmap: ImageBitmap }
type CropResponse = {
  id: number
  bitmap?: ImageBitmap
  width?: number
  height?: number
  crop?: { width: number; height: number } | null
  error?: string
}
const scope = self as unknown as {
  postMessage(message: CropResponse, transfer?: Transferable[]): void
}

self.addEventListener('message', (event: MessageEvent<CropRequest>) => {
  const { id, bitmap } = event.data
  try {
    const width = bitmap.width
    const height = bitmap.height
    if (!width || !height) throw new Error('Empty source canvas')
    const source = new OffscreenCanvas(width, height)
    const ctx = source.getContext('2d', { willReadFrequently: true })
    if (!ctx) throw new Error('No worker canvas context')
    ctx.drawImage(bitmap, 0, 0)
    bitmap.close()
    // Same >8 alpha cutoff and full-frame fallback as the legacy crop helper.
    let left = 0, top = 0, destW = width, destH = height
    let crop: { width: number; height: number } | null = null
    try {
      const rgba = ctx.getImageData(0, 0, width, height).data
      let x0 = width, y0 = height, x1 = -1, y1 = -1
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (rgba[(y * width + x) * 4 + 3] <= 8) continue
          if (x < x0) x0 = x
          if (x > x1) x1 = x
          if (y < y0) y0 = y
          if (y > y1) y1 = y
        }
      }
      if (x1 >= x0 && y1 >= y0) {
        const w = x1 - x0 + 1, h = y1 - y0 + 1
        if (x0 || y0 || w !== width || h !== height) {
          left = x0; top = y0; destW = w; destH = h
          crop = { width: w, height: h }
        }
      }
    } catch {
      // Matches the old behavior if reading pixels is blocked.
    }
    const destination = new OffscreenCanvas(destW, destH)
    const target = destination.getContext('2d')
    if (!target) throw new Error('No worker snapshot context')
    target.drawImage(source, left, top, destW, destH, 0, 0, destW, destH)
    const output = destination.transferToImageBitmap()
    scope.postMessage({ id, bitmap: output, width, height, crop }, [output])
  } catch (error) {
    bitmap.close()
    scope.postMessage({ id, error: error instanceof Error ? error.message : String(error) })
  }
})

import type { NativeImage } from 'electron'

/** Materialize the native readback before considering any resampling. */
export function exportBitmap(image: Pick<NativeImage, 'getSize' | 'toBitmap' | 'resize'>, width: number, height: number): Buffer {
  const size = image.getSize()
  const bitmap = image.toBitmap({ scaleFactor: 1 })
  const expectedBytes = width * height * 4
  if (size.width === width && size.height === height && bitmap.length === expectedBytes) return bitmap
  const resized = image.resize({ width, height, quality: 'best' }).toBitmap({ scaleFactor: 1 })
  if (resized.length !== expectedBytes) throw Error('Dimensões inesperadas do quadro exportado.')
  return resized
}

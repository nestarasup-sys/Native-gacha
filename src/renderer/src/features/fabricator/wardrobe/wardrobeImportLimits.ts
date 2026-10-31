/** Keep bitmap import bounds aligned with the sheet-processing worker.
 * These checks reject huge or malformed files before raster loops allocate buffers.
 * A decoded image may still use memory during createImageBitmap; no allocation guarantee.
 */
export const MAX_WARDROBE_IMPORT_FILE_BYTES = 50 * 1024 * 1024
export const MAX_WARDROBE_IMPORT_PIXELS = 32_000_000

export function assertWardrobeImportFile(file: Pick<File, 'size'>): void {
  if (!Number.isSafeInteger(file.size) || file.size < 1 || file.size > MAX_WARDROBE_IMPORT_FILE_BYTES) {
    throw new Error('A imagem deve ter entre 1 byte e 50 MB.')
  }
}

export function assertWardrobeBitmapBounds(bitmap: Pick<ImageBitmap, 'width' | 'height'>): void {
  const { width, height } = bitmap
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 ||
      width * height > MAX_WARDROBE_IMPORT_PIXELS) {
    throw new Error('A imagem tem mais de 32 milhões de pixels ou dimensões inválidas. Reduza a resolução para continuar.')
  }
}

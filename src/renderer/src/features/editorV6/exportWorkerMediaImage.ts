/** Load a CORS-enabled image from the export worker's scoped media protocol. */
export async function loadEditorV6WorkerMediaImage(url: string): Promise<ImageBitmap> {
  const image = new Image()
  image.crossOrigin = 'anonymous'
  image.src = url
  try {
    await image.decode()
    return await createImageBitmap(image)
  } finally {
    image.src = ''
  }
}

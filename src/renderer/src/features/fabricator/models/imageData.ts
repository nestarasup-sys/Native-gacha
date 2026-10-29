export function loadImageFromDataUrl(dataUrl: string, errorMessage: string, signal?: AbortSignal): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      const error = new Error('Carregamento de imagem cancelado.')
      error.name = 'AbortError'
      reject(error)
      return
    }
    const image = new Image()

    const cleanup = () => {
      image.onload = null
      image.onerror = null
      signal?.removeEventListener('abort', abort)
    }
    const abort = () => {
      cleanup()
      try { image.src = '' } catch { /* A decodificação já pode ter sido liberada pelo navegador. */ }
      const error = new Error('Carregamento de imagem cancelado.')
      error.name = 'AbortError'
      reject(error)
    }

    image.onload = () => { cleanup(); resolve(image) }
    image.onerror = () => { cleanup(); reject(new Error(errorMessage)) }
    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) { abort(); return }
    image.src = dataUrl
  })
}

export function pngDataUrlFromBuffer(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunkSize = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length)))
  }
  return `data:image/png;base64,${btoa(binary)}`
}

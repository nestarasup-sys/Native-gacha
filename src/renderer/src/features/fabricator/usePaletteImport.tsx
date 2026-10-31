import { useCallback, useEffect, useRef } from 'react'
import type { PaletteAssetKind, PaletteNormalizationReport, PaletteOverrides } from './paletteNormalizer'
import { normalizeEditableImageFile } from './normalizeImage'

interface WorkerResponse {
  id: number
  type: 'complete' | 'error'
  blob?: Blob
  report?: PaletteNormalizationReport
  message?: string
}

interface ActiveImport {
  worker: Worker
  resolve: (dataUrl: string | null) => void
}

function blobFromDataUrl(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(',')
  if (!dataUrl.startsWith('data:') || comma < 0) throw new Error('A imagem normalizada não tem um formato válido.')
  const metadata = dataUrl.slice(5, comma)
  const mimeType = metadata.split(';', 1)[0] || 'application/octet-stream'
  const payload = dataUrl.slice(comma + 1)
  if (!metadata.split(';').includes('base64')) return new Blob([decodeURIComponent(payload)], { type: mimeType })

  const parts: Uint8Array[] = []
  const chunkSize = 64 * 1024
  for (let start = 0; start < payload.length; start += chunkSize) {
    const binary = atob(payload.slice(start, start + chunkSize))
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index)
    parts.push(bytes)
  }
  return new Blob(parts, { type: mimeType })
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Não foi possível preparar a imagem normalizada.'))
    reader.onerror = () => reject(reader.error ?? new Error('Não foi possível preparar a imagem normalizada.'))
    reader.readAsDataURL(blob)
  })
}

export function usePaletteImport() {
  const sequenceRef = useRef(0)
  const activeRef = useRef<ActiveImport | null>(null)
  const mountedRef = useRef(false)

  const cancelActive = useCallback(() => {
    const active = activeRef.current
    activeRef.current = null
    active?.worker.terminate()
    active?.resolve(null)
  }, [])

  const requestPaletteImport = useCallback(async (file: File, kind: PaletteAssetKind): Promise<string | null> => {
    const id = ++sequenceRef.current
    cancelActive()
    const canonical = await normalizeEditableImageFile(file)
    if (!mountedRef.current || id !== sequenceRef.current) return null
    if (canonical.width * canonical.height > 32_000_000) throw new Error('A imagem tem mais de 32 milhões de pixels. Reduza as dimensões para continuar.')

    const canonicalBlob = blobFromDataUrl(canonical.dataUrl)
    const canonicalFile = new File([canonicalBlob], file.name, { type: canonicalBlob.type || 'image/png' })
    return new Promise((resolve, reject) => {
      const worker = new Worker(new URL('./paletteNormalizer.worker.ts', import.meta.url), { type: 'module' })
      const active: ActiveImport = { worker, resolve }
      activeRef.current = active

      const fail = (reason: unknown) => {
        if (activeRef.current !== active) return
        activeRef.current = null
        worker.terminate()
        reject(reason instanceof Error ? reason : new Error('Não foi possível normalizar as cores da imagem.'))
      }
      worker.onmessage = async ({ data }: MessageEvent<WorkerResponse>) => {
        if (activeRef.current !== active || data.id !== id) return
        if (data.type === 'error' || !data.blob || !data.report) {
          fail(new Error(data.message ?? 'Não foi possível normalizar a paleta.'))
          return
        }
        activeRef.current = null
        worker.terminate()
        try {
          const dataUrl = await blobToDataUrl(data.blob)
          resolve(mountedRef.current && id === sequenceRef.current ? dataUrl : null)
        }
        catch (reason) { reject(reason instanceof Error ? reason : new Error('Não foi possível preparar a imagem normalizada.')) }
      }
      worker.onerror = (event) => {
        event.preventDefault()
        fail(new Error('Falha ao processar a imagem localmente.'))
      }
      try { worker.postMessage({ id, file: canonicalFile, kind, overrides: {} satisfies PaletteOverrides, sensitivity: 55 }) }
      catch (reason) { fail(reason) }
    })
  }, [cancelActive])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      sequenceRef.current += 1
      cancelActive()
    }
  }, [cancelActive])

  return { requestPaletteImport }
}

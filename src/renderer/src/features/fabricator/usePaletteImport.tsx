import { useCallback, useEffect, useRef, useState } from 'react'
import { PaletteImportReviewModal } from './PaletteImportReviewModal'
import type { PaletteAssetKind } from './paletteNormalizer'
import { normalizeEditableImageFile } from './normalizeImage'

type PendingPaletteImport = { id: number; file: File; kind: PaletteAssetKind }

export function usePaletteImport() {
  const [pending, setPending] = useState<PendingPaletteImport | null>(null)
  const sequenceRef = useRef(0)
  const resolveRef = useRef<((dataUrl: string | null) => void) | null>(null)
  const mountedRef = useRef(false)

  const requestPaletteImport = useCallback(async (file: File, kind: PaletteAssetKind): Promise<string | null> => {
    const canonical = await normalizeEditableImageFile(file)
    if (canonical.width * canonical.height > 32_000_000) throw new Error('A imagem tem mais de 32 milhões de pixels. Reduza as dimensões para continuar.')
    if (!mountedRef.current) return null
    const blob = await (await fetch(canonical.dataUrl)).blob()
    if (!mountedRef.current) return null
    const canonicalFile = new File([blob], file.name, { type: 'image/png' })
    return new Promise((resolve) => {
      resolveRef.current?.(null)
      const id = ++sequenceRef.current
      resolveRef.current = resolve
      setPending({ id, file: canonicalFile, kind })
    })
  }, [])

  const finish = useCallback((dataUrl: string | null) => {
    const resolve = resolveRef.current
    resolveRef.current = null
    setPending(null)
    resolve?.(dataUrl)
  }, [])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      resolveRef.current?.(null)
      resolveRef.current = null
    }
  }, [])

  const modal = pending && <PaletteImportReviewModal key={pending.id} file={pending.file} kind={pending.kind} onCancel={() => finish(null)} onConfirm={finish} />
  return { requestPaletteImport, paletteImportModal: modal }
}

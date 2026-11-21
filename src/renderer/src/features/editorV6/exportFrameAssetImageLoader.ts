type RenderAsset = { id: string; name: string; dataUrl: string }
export type EditorV6AssetDecodeDiagnostic = { index: number; state: 'loading' | 'decoding' | 'waiting-cache' | 'ready' | 'failed'; mime: string; bytes: number }
const MAX_CONCURRENT_IMAGE_DECODES = 4

/** Preloads only the currently selected render assets into a bounded worker-local decode cache. */
export function createEditorV6ExportFrameAssetImageLoader(
  images: Map<string, Promise<void>>,
  onDiagnostic?: (status: EditorV6AssetDecodeDiagnostic) => void
) {
  const decoded = new WeakSet<Promise<void>>()
  const touch = (id: string, prepared: Promise<void>) => {
    images.delete(id)
    images.set(id, prepared)
  }

  const prepareImage = (asset: RenderAsset, index: number): Promise<void> | undefined => {
    let prepared = images.get(asset.id)
    if (prepared && decoded.has(prepared)) {
      touch(asset.id, prepared)
      return undefined
    }
    const diagnostic = onDiagnostic ? {
      index,
      mime: /^data:([^;,]+)/.exec(asset.dataUrl)?.[1] ?? /^([a-z][a-z\d+.-]*):/i.exec(asset.dataUrl)?.[1] ?? 'unknown',
      bytes: asset.dataUrl.length
    } : undefined
    const report = (state: EditorV6AssetDecodeDiagnostic['state']) => {
      if (diagnostic) onDiagnostic?.({ ...diagnostic, state })
    }
    if (!prepared) {
      prepared = new Promise<void>((resolve, reject) => {
        const image = new Image()
        image.onerror = () => { report('failed'); reject(Error(`Não foi possível preparar ${asset.name}.`)) }
        image.onload = () => {
          report('decoding')
          void image.decode().then(resolve, () => { report('failed'); reject(Error(`Não foi possível decodificar ${asset.name}.`)) })
        }
        report('loading')
        // The worker's scoped media protocol requires CORS mode. The hair and
        // native renderers already set this before loading the same URLs.
        if (asset.dataUrl.startsWith('gacha-editor-media://')) image.crossOrigin = 'anonymous'
        image.src = asset.dataUrl
      })
      if (images.size >= 32) images.delete(images.keys().next().value!)
      images.set(asset.id, prepared)
    } else {
      report('waiting-cache')
      // Map insertion order is the worker-local LRU order.
      touch(asset.id, prepared)
    }
    const current = prepared
    return current.then(() => {
      decoded.add(current)
      report('ready')
    }, (error: unknown) => {
      // A failed decode must not poison later attempts for this asset.
      if (images.get(asset.id) === current) images.delete(asset.id)
      throw error
    })
  }

  const prepare = async (assets: readonly RenderAsset[]) => {
    for (let index = 0; index < assets.length; index += MAX_CONCURRENT_IMAGE_DECODES) {
      let pending: Promise<void>[] | undefined
      const end = Math.min(index + MAX_CONCURRENT_IMAGE_DECODES, assets.length)
      for (let position = index; position < end; position++) {
        const preparation = prepareImage(assets[position], position)
        if (preparation) (pending ??= []).push(preparation)
      }
      if (!pending) continue
      const results = await Promise.allSettled(pending)
      const failure = results.find(result => result.status === 'rejected')
      if (failure) throw failure.reason
    }
  }

  return { prepare }
}

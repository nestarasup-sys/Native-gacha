/** Contrato compartilhado para normalizar imagens rasterizadas durante a importação. */
export type CanonicalImageImport = {
  dataUrl: string
  width: number
  height: number
  bitDepth: 8 | 16
  sourceBytes: number
  outputBytes: number
}

export type ImageImportDesktopApi = {
  normalizeForImport: (bytes: Uint8Array) => Promise<CanonicalImageImport>
}

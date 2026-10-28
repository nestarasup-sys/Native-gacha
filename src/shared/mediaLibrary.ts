/** Contratos da biblioteca compartilhada de mídia, independente dos documentos que a referenciam. */
export type VideoLibraryItem = {
  id: string
  name: string
  mimeType: 'video/mp4' | 'video/webm' | 'video/quicktime' | 'video/x-m4v'
  extension: 'mp4' | 'webm' | 'mov' | 'm4v'
  size: number
  durationFrames: number | null
  createdAt: string
  available: boolean
}

/** Snapshot da referência persistida em um documento; o arquivo sempre se resolve pelo id. */
export type VideoLibraryReference = Pick<VideoLibraryItem, 'id' | 'name' | 'mimeType' | 'extension' | 'size'> & {
  durationFrames: number
}

export type MediaLibraryDesktopApi = {
  list: () => Promise<VideoLibraryItem[]>
  import: () => Promise<VideoLibraryItem | null>
  finishImport: (id: string, durationFrames: number) => Promise<VideoLibraryItem>
  delete: (id: string) => Promise<void>
  rename: (id: string, name: string) => Promise<VideoLibraryItem>
}

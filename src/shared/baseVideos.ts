/** Contratos próprios da Base de Vídeos; o conteúdo dos roteiros só mantém referências por ID. */
export type VideoTimeline = 'unspecified' | 'past' | 'present' | 'future'

export type BaseVideoDetails = {
  videoId: string
  videoNumber?: number
  categoryId?: string | null
  description: string
  timeline: VideoTimeline
  sceneEndSeconds?: number
  firstGroupReactionSeconds?: number
  secondGroupReactionSeconds?: number
  additionalContext?: string
}

export type BaseVideoCategory = { id: string; name: string; color: string; createdAt: string }

export type BaseVideosDesktopApi = {
  listDetails: () => Promise<BaseVideoDetails[]>
  saveDetails: (details: BaseVideoDetails) => Promise<void>
  listCategories: () => Promise<BaseVideoCategory[]>
  createCategory: (name: string) => Promise<BaseVideoCategory>
  renameCategory: (id: string, name: string) => Promise<BaseVideoCategory>
  deleteCategory: (id: string) => Promise<void>
  deleteDetails: (videoId: string) => Promise<void>
  deleteVideo: (videoId: string) => Promise<void>
  publish: (videoId: string) => Promise<number>
}

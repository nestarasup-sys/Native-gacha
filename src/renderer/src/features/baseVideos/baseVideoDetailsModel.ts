import type { BaseVideoDetails } from '../../../../shared/baseVideos'

export function createEmptyBaseVideoDetails(videoId: string): BaseVideoDetails {
  return { videoId, categoryId: null, description: '', additionalContext: '', timeline: 'unspecified' }
}

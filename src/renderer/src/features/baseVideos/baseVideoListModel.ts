import type { BaseVideoDetails, VideoTimeline } from '../../../../shared/baseVideos'
import type { VideoLibraryItem } from '../../../../shared/mediaLibrary'

export type BaseVideoListView = 'main' | 'drafts'
export type BaseVideoListSort = 'order' | 'name' | 'duration' | 'newest'
export type BaseVideoTimelineFilter = 'all' | VideoTimeline

type SelectVisibleBaseVideosOptions = {
  activeView: BaseVideoListView
  search: string
  timelineFilter: BaseVideoTimelineFilter
  sort: BaseVideoListSort
}

const detailsFor = (videoId: string, detailsById: Readonly<Record<string, BaseVideoDetails>>) =>
  detailsById[videoId] ?? { videoId, description: '', timeline: 'unspecified' as const, additionalContext: '' }

/** Applies the Base de Vídeos search, view, timeline and ordering rules without mutating inputs. */
export function selectVisibleBaseVideos(
  items: readonly VideoLibraryItem[],
  detailsById: Readonly<Record<string, BaseVideoDetails>>,
  { activeView, search, timelineFilter, sort }: SelectVisibleBaseVideosOptions
): VideoLibraryItem[] {
  const query = search.trim().toLocaleLowerCase('pt-BR')

  return items.filter((item) => {
    const details = detailsFor(item.id, detailsById)
    const matchesQuery = !query
      || item.name.toLocaleLowerCase('pt-BR').includes(query)
      || item.id.toLocaleLowerCase('pt-BR').includes(query)
      || String(details.videoNumber ?? '').includes(query)
      || details.description.toLocaleLowerCase('pt-BR').includes(query)
      || (details.additionalContext ?? '').toLocaleLowerCase('pt-BR').includes(query)

    return matchesQuery
      && (timelineFilter === 'all' || details.timeline === timelineFilter)
      && (activeView === 'drafts' ? details.videoNumber === undefined : details.videoNumber !== undefined)
  }).sort((a, b) => {
    const numberA = detailsById[a.id]?.videoNumber
    const numberB = detailsById[b.id]?.videoNumber
    if (sort === 'name') return a.name.localeCompare(b.name, 'pt-BR')
    if (sort === 'duration') return (a.durationFrames ?? 0) - (b.durationFrames ?? 0)
    if (sort === 'newest') return b.createdAt.localeCompare(a.createdAt)
    if (activeView === 'main') return (numberA ?? Number.MAX_SAFE_INTEGER) - (numberB ?? Number.MAX_SAFE_INTEGER)
    return b.createdAt.localeCompare(a.createdAt)
  })
}

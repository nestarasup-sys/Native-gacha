import type { BaseVideoDetails } from '../../../../shared/baseVideos'
import type { VideoLibraryItem } from '../../../../shared/mediaLibrary'

export type EditorV6VideoPickerView = 'main' | 'drafts'
export type EditorV6VideoPickerTimeline = 'all' | BaseVideoDetails['timeline']
export type EditorV6VideoPickerSort = 'number' | 'name' | 'duration' | 'newest'

type VideoPickerOptions = { view: EditorV6VideoPickerView; query: string; timeline: EditorV6VideoPickerTimeline; sort: EditorV6VideoPickerSort }

const videoNameCollator = new Intl.Collator('pt-BR')

export function prepareEditorV6VideoPickerItems(
  items: readonly VideoLibraryItem[],
  details: Readonly<Record<string, BaseVideoDetails>>,
  options: Omit<VideoPickerOptions, 'query'>
) {
  const candidates = items.filter((item) => {
    const detail = details[item.id]
    const isDraft = detail?.videoNumber === undefined
    return item.available && (options.view === 'drafts' ? isDraft : !isDraft)
      && (options.timeline === 'all' || (detail?.timeline ?? 'unspecified') === options.timeline)
  }).sort((left, right) => {
    if (options.sort === 'name') return videoNameCollator.compare(left.name, right.name)
    if (options.sort === 'duration') return (left.durationFrames ?? 0) - (right.durationFrames ?? 0)
    if (options.sort === 'newest' || options.view === 'drafts') return right.createdAt.localeCompare(left.createdAt)
    return (details[left.id]?.videoNumber ?? Number.MAX_SAFE_INTEGER) - (details[right.id]?.videoNumber ?? Number.MAX_SAFE_INTEGER)
  })
  return candidates.map((item) => ({
    item,
    fields: [item.name.toLocaleLowerCase('pt-BR'), item.id.toLocaleLowerCase(),
      String(details[item.id]?.videoNumber ?? ''), (details[item.id]?.description ?? '').toLocaleLowerCase('pt-BR')]
  }))
}

export function searchEditorV6VideoPickerItems(candidates: ReturnType<typeof prepareEditorV6VideoPickerItems>, query: string): VideoLibraryItem[] {
  const search = query.trim().toLocaleLowerCase('pt-BR')
  return (search ? candidates.filter(({ fields }) => fields.some((field) => field.includes(search))) : candidates).map(({ item }) => item)
}

export function filterAndSortEditorV6Videos(items: readonly VideoLibraryItem[], details: Readonly<Record<string, BaseVideoDetails>>, options: VideoPickerOptions): VideoLibraryItem[] {
  return searchEditorV6VideoPickerItems(prepareEditorV6VideoPickerItems(items, details, options), options.query)
}

export function editorV6VideoPickerEmptyState(
  items: readonly VideoLibraryItem[],
  details: Readonly<Record<string, BaseVideoDetails>>,
  view: EditorV6VideoPickerView
): { title: string; hint: string } {
  const hasItemsInSection = items.some((item) => item.available
    && (view === 'drafts' ? details[item.id]?.videoNumber === undefined : details[item.id]?.videoNumber !== undefined))
  if (hasItemsInSection) return { title: 'Nenhum resultado para essa busca', hint: 'Tente outro nome ou ajuste os filtros.' }
  return view === 'main'
    ? { title: 'A Base de vídeos está vazia', hint: 'Vídeos publicados na Base aparecem aqui. Rascunhos ficam na aba ao lado.' }
    : { title: 'Nenhum vídeo nos Rascunhos', hint: 'Importe um vídeo para adicioná-lo aos Rascunhos.' }
}

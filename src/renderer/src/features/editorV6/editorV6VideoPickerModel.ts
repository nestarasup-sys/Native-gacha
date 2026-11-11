import type { BaseVideoDetails } from '../../../../shared/baseVideos'
import type { VideoLibraryItem } from '../../../../shared/mediaLibrary'

export type EditorV6VideoPickerView = 'main' | 'drafts'
export type EditorV6VideoPickerTimeline = 'all' | BaseVideoDetails['timeline']
export type EditorV6VideoPickerSort = 'number' | 'name' | 'duration' | 'newest'

export function filterAndSortEditorV6Videos(
  items: readonly VideoLibraryItem[],
  details: Readonly<Record<string, BaseVideoDetails>>,
  options: { view: EditorV6VideoPickerView; query: string; timeline: EditorV6VideoPickerTimeline; sort: EditorV6VideoPickerSort }
): VideoLibraryItem[] {
  const search = options.query.trim().toLocaleLowerCase('pt-BR')
  return items.filter((item) => {
    const detail = details[item.id]
    const isDraft = detail?.videoNumber === undefined
    return item.available && (options.view === 'drafts' ? isDraft : !isDraft)
      && (!search || item.name.toLocaleLowerCase('pt-BR').includes(search)
        || item.id.toLocaleLowerCase().includes(search)
        || String(detail?.videoNumber ?? '').includes(search)
        || (detail?.description ?? '').toLocaleLowerCase('pt-BR').includes(search))
      && (options.timeline === 'all' || (detail?.timeline ?? 'unspecified') === options.timeline)
  }).sort((left, right) => {
    if (options.sort === 'name') return left.name.localeCompare(right.name, 'pt-BR')
    if (options.sort === 'duration') return (left.durationFrames ?? 0) - (right.durationFrames ?? 0)
    if (options.sort === 'newest' || options.view === 'drafts') return right.createdAt.localeCompare(left.createdAt)
    return (details[left.id]?.videoNumber ?? Number.MAX_SAFE_INTEGER) - (details[right.id]?.videoNumber ?? Number.MAX_SAFE_INTEGER)
  })
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

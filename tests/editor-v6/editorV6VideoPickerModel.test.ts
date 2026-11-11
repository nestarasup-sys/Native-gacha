import { describe, expect, it } from 'vitest'
import type { BaseVideoDetails } from '../../src/shared/baseVideos'
import type { VideoLibraryItem } from '../../src/shared/mediaLibrary'
import { editorV6VideoPickerEmptyState, filterAndSortEditorV6Videos } from '../../src/renderer/src/features/editorV6/editorV6VideoPickerModel'

function video(id: string, name: string, overrides: Partial<VideoLibraryItem> = {}): VideoLibraryItem {
  return { id, name, available: true, durationFrames: 300, createdAt: '2026-01-01', size: 1024, ...overrides } as VideoLibraryItem
}

function detail(videoNumber: number, overrides: Partial<BaseVideoDetails> = {}): BaseVideoDetails {
  return { videoId: '', videoNumber, categoryId: null, description: '', additionalContext: '', timeline: 'unspecified', ...overrides } as BaseVideoDetails
}

const defaults = { view: 'main' as const, query: '', timeline: 'all' as const, sort: 'number' as const }

describe('modelo da galeria de vídeos do Editor V6', () => {
  it('filters availability, published/draft status, text and timeline, then orders published videos by number', () => {
    const items = [
      video('v20', 'Lua nova', { createdAt: '2026-03-01' }),
      video('v3', 'Sol', { createdAt: '2026-02-01' }),
      video('draft', 'Futuro rascunho'),
      video('missing', 'Indisponível', { available: false })
    ]
    const details = {
      v20: detail(20, { timeline: 'future', description: 'um roteiro lunar' }),
      v3: detail(3, { timeline: 'past' }),
      draft: detail(undefined as unknown as number, { description: 'anotação secreta', timeline: 'future' })
    }

    expect(filterAndSortEditorV6Videos(items, details, defaults).map(item => item.id)).toEqual(['v3', 'v20'])
    expect(filterAndSortEditorV6Videos(items, details, { ...defaults, query: '  ROTEIRO LUNAR ' }).map(item => item.id)).toEqual(['v20'])
    expect(filterAndSortEditorV6Videos(items, details, { ...defaults, view: 'drafts', query: 'anotação' }).map(item => item.id)).toEqual(['draft'])
    expect(filterAndSortEditorV6Videos(items, details, { ...defaults, timeline: 'future' }).map(item => item.id)).toEqual(['v20'])
  })

  it('keeps locale name sorting, duration sorting and newest-first draft ordering', () => {
    const items = [
      video('draft-old', 'Alfa', { createdAt: '2026-01-01', durationFrames: 600 }),
      video('draft-new', 'Beta', { createdAt: '2026-03-01', durationFrames: null }),
      video('draft-mid', 'Água', { createdAt: '2026-02-01', durationFrames: 300 })
    ]
    expect(filterAndSortEditorV6Videos(items, {}, { ...defaults, view: 'drafts', sort: 'name' }).map(item => item.id)).toEqual(['draft-mid', 'draft-old', 'draft-new'])
    expect(filterAndSortEditorV6Videos(items, {}, { ...defaults, view: 'drafts', sort: 'duration' }).map(item => item.id)).toEqual(['draft-new', 'draft-mid', 'draft-old'])
    expect(filterAndSortEditorV6Videos(items, {}, { ...defaults, view: 'drafts', sort: 'number' }).map(item => item.id)).toEqual(['draft-new', 'draft-mid', 'draft-old'])
  })

  it('distinguishes an empty section from a section with no search matches', () => {
    expect(editorV6VideoPickerEmptyState([], {}, 'main')).toEqual({ title: 'A Base de vídeos está vazia', hint: 'Vídeos publicados na Base aparecem aqui. Rascunhos ficam na aba ao lado.' })
    expect(editorV6VideoPickerEmptyState([], {}, 'drafts')).toEqual({ title: 'Nenhum vídeo nos Rascunhos', hint: 'Importe um vídeo para adicioná-lo aos Rascunhos.' })
    expect(editorV6VideoPickerEmptyState([video('v1', 'Vídeo')], { v1: detail(1) }, 'main')).toEqual({ title: 'Nenhum resultado para essa busca', hint: 'Tente outro nome ou ajuste os filtros.' })
  })
})

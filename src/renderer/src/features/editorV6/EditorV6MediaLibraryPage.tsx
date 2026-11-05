import { useCallback, useEffect, useState } from 'react'
import type { EditorV6LibraryMediaItem } from '../../../../shared/editorV6'
import type { VideoBackgroundLibraryItem } from '../../../../shared/studio'
import { Icon } from '../../ui/components/Icon'
import './editorV6MediaLibrary.css'

type Category = 'background' | 'object' | 'audio'
const titles: Record<Category, { label: string; description: string }> = {
  background: { label: 'Fundos', description: 'Fundos compartilhados com Roteiros e Editor V6. Os projetos guardam somente o ID do item.' },
  object: { label: 'Objetos', description: 'Imagens que podem ser reutilizadas como objetos de cena em vários roteiros.' },
  audio: { label: 'Áudios', description: 'Faixas reutilizáveis por ID na timeline e na mixagem de exportação do Editor V6.' }
}

export function EditorV6MediaLibraryPage() {
  const [category, setCategory] = useState<Category>('background')
  const [backgrounds, setBackgrounds] = useState<VideoBackgroundLibraryItem[]>([])
  const [items, setItems] = useState<EditorV6LibraryMediaItem[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      if (category === 'background') setBackgrounds(await window.desktop.videoBackgrounds.listVideoBackgroundLibrary())
      else setItems(await window.desktop.editorV6MediaLibrary.list(category))
      setError('')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível carregar a biblioteca.') }
    finally { setLoading(false) }
  }, [category])
  useEffect(() => { void refresh() }, [refresh])

  const add = async () => {
    setBusy(true); setError('')
    try {
      if (category === 'background') await window.desktop.videoBackgrounds.importVideoBackground()
      else await window.desktop.editorV6MediaLibrary.import(category)
      await refresh()
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível adicionar a mídia.') }
    finally { setBusy(false) }
  }
  const rename = async (item: VideoBackgroundLibraryItem | EditorV6LibraryMediaItem) => {
    const name = window.prompt('Nome do item', item.name)
    if (name === null || name.trim() === item.name) return
    setBusy(true)
    try {
      if (category === 'background') await window.desktop.videoBackgrounds.renameVideoBackground(item.id, name)
      else await window.desktop.editorV6MediaLibrary.rename(category, item.id, name)
      await refresh()
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível renomear o item.') }
    finally { setBusy(false) }
  }
  const remove = async (item: VideoBackgroundLibraryItem | EditorV6LibraryMediaItem) => {
    if (!window.confirm(`Excluir “${item.name}” da biblioteca? Itens em uso serão protegidos.`)) return
    setBusy(true)
    try {
      if (category === 'background') await window.desktop.videoBackgrounds.deleteVideoBackground(item.id)
      else await window.desktop.editorV6MediaLibrary.delete(category, item.id)
      await refresh()
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível excluir o item.') }
    finally { setBusy(false) }
  }

  const allItems = category === 'background' ? backgrounds : items
  return <main className="v6-library-page">
    <header className="v6-library-header"><div className="v6-library-title"><span><Icon name="box" /></span><div><small>EDITOR V6 · ASSETS POR ID</small><h1>Biblioteca de mídia</h1><p>Uma fonte compartilhada para fundos, objetos e áudio. Os roteiros mantêm referências; os arquivos ficam aqui.</p></div></div><button className="v6-library-add" type="button" disabled={busy} onClick={() => void add()}><Icon name="plus" />Adicionar {titles[category].label.toLocaleLowerCase('pt-BR')}</button></header>
    <nav className="v6-library-tabs" aria-label="Bibliotecas de mídia">{(['background', 'object', 'audio'] as const).map((item) => <button type="button" key={item} className={category === item ? 'active' : ''} aria-pressed={category === item} onClick={() => setCategory(item)}>{titles[item].label}</button>)}</nav>
    <section className="v6-library-content"><div className="v6-library-section-heading"><div><h2>{titles[category].label}</h2><p>{titles[category].description}</p></div><span>{allItems.length} item(ns)</span></div>
      {error && <div className="v6-library-error" role="alert">{error}<button type="button" onClick={() => setError('')}>Fechar</button></div>}
      {loading ? <p className="v6-library-empty">Carregando biblioteca…</p> : allItems.length ? <div className="v6-library-grid">{allItems.map((item) => {
        const refs = category === 'background' ? [...(item as VideoBackgroundLibraryItem).studios, ...((item as VideoBackgroundLibraryItem).editorV6Projects ?? []).map((project) => ({ id: project.id, title: `V6 · ${project.title}` }))] : (item as EditorV6LibraryMediaItem).references.map((project) => ({ id: project.projectId, title: `V6 · ${project.title}` }))
        const preview = category === 'background' ? `gacha-background://library/${item.id}` : (item as EditorV6LibraryMediaItem).previewUrl
        const available = item.available
        return <article className="v6-library-card" key={item.id}>
          <div className="v6-library-preview">{preview && category !== 'audio' ? <img src={preview} alt="" /> : <span aria-hidden="true">{category === 'audio' ? '♫' : '▧'}</span>}{!available && <b>INDISPONÍVEL</b>}</div>
          <div className="v6-library-card-body"><strong title={item.name}>{item.name}</strong><small>ID {item.id}</small><small>{(item.size / 1024 ** 2).toFixed(2)} MB · {refs.length ? `usado por ${refs.map((ref) => ref.title).join(', ')}` : 'sem vínculos'}</small></div>
          <footer><button type="button" disabled={busy} onClick={() => void rename(item)}>Renomear</button><button type="button" disabled={busy || refs.length > 0} title={refs.length ? 'Remova os vínculos antes de excluir este item.' : undefined} onClick={() => void remove(item)}>Excluir</button></footer>
        </article>
      })}</div> : <div className="v6-library-empty"><strong>Biblioteca vazia</strong><span>Adicione um arquivo. Ele ficará disponível para reutilização por ID nos projetos do Editor V6.</span></div>}
    </section>
  </main>
}

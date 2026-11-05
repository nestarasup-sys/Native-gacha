import { useEffect, useMemo, useRef, useState } from 'react'
import type { CustomizerCharacter } from '../../../../shared/customizer'
import type { CharacterSheet, CharacterSheetRelationship } from '../../../../shared/roteiros'
import { registerPendingWriteFlusher } from '../../ui/pendingPersistence'
import { RenderedCharacterPortrait } from '../../ui/components/RenderedCharacterPortrait'

const emptySheet = (character: CustomizerCharacter): CharacterSheet => ({ characterId: character.id, characterName: character.name, personality: '', backstory: '', fynRelationship: '', speakingStyle: '', relationships: [], additionalRules: '', updatedAt: '' })
const fields = [
  { key: 'personality', label: 'Personalidade', hint: 'Como pensa, reage, demonstra ou esconde emoções.', rows: 5, limit: 12000, placeholder: 'Escreva sobre a personalidade do personagem…' },
  { key: 'backstory', label: 'História', hint: 'Passado, posição social, conhecimentos e acontecimentos importantes.', rows: 5, limit: 12000, placeholder: 'Escreva a história do personagem…' },
  { key: 'fynRelationship', label: 'Relação com FYN', hint: 'Sentimentos, confiança, conflitos e conhecimentos sobre FYN.', rows: 4, limit: 10000, placeholder: 'Descreva a relação com FYN…' },
  { key: 'speakingStyle', label: 'Estilo de fala', hint: 'Tom, vocabulário, formalidade e tamanho das frases.', rows: 4, limit: 8000, placeholder: 'Explique como o personagem fala…' },
  { key: 'additionalRules', label: 'Regras particulares', hint: 'Regras que devem ser respeitadas ao escrever este personagem.', rows: 4, limit: 10000, placeholder: 'Adicione regras específicas…' }
] as const

function completion(sheet: CharacterSheet): number {
  const filled = fields.filter(({ key }) => sheet[key].trim()).length + (sheet.relationships.some((item) => item.description.trim()) ? 1 : 0)
  return Math.round(filled / 6 * 100)
}

export function CharacterSheetsWorkspace({ characters }: { characters: CustomizerCharacter[] }) {
  const [sheets, setSheets] = useState<CharacterSheet[]>([])
  const [loaded, setLoaded] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'all' | 'incomplete' | 'complete'>('all')
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'error'>('saved')
  const latestByCharacterRef = useRef(new Map<string, CharacterSheet>())
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingRef = useRef<Promise<void> | null>(null)
  const saveChainRef = useRef<Promise<void>>(Promise.resolve())

  useEffect(() => {
    let cancelled = false
    void window.desktop.roteiros.listCharacterSheets().then((stored) => { if (!cancelled) { setSheets(stored); setLoaded(true); setLoadError('') } }).catch((error: unknown) => { if (!cancelled) { setLoadError(error instanceof Error ? error.message : 'Não foi possível carregar as fichas.'); setLoaded(true) } })
    return () => { cancelled = true }
  }, [])

  const persistLatest = async () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
    if (latestByCharacterRef.current.size === 0) return
    setSaveState('saving')
    const pending = saveChainRef.current.catch(() => undefined).then(async () => {
      for (const [characterId, sheet] of latestByCharacterRef.current) {
        await window.desktop.roteiros.saveCharacterSheet(sheet)
        if (latestByCharacterRef.current.get(characterId) === sheet) latestByCharacterRef.current.delete(characterId)
      }
      if (latestByCharacterRef.current.size === 0) setSaveState('saved')
    }).catch((error: unknown) => { setSaveState('error'); console.error('Não foi possível salvar a ficha.', error); throw error })
    saveChainRef.current = pending
    pendingRef.current = pending
    try { await pending } finally { if (pendingRef.current === pending) pendingRef.current = null }
  }

  useEffect(() => registerPendingWriteFlusher(async () => { if (timerRef.current || latestByCharacterRef.current.size) await persistLatest(); else if (pendingRef.current) await pendingRef.current }), [])

  const byCharacter = useMemo(() => new Map(sheets.map((sheet) => [sheet.characterId, sheet])), [sheets])
  const visible = characters.filter((character) => {
    const sheet = byCharacter.get(character.id) ?? emptySheet(character)
    const percent = completion(sheet)
    return character.name.toLocaleLowerCase('pt-BR').includes(query.trim().toLocaleLowerCase('pt-BR')) && (filter === 'all' || filter === 'incomplete' && percent < 100 || filter === 'complete' && percent === 100)
  })
  const selected = visible.find((character) => character.id === selectedId) ?? visible[0]
  const sheet = selected ? byCharacter.get(selected.id) ?? emptySheet(selected) : null

  const update = (patch: Partial<CharacterSheet>) => {
    if (!sheet) return
    const updated = { ...sheet, ...patch, characterId: selected!.id, characterName: selected!.name, updatedAt: new Date().toISOString() }
    latestByCharacterRef.current.set(updated.characterId, updated)
    setSheets((current) => [...current.filter((entry) => entry.characterId !== updated.characterId), updated])
    setSaveState('saving')
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => { void persistLatest().catch(() => undefined) }, 450)
  }

  const addRelationship = () => {
    if (!selected || !sheet) return
    const used = new Set(sheet.relationships.map((entry) => entry.targetCharacterId))
    const target = characters.find((character) => character.id !== selected.id && !used.has(character.id))
    if (!target) return
    const relation: CharacterSheetRelationship = { id: crypto.randomUUID(), targetCharacterId: target.id, description: '' }
    update({ relationships: [...sheet.relationships, relation] })
  }

  if (!loaded) return <div className="character-sheets-loading">Carregando fichas locais…</div>
  return <div className="character-sheets-layout">
    <aside className="character-sheets-sidebar">
      <div className="character-sheets-sidebar-title"><span>FICHAS NARRATIVAS</span><h2>Personagens</h2><p>Informações locais vinculadas aos personagens do Customizador.</p></div>
      <label className="character-sheets-search"><span aria-hidden="true">⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Pesquisar personagem…" /></label>
      <div className="character-sheets-filters"><button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')} type="button">Todos</button><button className={filter === 'incomplete' ? 'active' : ''} onClick={() => setFilter('incomplete')} type="button">Incompletos</button><button className={filter === 'complete' ? 'active' : ''} onClick={() => setFilter('complete')} type="button">Completos</button></div>
      <div className="character-sheets-list">{visible.map((character) => { const percent = completion(byCharacter.get(character.id) ?? emptySheet(character)); return <button className={selected?.id === character.id ? 'selected' : ''} key={character.id} onClick={() => setSelectedId(character.id)} type="button"><RenderedCharacterPortrait className="character-sheets-avatar" character={character} /><span><strong>{character.name}</strong><small>{percent === 0 ? 'Ficha vazia' : `${percent}% preenchido`}</small></span><i style={{ '--sheet-progress': `${percent}%` } as React.CSSProperties} /></button> })}</div>
    </aside>
    <main className="character-sheets-main">
      <div className={`character-sheet-save ${loadError || saveState === 'error' ? 'error' : saveState}`} role="status">{loadError ? `Falha ao carregar: ${loadError}` : saveState === 'saving' ? 'Salvando alterações…' : saveState === 'error' ? <>Falha ao salvar <button type="button" onClick={() => { void persistLatest().catch(() => undefined) }}>Tentar novamente</button></> : 'Alterações salvas'}</div>
      {loadError ? <div className="character-sheets-empty"><strong>Não foi possível abrir as fichas</strong><span>{loadError}</span><button type="button" onClick={() => { setLoadError(''); setLoaded(false); void window.desktop.roteiros.listCharacterSheets().then((stored) => { setSheets(stored); setLoaded(true) }).catch((error: unknown) => { setLoadError(error instanceof Error ? error.message : 'Não foi possível carregar as fichas.'); setLoaded(true) }) }}>Tentar novamente</button></div> : sheet && selected ? <section className="character-sheet-editor" key={selected.id}>
        <header className="character-sheet-hero"><RenderedCharacterPortrait className="character-sheet-hero-avatar" character={selected} /><div><span>PERSONAGEM DO CUSTOMIZADOR</span><h2>{selected.name}</h2><p>Ficha narrativa local. Nenhum dado foi copiado do projeto legado.</p></div><div className="character-sheet-completion"><strong>{completion(sheet)}%</strong><small>preenchido</small></div></header>
        <div className="character-sheet-fields">{fields.map((field) => <label key={field.key}><span>{field.label}</span><small>{field.hint}</small><textarea rows={field.rows} maxLength={field.limit} placeholder={field.placeholder} value={sheet[field.key]} onChange={(event) => update({ [field.key]: event.target.value })} /></label>)}</div>
        <section className="character-sheet-relations-heading"><div><span>RELAÇÕES DIRECIONAIS</span><h3>Relação com outros personagens</h3><p>Descreva como {selected.name} enxerga e trata cada pessoa.</p></div><button type="button" onClick={addRelationship} disabled={characters.length <= 1 || sheet.relationships.length >= characters.length - 1}>＋ Adicionar relação</button></section>
        <div className="character-sheet-relations">{sheet.relationships.map((relation) => <article key={relation.id}><select aria-label="Personagem relacionado" value={relation.targetCharacterId} onChange={(event) => update({ relationships: sheet.relationships.map((entry) => entry.id === relation.id ? { ...entry, targetCharacterId: event.target.value } : entry) })}>{characters.filter((character) => character.id !== selected.id && (!sheet.relationships.some((entry) => entry.id !== relation.id && entry.targetCharacterId === character.id))).map((character) => <option key={character.id} value={character.id}>{character.name}</option>)}</select><textarea aria-label={`Relação com ${characters.find((character) => character.id === relation.targetCharacterId)?.name ?? 'personagem'}`} rows={4} maxLength={6000} value={relation.description} placeholder={`Como ${selected.name} vê e age perto desta pessoa?`} onChange={(event) => update({ relationships: sheet.relationships.map((entry) => entry.id === relation.id ? { ...entry, description: event.target.value } : entry) })} /><button title="Excluir relação" aria-label="Excluir relação" type="button" onClick={() => update({ relationships: sheet.relationships.filter((entry) => entry.id !== relation.id) })}>×</button></article>)}{sheet.relationships.length === 0 && <p>Nenhuma relação cadastrada.</p>}</div>
      </section> : <div className="character-sheets-empty"><strong>{characters.length ? 'Nenhum personagem encontrado' : 'Nenhum personagem no Customizador'}</strong><span>{characters.length ? 'Tente outra busca ou filtro.' : 'Salve um personagem no Customizador para preencher a ficha.'}</span></div>}
    </main>
  </div>
}

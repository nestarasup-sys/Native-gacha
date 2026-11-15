import { useEffect, useState } from 'react'
import { Icon } from '../../ui/components/Icon'
import { RoteiroSectionEditor } from './RoteiroSectionEditor'
import { CharacterPortrait } from '../../ui/components/CharacterPortrait'
import { buildCharacterExportExpressionNames } from './characterExportNames'
import { emptyRoteiroContent } from './roteiroDefaults'
import type { CustomizerCharacter } from '../../../../shared/customizer'
import type { RoteiroDocument, RoteiroExportCharacterInfo, RoteiroExportLog, RoteiroReactionBlock, RoteiroSectionContent, RoteiroTikTok, RoteiroUiGifItem } from '../../../../shared/roteiros'
import type { VideoBackgroundLibraryItem } from '../../../../shared/studio'

/** Editor e exportação de um roteiro aberto; persistência do documento pertence à página de catálogo. */
export function RoteiroWorkspace({ roteiro, onBack, onUpdate, onDeleteDraftVideo, characters }: { roteiro: RoteiroDocument; onBack: () => void; onUpdate: (next: RoteiroDocument) => void; onDeleteDraftVideo: (next: RoteiroDocument, videoId: string) => Promise<boolean>; characters: CustomizerCharacter[] }) {
  const [activeContentId, setActiveContentId] = useState('opening')
  const [editingTikTok, setEditingTikTok] = useState<RoteiroTikTok | null>(null)
  const [editingTitle, setEditingTitle] = useState('')
  const [editingVideoTitle, setEditingVideoTitle] = useState('')
  const [deletingTikTok, setDeletingTikTok] = useState<RoteiroTikTok | null>(null)
  const [exportingCharacters, setExportingCharacters] = useState(false)
  const [characterExportStatus, setCharacterExportStatus] = useState('')
  const [characterExportError, setCharacterExportError] = useState('')
  const [roteiroExportBusy, setRoteiroExportBusy] = useState<string | null>(null)
  const [roteiroExportMessage, setRoteiroExportMessage] = useState('')
  const [roteiroExportError, setRoteiroExportError] = useState('')
  const [openingExportFolder, setOpeningExportFolder] = useState<string | null>(null)
  const [backgroundPickerOpen, setBackgroundPickerOpen] = useState(false)
  const [backgrounds, setBackgrounds] = useState<VideoBackgroundLibraryItem[]>([])
  const [backgroundSearch, setBackgroundSearch] = useState('')
  const [gifPickerOpen, setGifPickerOpen] = useState(false)
  const [castPickerOpen, setCastPickerOpen] = useState(false)
  const [editingCastIds, setEditingCastIds] = useState<string[]>([])
  const [castSearch, setCastSearch] = useState('')
  const [gifs, setGifs] = useState<RoteiroUiGifItem[]>([])
  const [gifSearch, setGifSearch] = useState('')
  const [gifLibraryError, setGifLibraryError] = useState('')
  const [exportLogs, setExportLogs] = useState<RoteiroExportLog[]>([])
  const [exportLogsError, setExportLogsError] = useState('')
  const [exportLogsBusy, setExportLogsBusy] = useState(false)
  const addExportLog = (action: string, status: RoteiroExportLog['status'], details: string) => {
    const entry: RoteiroExportLog = { id: crypto.randomUUID(), roteiroId: roteiro.id, createdAt: new Date().toISOString(), action, status, details }
    setExportLogs((current) => [entry, ...current].slice(0, 50))
    void window.desktop.roteiros.appendRoteiroExportLog(roteiro.id, entry).then(() => setExportLogsError('')).catch((reason: unknown) => setExportLogsError(reason instanceof Error ? reason.message : 'Não foi possível salvar o log de exportação.'))
  }
  useEffect(() => {
    let cancelled = false
    setExportLogs([]); setExportLogsError('')
    void window.desktop.roteiros.listRoteiroExportLogs(roteiro.id).then((entries) => {
      if (!cancelled) setExportLogs((current) => [...new Map([...entries, ...current].map((entry) => [entry.id, entry])).values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 50))
    }).catch((reason: unknown) => { if (!cancelled) setExportLogsError(reason instanceof Error ? reason.message : 'Não foi possível carregar os logs de exportação.') })
    return () => { cancelled = true }
  }, [roteiro.id])
  const clearExportLogs = async () => {
    if (exportLogsBusy) return
    setExportLogsBusy(true); setExportLogsError('')
    try { await window.desktop.roteiros.clearRoteiroExportLogs(roteiro.id); setExportLogs([]) }
    catch (reason) { setExportLogsError(reason instanceof Error ? reason.message : 'Não foi possível limpar os logs de exportação.') }
    finally { setExportLogsBusy(false) }
  }
  const activeTikTok = roteiro.tiktoks.find((item) => item.id === activeContentId)
  const activeContent = activeContentId === 'opening' ? roteiro.opening ?? emptyRoteiroContent() : { video: activeTikTok?.video ?? null, blocks: activeTikTok?.blocks ?? [], description: activeTikTok?.description ?? '', additionalContext: activeTikTok?.additionalContext ?? '', timeline: activeTikTok?.timeline ?? 'unspecified', sceneEndSeconds: activeTikTok?.sceneEndSeconds, firstGroupReactionSeconds: activeTikTok?.firstGroupReactionSeconds, secondGroupReactionSeconds: activeTikTok?.secondGroupReactionSeconds }
  const updateActiveContent = (content: RoteiroSectionContent) => {
    if (activeContentId === 'opening') onUpdate({ ...roteiro, opening: content })
    else onUpdate({ ...roteiro, tiktoks: roteiro.tiktoks.map((item) => item.id === activeContentId ? { ...item, video: content.video, blocks: content.blocks, description: content.description ?? '', additionalContext: content.additionalContext ?? '', timeline: content.timeline, sceneEndSeconds: content.sceneEndSeconds, firstGroupReactionSeconds: content.firstGroupReactionSeconds, secondGroupReactionSeconds: content.secondGroupReactionSeconds } : item) })
  }
  const removeDraftVideo = (videoId: string, content: RoteiroSectionContent) => {
    const next = activeContentId === 'opening'
      ? { ...roteiro, opening: content }
      : { ...roteiro, tiktoks: roteiro.tiktoks.map((item) => item.id === activeContentId ? { ...item, video: content.video, blocks: content.blocks, description: content.description ?? '', additionalContext: content.additionalContext ?? '', timeline: content.timeline, sceneEndSeconds: content.sceneEndSeconds, firstGroupReactionSeconds: content.firstGroupReactionSeconds, secondGroupReactionSeconds: content.secondGroupReactionSeconds } : item) }
    return onDeleteDraftVideo(next, videoId)
  }
  const addTikTok = () => {
    const number = roteiro.tiktoks.length + 1
    const item = { id: crypto.randomUUID(), title: 'TikTok ' + number, videoTitle: 'Vídeo ' + String(number).padStart(2, '0') }
    onUpdate({ ...roteiro, tiktoks: renumberDefaultTikTokLabels([...roteiro.tiktoks, item]) })
    setActiveContentId(item.id)
  }
  const renumberDefaultTikTokLabels = (items: RoteiroTikTok[]) => items.map((item, index) => {
    const number = index + 1
    return {
      ...item,
      title: /^TikTok\s+\d+$/i.test(item.title) ? `TikTok ${number}` : item.title,
      videoTitle: /^V[ií]deo\s+\d+$/i.test(item.videoTitle) ? `Vídeo ${String(number).padStart(2, '0')}` : item.videoTitle
    }
  })
  const moveTikTok = (index: number, direction: -1 | 1) => {
    const destination = index + direction
    if (destination < 0 || destination >= roteiro.tiktoks.length) return
    const next = [...roteiro.tiktoks]
    ;[next[index], next[destination]] = [next[destination], next[index]]
    onUpdate({ ...roteiro, tiktoks: renumberDefaultTikTokLabels(next) })
  }
  const saveTikTok = () => {
    if (!editingTikTok || !editingTitle.trim() || !editingVideoTitle.trim()) return
    onUpdate({ ...roteiro, tiktoks: roteiro.tiktoks.map((item) => item.id === editingTikTok.id ? { ...item, title: editingTitle.trim(), videoTitle: editingVideoTitle.trim() } : item) })
    setEditingTikTok(null)
  }
  const confirmDeleteTikTok = () => {
    if (!deletingTikTok) return
    const deletedId = deletingTikTok.id
    onUpdate({ ...roteiro, tiktoks: renumberDefaultTikTokLabels(roteiro.tiktoks.filter((item) => item.id !== deletedId)) })
    if (activeContentId === deletedId) setActiveContentId('opening')
    if (editingTikTok?.id === deletedId) setEditingTikTok(null)
    setDeletingTikTok(null)
  }
  const exportCharacters = async () => {
    if (exportingCharacters) return
    const cast = roteiro.characterIds.map((id) => characters.find((character) => character.id === id)).filter((character): character is CustomizerCharacter => Boolean(character))
    if (!cast.length) { const message = 'Este roteiro não tem personagens disponíveis no elenco.'; setCharacterExportError(message); addExportLog('Exportar personagens', 'error', message); return }
    if (cast.length !== roteiro.characterIds.length) { const message = 'Um ou mais personagens do elenco não estão disponíveis no Customizador.'; setCharacterExportError(message); addExportLog('Exportar personagens', 'error', message); return }
    setExportingCharacters(true); setCharacterExportError(''); setCharacterExportStatus('Preparando exportação…')
    let jobId: string | null = null
    try {
      const job = await window.desktop.roteiros.startRoteiroCharacterExport({ id: roteiro.id, title: roteiro.title, characters: cast.map(({ id, name }) => ({ id, name })) })
      jobId = job.jobId
      const [{ prepareSavedCharacterRenderer }, { appearanceWithPupilsLookingLeft, buildStudioExpressionAppearance, buildStudioExpressionTransforms, presetWithPupilsLookingLeft }] = await Promise.all([
        import('../../characters/characterRenderer'), import('../../characters/studioExpressionTransforms')
      ])
      let completedFiles = 0
      let omittedVariants = 0
      const componentProvider = (modelSlot: number) => ({
        loadComponent: (id: string) => window.desktop.fabricator.loadFaceComponentAsset(modelSlot, id),
        loadCatalog: (id: string) => window.desktop.fabricator.loadFaceCatalogItem(modelSlot, id)
      })
      for (const character of cast) {
        const modelSlot = character.customization.modelSlot ?? 1
        setCharacterExportStatus(`Preparando ${character.name}…`)
        const source = await window.desktop.fabricator.loadFabricatorSlot(modelSlot)
        if (!source) throw new Error(`O modelo base do personagem “${character.name}” não está disponível.`)
        const allPoseSummaries = (await window.desktop.fabricator.listFabricatorPoseSlots(modelSlot)).filter((pose): pose is NonNullable<typeof pose> => Boolean(pose)).sort((a, b) => a.slot - b.slot)
        const exportSlots = await window.desktop.fabricator.getFabricatorExportPoseSlots(modelSlot)
        const poseSummaries = exportSlots === null ? allPoseSummaries : exportSlots.filter((slot): slot is number => slot !== null).map((slot) => allPoseSummaries.find((pose) => pose.slot === slot)).filter((pose): pose is NonNullable<typeof pose> => Boolean(pose))
        if (exportSlots !== null && poseSummaries.length !== exportSlots.filter((slot) => slot !== null).length) throw new Error(`Uma pose escolhida nos slots de exportação para “${character.name}” foi removida. Revise Poses Dev e tente novamente.`)
        const loadedPoses = await Promise.all(poseSummaries.map(async (summary) => ({ summary, artwork: await window.desktop.fabricator.loadFabricatorPose(modelSlot, summary.slot) })))
        const poses = loadedPoses.filter((entry): entry is { summary: NonNullable<(typeof poseSummaries)[number]>; artwork: NonNullable<(typeof entry)['artwork']> } => Boolean(entry.artwork))
        if (poseSummaries.length && poses.length !== poseSummaries.length) throw new Error(`Uma pose salva de “${character.name}” não pôde ser carregada.`)
        const renderPoses = poses.length ? poses : [{ summary: null, artwork: source }]
        const [expressionSummaries, expressionCollections] = character.customization.faceAppearance
          ? await Promise.all([window.desktop.fabricator.listFaceExpressionPresets(modelSlot), window.desktop.fabricator.listFaceExpressionCollections(modelSlot)])
          : [[], []]
        const expressions = buildCharacterExportExpressionNames(
          expressionSummaries.filter((preset) => preset.modelSlot === modelSlot && (!preset.collectionId || preset.collectionId === 'standard')).sort((a, b) => (a.expressionIndex ?? 0) - (b.expressionIndex ?? 0)),
          expressionCollections,
        )
        const estimated = cast.reduce((total, item) => total + (item.id === character.id ? renderPoses.length * expressions.length * 6 : 0), 0)
        if (completedFiles + estimated > job.assetCountLimit) throw new Error('O elenco e as poses gerariam mais de 20 mil imagens. Reduza as poses ou expressões salvas antes de exportar.')
        const { loadComponent, loadCatalog } = componentProvider(modelSlot)
        for (let poseIndex = 0; poseIndex < renderPoses.length; poseIndex += 1) {
          const pose = renderPoses[poseIndex]
          const renderer = await prepareSavedCharacterRenderer(character, { artwork: pose.artwork, source })
          for (const expression of expressions) {
            let appearance = character.customization.faceAppearance
            let transforms: Record<string, import('../../../../shared/studio').StudioFaceTransform> = {}
            let ptTransforms: Record<string, import('../../../../shared/studio').StudioFaceTransform> | null = null
            let effects: import('../../../../shared/fabricator').FaceExpressionEffects | undefined
            if (expression.presetId && appearance) {
              const preset = await window.desktop.fabricator.loadFaceExpressionPreset(modelSlot, expression.presetId)
              if (!preset) throw new Error(`O preset “${expression.name}” de ${character.name} não pôde ser carregado.`)
              appearance = await buildStudioExpressionAppearance(preset, appearance, loadCatalog)
              transforms = await buildStudioExpressionTransforms(preset, appearance, {}, loadComponent, loadCatalog)
              const ptPreset = await presetWithPupilsLookingLeft(preset, loadComponent)
              ptTransforms = ptPreset
                ? await buildStudioExpressionTransforms(ptPreset, appearance, {}, loadComponent, loadCatalog)
                : await appearanceWithPupilsLookingLeft(appearance, loadComponent)
              effects = preset.effects
            } else if (appearance) ptTransforms = await appearanceWithPupilsLookingLeft(appearance, loadComponent)
            setCharacterExportStatus(`Exportando ${character.name} · POSE ${poseIndex + 1} · ${expression.name}…`)
            const variants: Array<{ role: 'base' | 'blink' | 'talk' | 'pt' | 'pt-blink' | 'pt-talk'; mode: 'idle' | 'blink' | 'talk'; transforms: Record<string, import('../../../../shared/studio').StudioFaceTransform> }> = [
              { role: 'base', mode: 'idle', transforms }, { role: 'blink', mode: 'blink', transforms }, { role: 'talk', mode: 'talk', transforms }
            ]
            if (ptTransforms) variants.push(
              { role: 'pt', mode: 'idle', transforms: ptTransforms }, { role: 'pt-blink', mode: 'blink', transforms: ptTransforms }, { role: 'pt-talk', mode: 'talk', transforms: ptTransforms }
            )
            for (const variant of variants) {
              let rendered: { dataUrl: string; width: number; height: number }
              try {
                rendered = await renderer.render(appearance, variant.transforms, effects, variant.mode)
              } catch (reason) {
                if (variant.role === 'base') throw reason
                omittedVariants += 1
                continue
              }
              await window.desktop.roteiros.writeRoteiroCharacterExportAsset(job.jobId, { characterId: character.id, pose: poseIndex + 1, expression: expression.name, role: variant.role, dataUrl: rendered.dataUrl })
              completedFiles += 1
            }
          }
        }
      }
      const result = await window.desktop.roteiros.finishRoteiroCharacterExport(job.jobId)
      jobId = null
      setCharacterExportStatus(`Exportação concluída: ${result.characters} personagem(ns), ${result.files} imagens em ${result.path}${omittedVariants ? ` · ${omittedVariants} variantes faciais indisponíveis foram omitidas` : ''}`)
      addExportLog('Exportar personagens', 'success', `${result.characters} personagem(ns), ${result.files} imagens · ${result.path}${omittedVariants ? ` · ${omittedVariants} variantes omitidas` : ''}`)
    } catch (reason) {
      if (jobId) await window.desktop.roteiros.cancelRoteiroCharacterExport(jobId).catch(() => undefined)
      setCharacterExportStatus('')
      const message = reason instanceof Error ? reason.message : 'Não foi possível exportar os personagens deste roteiro.'
      setCharacterExportError(message); addExportLog('Exportar personagens', 'error', message)
    } finally { setExportingCharacters(false) }
  }
  const exportRoteiroAsset = async (kind: 'background' | 'videos' | 'script' | 'gif') => {
    setRoteiroExportBusy(kind); setRoteiroExportError(''); setRoteiroExportMessage('')
    try {
      const characterInfo = kind === 'script' ? await Promise.all(roteiro.characterIds.map(async (id): Promise<RoteiroExportCharacterInfo | null> => {
        const character = characters.find((item) => item.id === id)
        if (!character) return null
        const modelSlot = character.customization.modelSlot ?? 1
        const [allPoseSummaries, exportSlots] = await Promise.all([window.desktop.fabricator.listFabricatorPoseSlots(modelSlot), window.desktop.fabricator.getFabricatorExportPoseSlots(modelSlot)])
        const availableSlots = allPoseSummaries.filter((pose): pose is NonNullable<typeof pose> => Boolean(pose)).sort((a, b) => a.slot - b.slot).map((pose) => pose.slot)
        const poseSlots = exportSlots === null ? availableSlots : exportSlots.filter((slot): slot is number => slot !== null && availableSlots.includes(slot))
        let expressions: string[] = []
        if (character.customization.faceAppearance) {
          const [presets, collections] = await Promise.all([window.desktop.fabricator.listFaceExpressionPresets(modelSlot), window.desktop.fabricator.listFaceExpressionCollections(modelSlot)])
          expressions = buildCharacterExportExpressionNames(
            presets.filter((preset) => preset.modelSlot === modelSlot).sort((a, b) => (a.expressionIndex ?? 0) - (b.expressionIndex ?? 0)),
            collections,
          ).map((item) => item.name).filter((name) => name !== 'normal')
        }
        return { id, name: character.name, modelSlot, hair: character.hair, outfit: character.outfit, skin: character.skin, hasFaceAppearance: Boolean(character.customization.faceAppearance), poseSlots: poseSlots.length ? poseSlots : [0], expressions }
      })) : undefined
      const result = await window.desktop.roteiros.exportRoteiroAssets({ roteiro, kind, ...(characterInfo ? { characters: characterInfo.filter((item): item is RoteiroExportCharacterInfo => Boolean(item)) } : {}) })
      const label = kind === 'background' ? 'Fundo' : kind === 'videos' ? 'Vídeos' : kind === 'gif' ? 'GIF' : 'Roteiro'
      setRoteiroExportMessage(`${label} exportado${kind === 'videos' && result.files !== 1 ? 's' : ''}: ${result.files} arquivo(s) · ${result.path}`)
      addExportLog(`Exportar ${label.toLocaleLowerCase('pt-BR')}`, 'success', `${result.files} arquivo(s) · ${result.path}`)
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'Não foi possível exportar este conteúdo.'
      setRoteiroExportError(message); addExportLog(kind === 'background' ? 'Exportar fundo' : kind === 'videos' ? 'Exportar vídeos' : kind === 'gif' ? 'Exportar GIF' : 'Exportar roteiro', 'error', message)
    }
    finally { setRoteiroExportBusy(null) }
  }
  const openExportFolder = async (kind: 'characters' | 'background' | 'videos' | 'script' | 'ui') => {
    setOpeningExportFolder(kind); setRoteiroExportError('')
    try { await window.desktop.roteiros.openRoteiroExportFolder({ roteiro, kind }) }
    catch (reason) { setRoteiroExportError(reason instanceof Error ? reason.message : 'Não foi possível abrir a pasta de exportação.') }
    finally { setOpeningExportFolder(null) }
  }
  const openBackgroundPicker = async () => {
    setBackgroundPickerOpen(true); setBackgroundSearch('')
    try { setBackgrounds(await window.desktop.videoBackgrounds.listVideoBackgroundLibrary()) }
    catch (reason) { setRoteiroExportError(reason instanceof Error ? reason.message : 'Não foi possível carregar a biblioteca de fundos.') }
  }
  const importRoteiroBackground = async () => {
    try {
      const item = await window.desktop.videoBackgrounds.importVideoBackground()
      if (item) { setBackgrounds((current) => [item, ...current]); onUpdate({ ...roteiro, backgroundAssetId: item.id }) }
    } catch (reason) { setRoteiroExportError(reason instanceof Error ? reason.message : 'Não foi possível importar o fundo.') }
  }
  const deleteRoteiroBackground = async (item: VideoBackgroundLibraryItem) => {
    if (!window.confirm(`Excluir permanentemente “${item.name}” da biblioteca? Essa ação não pode ser desfeita.`)) return
    try {
      await window.desktop.videoBackgrounds.deleteVideoBackground(item.id)
      setBackgrounds((current) => current.filter((entry) => entry.id !== item.id))
      if (roteiro.backgroundAssetId === item.id) onUpdate({ ...roteiro, backgroundAssetId: null })
      setRoteiroExportError('')
    } catch (reason) { setRoteiroExportError(reason instanceof Error ? reason.message : 'Não foi possível excluir o fundo.') }
  }
  const openGifPicker = async () => {
    setGifPickerOpen(true); setGifSearch(''); setGifLibraryError('')
    try { setGifs(await window.desktop.roteiros.listRoteiroUiGifs()) }
    catch (reason) { setGifLibraryError(reason instanceof Error ? reason.message : 'Não foi possível carregar a biblioteca de GIFs.') }
  }
  const importRoteiroGif = async () => {
    try {
      const item = await window.desktop.roteiros.importRoteiroUiGif()
      if (item) { setGifs((current) => [item, ...current]); onUpdate({ ...roteiro, uiGifAssetId: item.id }) }
    } catch (reason) { setGifLibraryError(reason instanceof Error ? reason.message : 'Não foi possível importar o GIF.') }
  }
  const deleteRoteiroGif = async (item: RoteiroUiGifItem) => {
    if (!window.confirm(`Excluir permanentemente “${item.name}” da biblioteca de GIFs?`)) return
    try { await window.desktop.roteiros.deleteRoteiroUiGif(item.id); setGifs((current) => current.filter((entry) => entry.id !== item.id)) }
    catch (reason) { setGifLibraryError(reason instanceof Error ? reason.message : 'Não foi possível excluir o GIF.') }
  }
  const openCastPicker = () => {
    setEditingCastIds([...roteiro.characterIds])
    setCastSearch('')
    setCastPickerOpen(true)
  }
  const saveCast = () => {
    const characterIds = [...new Set(editingCastIds)].filter((id) => characters.some((character) => character.id === id))
    const sanitizeBlocks = (blocks: RoteiroReactionBlock[] = []) => blocks.map((block) => characterIds.includes(block.characterId) ? block : { ...block, characterId: '' })
    onUpdate({
      ...roteiro,
      characterIds,
      opening: roteiro.opening ? { ...roteiro.opening, blocks: sanitizeBlocks(roteiro.opening.blocks) } : roteiro.opening,
      tiktoks: roteiro.tiktoks.map((item) => ({ ...item, blocks: sanitizeBlocks(item.blocks) }))
    })
    setCastPickerOpen(false)
  }

  return <div className="roteiro-workspace-layout">
    <aside className="roteiro-workspace-sidebar">
      <button className="roteiro-back-button" onClick={onBack} type="button"><span aria-hidden="true">←</span>Voltar</button>
      <section className="roteiro-tiktoks-panel" aria-label="TikToks deste roteiro">
        <header><strong>TIKTOKS</strong><div className="roteiro-tiktok-header-actions"><button className="roteiro-cast-open" onClick={openCastPicker} type="button"><Icon name="user" />Elenco <span>{roteiro.characterIds.length}</span></button><button className="roteiro-tiktok-add" onClick={addTikTok} title="Adicionar TikTok" aria-label="Adicionar TikTok" type="button"><Icon name="plus" /></button></div></header>
        <div className="roteiro-tiktoks-list">
          <article className={`roteiro-tiktok-card roteiro-opening-card${activeContentId === 'opening' ? ' active' : ''}`}>
            <button className="roteiro-tiktok-open" onClick={() => setActiveContentId('opening')} aria-current={activeContentId === 'opening' ? 'page' : undefined} type="button">
              <span className="roteiro-tiktok-number" aria-hidden="true">↗</span>
              <span className="roteiro-tiktok-info"><strong>Abertura</strong><span>Início do roteiro</span></span>
              <span className="roteiro-tiktok-cast">{roteiro.characterIds.length}/{roteiro.characterIds.length}</span>
            </button>
          </article>
          {roteiro.tiktoks.map((item, index) => <article className={`roteiro-tiktok-card${activeContentId === item.id ? ' active' : ''}`} key={item.id}>
            <button className="roteiro-tiktok-open" onClick={() => setActiveContentId(item.id)} aria-current={activeContentId === item.id ? 'page' : undefined} type="button">
              <span className="roteiro-tiktok-number" aria-hidden="true">{index + 1}</span>
              <span className="roteiro-tiktok-info"><strong>{item.title}</strong><span>{item.videoTitle}</span></span>
              <span className="roteiro-tiktok-cast">{roteiro.characterIds.length}/{roteiro.characterIds.length}</span>
            </button>
            <div className="roteiro-tiktok-actions"><button onClick={() => moveTikTok(index, -1)} disabled={index === 0} aria-label={'Mover ' + item.title + ' para cima'} type="button">↑</button><button onClick={() => moveTikTok(index, 1)} disabled={index === roteiro.tiktoks.length - 1} aria-label={'Mover ' + item.title + ' para baixo'} type="button">↓</button><button onClick={() => { setEditingTikTok(item); setEditingTitle(item.title); setEditingVideoTitle(item.videoTitle) }} type="button">Editar</button><button className="roteiro-tiktok-delete" onClick={() => setDeletingTikTok(item)} aria-label={'Excluir ' + item.title} title={'Excluir ' + item.title} type="button"><Icon name="trash" /></button></div>
          </article>)}{roteiro.tiktoks.length === 0 && <div className="roteiro-first-tiktok"><Icon name="message" /><strong>Seu roteiro começa aqui</strong><span>Adicione o primeiro TikTok quando estiver pronto.</span><button type="button" onClick={addTikTok}>Adicionar primeiro TikTok</button></div>}</div>
      </section>
    </aside>
    <RoteiroSectionEditor title={activeContentId === 'opening' ? 'Abertura' : activeTikTok?.title ?? 'TikTok'} content={activeContent} characters={characters} characterIds={roteiro.characterIds} previewDetailsCollapsed={Boolean(roteiro.previewDetailsCollapsed)} onTogglePreviewDetails={() => onUpdate({ ...roteiro, previewDetailsCollapsed: !roteiro.previewDetailsCollapsed })} onUpdate={updateActiveContent} onDeleteDraftVideo={removeDraftVideo} />
    <aside className="roteiro-workspace-empty-panel" aria-label="Ferramentas do roteiro">
      <button className="roteiro-export-characters" type="button" onClick={() => void exportCharacters()} disabled={exportingCharacters || !roteiro.characterIds.length}>
        {exportingCharacters ? 'Exportando personagens…' : 'Exportar personagens'}
      </button>
      <button className="roteiro-export-characters roteiro-export-open-folder" type="button" onClick={() => void openExportFolder('characters')} disabled={Boolean(openingExportFolder)}>{openingExportFolder === 'characters' ? 'Abrindo…' : 'Abrir pasta'}</button>
      <button className="roteiro-export-characters roteiro-export-secondary" type="button" onClick={() => void exportRoteiroAsset('background')} disabled={Boolean(roteiroExportBusy)}>{roteiroExportBusy === 'background' ? 'Exportando fundo…' : 'Exportar fundo'}</button>
      <button className="roteiro-export-characters roteiro-export-select-background" type="button" onClick={() => void openBackgroundPicker()} disabled={Boolean(roteiroExportBusy)}>Selecionar fundo{roteiro.backgroundAssetId ? ' · selecionado' : ''}</button>
      <button className="roteiro-export-characters roteiro-export-open-folder" type="button" onClick={() => void openExportFolder('background')} disabled={Boolean(openingExportFolder)}>{openingExportFolder === 'background' ? 'Abrindo…' : 'Abrir pasta'}</button>
      <button className="roteiro-export-characters roteiro-export-secondary" type="button" onClick={() => void exportRoteiroAsset('gif')} disabled={Boolean(roteiroExportBusy)}>{roteiroExportBusy === 'gif' ? 'Exportando GIF…' : 'Exportar GIF'}</button>
      <button className="roteiro-export-characters roteiro-export-select-background" type="button" onClick={() => void openGifPicker()} disabled={Boolean(roteiroExportBusy)}>Selecionar GIF{roteiro.uiGifAssetId ? ' · selecionado' : ''}</button>
      <button className="roteiro-export-characters roteiro-export-open-folder" type="button" onClick={() => void openExportFolder('ui')} disabled={Boolean(openingExportFolder)}>{openingExportFolder === 'ui' ? 'Abrindo…' : 'Abrir pasta'}</button>
      <button className="roteiro-export-characters roteiro-export-secondary" type="button" onClick={() => void exportRoteiroAsset('videos')} disabled={Boolean(roteiroExportBusy)}>{roteiroExportBusy === 'videos' ? 'Exportando vídeos…' : 'Exportar vídeos'}</button>
      <button className="roteiro-export-characters roteiro-export-open-folder" type="button" onClick={() => void openExportFolder('videos')} disabled={Boolean(openingExportFolder)}>{openingExportFolder === 'videos' ? 'Abrindo…' : 'Abrir pasta'}</button>
      <button className="roteiro-export-characters roteiro-export-secondary" type="button" onClick={() => void exportRoteiroAsset('script')} disabled={Boolean(roteiroExportBusy)}>{roteiroExportBusy === 'script' ? 'Exportando roteiro…' : 'Exportar roteiro'}</button>
      <button className="roteiro-export-characters roteiro-export-open-folder" type="button" onClick={() => void openExportFolder('script')} disabled={Boolean(openingExportFolder)}>{openingExportFolder === 'script' ? 'Abrindo…' : 'Abrir pasta'}</button>
      {characterExportStatus && <p className="roteiro-export-feedback" role="status">{characterExportStatus}</p>}
      {characterExportError && <p className="roteiro-export-error" role="alert">{characterExportError}</p>}
      {roteiroExportMessage && <p className="roteiro-export-feedback" role="status">{roteiroExportMessage}</p>}
      {roteiroExportError && <p className="roteiro-export-error" role="alert">{roteiroExportError}</p>}
      <section className="roteiro-export-logs" aria-label="Logs de exportação">
        <header><div><strong>Logs de exportação</strong><span>{exportLogs.length} registro(s) recentes · salvos por roteiro</span></div><button type="button" onClick={() => void clearExportLogs()} disabled={!exportLogs.length || exportLogsBusy}>{exportLogsBusy ? 'Limpando…' : 'Limpar'}</button></header>
        {exportLogsError && <p className="roteiro-export-error" role="alert">{exportLogsError}</p>}
        <div className="roteiro-export-log-list" aria-live="polite">
          {exportLogs.length ? exportLogs.map((entry) => <article className={`roteiro-export-log ${entry.status}`} key={entry.id}><div><strong>{entry.action}</strong><time dateTime={entry.createdAt}>{new Date(entry.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time></div><p>{entry.details}</p></article>) : <p className="roteiro-export-log-empty">Os resultados das exportações aparecerão aqui.</p>}
        </div>
      </section>
    </aside>
    {backgroundPickerOpen && <div className="roteiro-modal-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) setBackgroundPickerOpen(false) }}><section className="roteiro-background-modal" role="dialog" aria-modal="true" aria-labelledby="roteiro-background-title"><header><div><span>BIBLIOTECA COMPARTILHADA</span><h2 id="roteiro-background-title">Selecionar fundo</h2><p>O fundo fica associado pelo ID a este roteiro.</p></div><button onClick={() => setBackgroundPickerOpen(false)} aria-label="Fechar" type="button">×</button></header><div className="roteiro-background-toolbar"><input type="search" value={backgroundSearch} onChange={(event) => setBackgroundSearch(event.target.value)} placeholder="Buscar fundo…" aria-label="Buscar fundo"/><button type="button" onClick={() => void importRoteiroBackground()}><Icon name="plus"/>Adicionar novo fundo</button></div><div className="roteiro-background-grid">{backgrounds.filter((item) => item.name.toLocaleLowerCase('pt-BR').includes(backgroundSearch.toLocaleLowerCase('pt-BR'))).map((item) => <article className={roteiro.backgroundAssetId === item.id ? 'selected' : ''} key={item.id}><button type="button" className="roteiro-background-option" disabled={!item.available} onClick={() => { onUpdate({ ...roteiro, backgroundAssetId: item.id }); setBackgroundPickerOpen(false) }}><img src={`gacha-background://library/${item.id}`} alt=""/><strong title={item.name}>{item.name}</strong><small>{item.extension.toUpperCase()} · {(item.size / 1024 / 1024).toFixed(1)} MB</small></button><button type="button" className="roteiro-background-delete" onClick={() => void deleteRoteiroBackground(item)} aria-label={`Excluir permanentemente ${item.name}`}><Icon name="trash"/></button></article>)}{backgrounds.length === 0 && <p>Nenhum fundo cadastrado. Use “Adicionar novo fundo” para importar.</p>}</div><footer><span>{backgrounds.length} fundo(s) na biblioteca</span><button type="button" onClick={() => { onUpdate({ ...roteiro, backgroundAssetId: null }); setBackgroundPickerOpen(false) }}>Remover do roteiro</button></footer></section></div>}
    {gifPickerOpen && <div className="roteiro-modal-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) setGifPickerOpen(false) }}><section className="roteiro-background-modal" role="dialog" aria-modal="true" aria-labelledby="roteiro-gif-title"><header><div><span>ASSETS / UI</span><h2 id="roteiro-gif-title">Selecionar GIF</h2><p>Escolha o GIF que será copiado para <code>assets/ui/loading.gif</code> no projeto exportado.</p></div><button onClick={() => setGifPickerOpen(false)} aria-label="Fechar" type="button">×</button></header><div className="roteiro-background-toolbar"><input type="search" value={gifSearch} onChange={(event) => setGifSearch(event.target.value)} placeholder="Buscar GIF…" aria-label="Buscar GIF"/><button type="button" onClick={() => void importRoteiroGif()}><Icon name="plus"/>Adicionar GIF</button></div>{gifLibraryError && <p className="roteiro-export-error roteiro-gif-error" role="alert">{gifLibraryError}</p>}<div className="roteiro-background-grid roteiro-gif-grid">{gifs.filter((item) => item.name.toLocaleLowerCase('pt-BR').includes(gifSearch.toLocaleLowerCase('pt-BR'))).map((item) => <article className={roteiro.uiGifAssetId === item.id ? 'selected' : ''} key={item.id}><button type="button" className="roteiro-background-option" disabled={!item.available} onClick={() => { onUpdate({ ...roteiro, uiGifAssetId: item.id }); setGifPickerOpen(false) }}><img src={`gacha-gif://library/${item.id}`} alt={item.name}/><strong title={item.name}>{item.name}{item.builtIn ? ' · padrão' : ''}</strong><small>GIF · {(item.size / 1024).toFixed(0)} KB{item.available ? '' : ' · arquivo ausente'}</small></button>{!item.builtIn && <button type="button" className="roteiro-background-delete" onClick={() => void deleteRoteiroGif(item)} aria-label={`Excluir permanentemente ${item.name}`}><Icon name="trash"/></button>}</article>)}{gifs.length === 0 && <p>Nenhum GIF cadastrado. Use “Adicionar GIF” para importar.</p>}</div><footer><span>{gifs.length} GIF(s) na biblioteca</span><button type="button" onClick={() => { onUpdate({ ...roteiro, uiGifAssetId: null }); setGifPickerOpen(false) }}>Remover do roteiro</button></footer></section></div>}
    {castPickerOpen && <div className="roteiro-modal-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) setCastPickerOpen(false) }}><section className="roteiro-create-modal roteiro-cast-modal" role="dialog" aria-modal="true" aria-labelledby="roteiro-cast-title"><header><div><span>ELENCO DO ROTEIRO</span><h2 id="roteiro-cast-title">Personagens</h2></div><button onClick={() => setCastPickerOpen(false)} aria-label="Fechar" type="button">×</button></header><label className="roteiro-cast-search"><Icon name="search"/><input type="search" value={castSearch} onChange={(event) => setCastSearch(event.target.value)} placeholder="Buscar personagem…" aria-label="Buscar personagem"/></label><div className="roteiro-modal-cast-heading"><strong>Selecione quem participa</strong><span>{editingCastIds.length} selecionado(s)</span></div><div className="roteiro-modal-cast-list">{characters.filter((character) => character.name.toLocaleLowerCase('pt-BR').includes(castSearch.trim().toLocaleLowerCase('pt-BR'))).map((character) => { const checked = editingCastIds.includes(character.id); return <button className={checked ? 'selected' : ''} key={character.id} onClick={() => setEditingCastIds((current) => checked ? current.filter((id) => id !== character.id) : [...current, character.id])} type="button" aria-pressed={checked}><CharacterPortrait character={character}/><span>{character.name}</span><i>{checked ? '✓' : '+'}</i></button> })}{characters.length === 0 && <p>Não há personagens disponíveis no Customizador.</p>}</div>{editingCastIds.some((id) => !characters.some((character) => character.id === id)) && <p className="roteiro-cast-missing">Há personagens deste roteiro que não estão disponíveis no Customizador. Eles serão removidos do elenco ao salvar.</p>}<footer><button onClick={() => setCastPickerOpen(false)} type="button">Cancelar</button><button className="roteiro-create-confirm" onClick={saveCast} type="button"><Icon name="check"/>Salvar elenco</button></footer></section></div>}
    {editingTikTok && <div className="roteiro-modal-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) setEditingTikTok(null) }}><section className="roteiro-video-title-modal" role="dialog" aria-modal="true" aria-labelledby="roteiro-tiktok-edit-heading"><header><strong id="roteiro-tiktok-edit-heading">Editar TikTok</strong><button onClick={() => setEditingTikTok(null)} aria-label="Fechar" type="button">×</button></header><label>Nome do TikTok<input autoFocus value={editingTitle} onChange={(event) => setEditingTitle(event.target.value)} maxLength={100} /></label><label>Título do vídeo<input value={editingVideoTitle} onChange={(event) => setEditingVideoTitle(event.target.value)} maxLength={100} /></label><footer><button onClick={() => setEditingTikTok(null)} type="button">Cancelar</button><button className="roteiro-create-confirm" onClick={saveTikTok} disabled={!editingTitle.trim() || !editingVideoTitle.trim()} type="button"><Icon name="check" />Salvar</button></footer></section></div>}
    {deletingTikTok && <div className="roteiro-modal-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) setDeletingTikTok(null) }}><section className="roteiro-delete-confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="roteiro-tiktok-delete-heading"><span className="roteiro-delete-confirm-icon"><Icon name="trash" /></span><h2 id="roteiro-tiktok-delete-heading">Excluir {deletingTikTok.title}?</h2><p>O TikTok e seus blocos serão removidos deste roteiro. Um vídeo vinculado à Base de vídeos continuará salvo nela.</p><footer><button type="button" onClick={() => setDeletingTikTok(null)}>Cancelar</button><button type="button" className="danger" onClick={confirmDeleteTikTok}>Excluir TikTok</button></footer></section></div>}
  </div>
}

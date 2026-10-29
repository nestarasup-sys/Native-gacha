import { projectForOriginalPreview } from '../../../../shared/fabricatorModelViews'
import { interpolateFrames, shortestAngle } from './models/animationInterpolation'
import { useModelSourceRefresh } from './models/useModelSourceRefresh'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, FormEvent, PointerEvent as ReactPointerEvent } from 'react'
import { resolvePoseCategory, type AnimatorAnimation, type AnimatorAnimationAsset, type AnimatorAnimationDraft, type AnimatorFrame, type AnimatorAnimationSummary, type AnimatorFrameTransform, type FaceCatalogItem, type FaceSet, type FabricatorProject, type FabricatorSlotSummary, type HairStyle, type JointLink, type PosePart, type WardrobeSet } from '../../../../shared/fabricator'
import type { CustomizerCharacter } from '../../../../shared/customizer'
import { Icon } from '../../ui/components/Icon'
import { normalizeLayerOrder, orderedParts, partJointAnchor } from './models/rig'
import {
  applyFrameState,
  isCoreAnimatorPart as isCorePart,
  makePoseProject,
  moveFramePart,
  projectFromAnimation,
  rotateFramePart,
  serializeAnimation,
  serializeAnimatorDraft as serializeDraft,
  transformsFromProject,
  type AnimatorFrameState as FrameHistoryState
} from './models/animatorFrameModel'
import { loadAnimatorImage as loadImage } from './models/animatorImageCache'
import { refreshAnimatorThumbnails as refreshThumbnails, renderAnimatorThumbnail as renderThumbnail } from './models/animatorThumbnail'
import { usePreviewBackground } from '../../ui/hooks/usePreviewBackground'
import { isModelBodyPartName, tintModelBodyPixels } from '../../characters/skinTint'
import { useModelAppearanceSettings, useModelAppearanceTarget, useModelPartAppearancePreview } from './ModelAppearanceContext'
import { registerPendingWriteFlusher } from '../../ui/pendingPersistence'
import { breathingVariations, createBreathingAnimation } from './models/animatorBreathingModel'
import { buildAnimatorHeadOverlays } from './models/animatorHeadOverlays'
import { buildAnimatorGarmentLayers } from './models/animatorGarmentLayers'
import { buildAnimatorRigDiagnostics } from './models/animatorRigDiagnostics'

const SLOT_COUNT = 12
const HISTORY_LIMIT = 40
type Gesture = { pointerId: number; partId: string; startX: number; startY: number; lastAngle: number; rotationDelta: number; before: FrameHistoryState; pivotX: number; pivotY: number; scale: number; mode: 'rotate' | 'move' }
type PanGesture = { pointerId: number; startX: number; startY: number; originX: number; originY: number }

export function AnimatorWorkspace({ baseModelSlot }: { baseModelSlot: number }) {
  const [models, setModels] = useState<FabricatorSlotSummary[]>([])
  const [animationSourceSlots, setAnimationSourceSlots] = useState<number[]>([])
  const [characters, setCharacters] = useState<CustomizerCharacter[]>([])
  const [modelSlot, setModelSlot] = useState<number | null>(null)
  useModelAppearanceTarget(modelSlot)
  const sharedModelAppearance = useModelAppearanceSettings(modelSlot)
  const appearancePreviewForPart = useModelPartAppearancePreview(modelSlot)
  const [characterId, setCharacterId] = useState('')
  const [source, setSource] = useState<FabricatorProject | null>(null)
  useModelSourceRefresh(modelSlot, fresh => setSource(projectForOriginalPreview(fresh)))
  const [baseProject, setBaseProject] = useState<FabricatorProject | null>(null)
  const [summaries, setSummaries] = useState<AnimatorAnimationSummary[]>([])
  const [activeSlot, setActiveSlot] = useState(1)
  const [animation, setAnimation] = useState<AnimatorAnimation | null>(null)
  const [currentTransforms, setCurrentTransforms] = useState<Record<string, AnimatorFrameTransform>>({})
  const [currentJoints, setCurrentJoints] = useState<JointLink[]>([])
  const [selectedFrameId, setSelectedFrameId] = useState('')
  const [selectedPartId, setSelectedPartId] = useState('')
  const [copiedTransforms, setCopiedTransforms] = useState<{ transforms: Record<string, AnimatorFrameTransform>; joints: JointLink[] } | null>(null)
  const [undoStack, setUndoStack] = useState<FrameHistoryState[]>([])
  const [redoStack, setRedoStack] = useState<FrameHistoryState[]>([])
  const [draft, setDraft] = useState<AnimatorAnimationDraft | null>(null)
  const [dragMode, setDragMode] = useState<'rotate' | 'move'>('rotate')
  const [includeChildren, setIncludeChildren] = useState(true)
  const [applyToAllFrames, setApplyToAllFrames] = useState(false)
  const [allowCorePartId, setAllowCorePartId] = useState('')
  const [playing, setPlaying] = useState(false)
  const [playhead, setPlayhead] = useState(0)
  const [playDirection, setPlayDirection] = useState<1 | -1>(1)
  const [stageSize, setStageSize] = useState({ width: 1, height: 1 })
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [panelTab, setPanelTab] = useState<'parts' | 'layers' | 'rig' | 'settings'>('parts')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saveMessage, setSaveMessage] = useState('')
  const [largePreview, setLargePreview] = useState(false)
  const [nameDialog, setNameDialog] = useState<{ mode: 'rename' | 'duplicate'; value: string } | null>(null)
  const [breathingDialog, setBreathingDialog] = useState(false)
  const [breathingSaving, setBreathingSaving] = useState(false)
  const [background] = usePreviewBackground()
  const stageRef = useRef<HTMLDivElement | null>(null)
  const gestureRef = useRef<Gesture | null>(null)
  const panGestureRef = useRef<PanGesture | null>(null)
  const stateRef = useRef<FrameHistoryState | null>(null)
  const writeQueue = useRef<Promise<void>>(Promise.resolve())
  const pendingAssets = useRef<Map<string, string>>(new Map())
  const draftAssetsPersisted = useRef(false)
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const draftFlushRef = useRef<() => Promise<void>>(async () => {})
  const mountedRef = useRef(false)
  const savedAnimationRef = useRef<string | null>(null)
  const dirtyFrameRef = useRef(false)
  const animationLoadId = useRef(0)
  const playheadRef = useRef(0)
  const directionRef = useRef<1 | -1>(1)
  const selectedCharacter = characters.find((character) => character.id === characterId) ?? null
  const rigProject = useMemo(() => animation ? projectFromAnimation(animation, source) : source, [animation, source])
  const diagnostics = useMemo(() => buildAnimatorRigDiagnostics(rigProject), [rigProject])
  const slots = useMemo(() => Array.from({ length: SLOT_COUNT }, (_, index) => summaries.find((item) => item.slot === index + 1) ?? null), [summaries])
  const selectedFrameIndex = animation?.frames.findIndex((frame) => frame.id === selectedFrameId) ?? -1
  const selectedFrame = animation && selectedFrameIndex >= 0 ? animation.frames[selectedFrameIndex] : null
  const currentSnapshot = useMemo<FrameHistoryState>(() => ({ animation, transforms: currentTransforms, joints: currentJoints, frameId: selectedFrameId }), [animation, currentTransforms, currentJoints, selectedFrameId])
  useLayoutEffect(() => { stateRef.current = currentSnapshot }, [currentSnapshot])
  const dirtyFrame = useMemo(() => Boolean(selectedFrame
    && (JSON.stringify(selectedFrame.transforms) !== JSON.stringify(currentTransforms)
      || JSON.stringify(selectedFrame.joints) !== JSON.stringify(currentJoints))), [selectedFrame, currentTransforms, currentJoints])
  dirtyFrameRef.current = dirtyFrame
  const totalDuration = animation?.frames.reduce((sum, frame) => sum + frame.durationMs, 0) ?? 0
  const playbackState = useMemo(() => animation ? interpolateFrames(animation.frames, playhead, animation.interpolation, animation.loopMode, playDirection) : null, [animation, playhead, playDirection])
  const displayTransforms = playing && playbackState ? playbackState.transforms : currentTransforms
  const displayJoints = playing && playbackState ? playbackState.joints : currentJoints
  const displayBase = animation ? rigProject : baseProject
  const tintParts = displayBase?.parts
  const displayProject = useMemo(() => displayBase
    ? applyFrameState(displayBase, displayTransforms, displayJoints.length ? displayJoints : displayBase.joints)
    : null, [displayBase, displayTransforms, displayJoints])
  const parts = useMemo(() => displayProject ? orderedParts(displayProject.parts, displayProject.layerOrder).filter((part) => !displayProject.hiddenPartIds?.includes(part.id)) : [], [displayProject])
  const selectedPart = displayProject?.parts.find((part) => part.id === selectedPartId) ?? null
  const selectedCanTransform = Boolean(selectedPart && (!isCorePart(selectedPart) || allowCorePartId === selectedPart.id) && !playing && !saving)
  const scale = displayProject && stageSize.width > 1 && stageSize.height > 1 ? Math.max(.05, Math.min((stageSize.width - 64) / displayProject.width, (stageSize.height - 64) / displayProject.height)) * zoom : 1
  const layerStride = Math.max(16, (selectedCharacter?.customization.wardrobeGroups?.length ?? 0) * 12 + 16)
  const layerIndex = useMemo(() => new Map(displayProject ? orderedParts(displayProject.parts, displayProject.layerOrder).map((part, index) => [part.id, index]) : []), [displayProject])
  const [wardrobeDetails, setWardrobeDetails] = useState<Record<string, WardrobeSet>>({})
  const [hairStyles, setHairStyles] = useState<Record<string, HairStyle>>({})
  const [faceSets, setFaceSets] = useState<Record<string, FaceSet>>({})
  const [faceItems, setFaceItems] = useState<Record<string, FaceCatalogItem>>({})
  const [tintedParts, setTintedParts] = useState<Record<string, string>>({})
  const headOverlays = useMemo(() => buildAnimatorHeadOverlays({
    rigProject,
    displayProject,
    selectedCharacter,
    hairStyles,
    faceItems,
    faceSets,
    layerIndex,
    layerStride
  }), [rigProject, displayProject, selectedCharacter, hairStyles, faceItems, faceSets, layerIndex, layerStride])
  const garmentLayers = useMemo(() => buildAnimatorGarmentLayers({
    rigProject,
    displayProject,
    wardrobeGroups: selectedCharacter?.customization.wardrobeGroups ?? [],
    wardrobeDetails,
    layerIndex,
    layerStride
  }), [rigProject, displayProject, selectedCharacter, wardrobeDetails, layerIndex, layerStride])

  const pushHistory = useCallback((before = stateRef.current) => {
    if (!before) return
    setUndoStack((current) => [...current, structuredClone(before)].slice(-HISTORY_LIMIT))
    setRedoStack([])
  }, [])

  const setEditorState = useCallback((next: FrameHistoryState, record = false) => {
    if (record) pushHistory(stateRef.current)
    stateRef.current = next
    setAnimation(next.animation)
    setCurrentTransforms(next.transforms)
    setCurrentJoints(next.joints)
    setSelectedFrameId(next.frameId)
  }, [pushHistory])

  useEffect(() => {
    let live = true
    void Promise.all([window.desktop.fabricator.listFabricatorSlots(), window.desktop.customizer.listCustomizerCharacters(), window.desktop.fabricator.listAnimatorModelSlots()]).then(([slots, savedCharacters, savedAnimationSlots]) => {
      if (!live) return
      setModels(slots); setCharacters(savedCharacters); setAnimationSourceSlots(savedAnimationSlots)
      const preferredExists = Boolean(slots[baseModelSlot - 1])
      setModelSlot(preferredExists ? baseModelSlot : slots.find((slot) => slot)?.slot ?? savedAnimationSlots[0] ?? 1)
    }).catch((reason: unknown) => { if (live) setError(reason instanceof Error ? reason.message : 'Não foi possível carregar modelos e personagens.') }).finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [baseModelSlot])

  useEffect(() => {
    let live = true
    if (modelSlot === null) { setSource(null); setBaseProject(null); return }
    setSource(null); setBaseProject(null); setPlaying(false)
    void window.desktop.fabricator.loadFabricatorSlot(modelSlot).then(async (project) => {
      if (!live) return
      setSource(projectForOriginalPreview(project))
      if (!project) { setBaseProject(null); return }
      const character = selectedCharacter?.customization.modelSlot === modelSlot ? selectedCharacter : null
      const poseSlot = character?.customization.poseSlot
      if (poseSlot !== null && poseSlot !== undefined) {
        const pose = await window.desktop.fabricator.loadFabricatorPose(modelSlot, poseSlot)
        if (live) setBaseProject(pose ? makePoseProject(project, pose) : projectForOriginalPreview(project))
      } else setBaseProject(project)
    }).catch((reason: unknown) => { if (live) setError(reason instanceof Error ? reason.message : 'Não foi possível carregar o modelo selecionado.') })
    return () => { live = false }
  }, [modelSlot, selectedCharacter?.id, selectedCharacter?.customization.modelSlot, selectedCharacter?.customization.poseSlot])

  useEffect(() => {
    let live = true
    if (modelSlot === null) return
    setLoading(true); setAnimation(null); setCurrentTransforms({}); setCurrentJoints([]); savedAnimationRef.current = null
    void Promise.all([window.desktop.fabricator.listAnimatorAnimations(modelSlot), window.desktop.fabricator.loadAnimatorDraft(modelSlot)]).then(([items, savedDraft]) => {
      if (!live) return
      setSummaries(items); setDraft(savedDraft)
      if (savedDraft) {
        const firstEmpty = Array.from({ length: SLOT_COUNT }, (_, index) => index + 1).find((slot) => !items.some((item) => item.slot === slot)) ?? 1
        setActiveSlot(savedDraft.editingSlot ?? firstEmpty)
      } else if (items.length) setActiveSlot(items[0].slot)
      else setActiveSlot(1)
    }).catch((reason: unknown) => { if (live) setError(reason instanceof Error ? reason.message : 'Não foi possível abrir a biblioteca de animações.') }).finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [modelSlot])

  useEffect(() => {
    if (!selectedCharacter || selectedCharacter.customization.modelSlot === null) return
    let live = true
    const model = selectedCharacter.customization.modelSlot
    const load = async () => {
      const groups = selectedCharacter.customization.wardrobeGroups ?? []
      const sets = await Promise.all(groups.filter((group) => group.modelSlot === model).map(async (group) => {
        const key = `${model}:${group.setId}`
        const cached = wardrobeDetails[key]
        return [key, cached ?? await window.desktop.fabricator.loadWardrobeSet(model, group.setId)] as const
      }))
      const appearance = selectedCharacter.customization.hairAppearance
      const hairIds = appearance?.modelSlot === model ? [appearance.frontStyleId, appearance.backStyleId, appearance.styleId].filter((id): id is string => Boolean(id)) : []
      const styles = await Promise.all(hairIds.map(async (id) => [`${model}:${id}`, hairStyles[`${model}:${id}`] ?? await window.desktop.fabricator.loadHairStyle(model, id)] as const))
      const face = selectedCharacter.customization.faceAppearance
      const legacyFace = face?.modelSlot === model && face.setId && !faceSets[`${model}:${face.setId}`] ? await window.desktop.fabricator.loadFaceSet(model, face.setId) : null
      const ids = face?.modelSlot === model ? [face.eyeCatalogId, face.eyebrowCatalogId, face.noseCatalogId, face.mouthClosedCatalogId, face.mouthOpenCatalogId].filter((id): id is string => Boolean(id)) : []
      const items = await Promise.all(ids.map(async (id) => [`${model}:${id}`, faceItems[`${model}:${id}`] ?? await window.desktop.fabricator.loadFaceCatalogItem(model, id)] as const))
      if (!live) return
      setWardrobeDetails((current) => ({ ...current, ...Object.fromEntries(sets.filter((entry): entry is [string, WardrobeSet] => Boolean(entry[1]))) }))
      setHairStyles((current) => { const next = { ...current }; for (const [key, style] of styles) if (style) next[key] = style; return next })
      if (legacyFace) setFaceSets((current) => ({ ...current, [`${model}:${legacyFace.id}`]: legacyFace }))
      setFaceItems((current) => { const next = { ...current }; for (const [key, item] of items) if (item) next[key] = item; return next })
    }
    void load().catch((reason: unknown) => { if (live) setError(reason instanceof Error ? reason.message : 'Não foi possível carregar os itens deste personagem.') })
    return () => { live = false }
  }, [selectedCharacter?.id])

  useEffect(() => {
    let live = true
    const tone = selectedCharacter?.customization.modelSkinTone ?? sharedModelAppearance?.modelSkinTone ?? displayBase?.modelSkinTone
    const outlineColor = selectedCharacter?.customization.modelOutlineColor ?? sharedModelAppearance?.modelOutlineColor ?? displayBase?.modelOutlineColor
    if ((!tone && !outlineColor) || !tintParts) { setTintedParts({}); return }
    void Promise.all(tintParts.map(async (part) => {
      if (!isModelBodyPartName(part.name)) return [part.id, part.dataUrl] as const
      const image = await loadImage(part.dataUrl)
      const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth || image.width; canvas.height = image.naturalHeight || image.height
      const context = canvas.getContext('2d', { willReadFrequently: true }); if (!context) return [part.id, part.dataUrl] as const
      context.drawImage(image, 0, 0); const pixels = context.getImageData(0, 0, canvas.width, canvas.height)
      tintModelBodyPixels(pixels, tone, outlineColor, part.fakeSkinContours)
      context.putImageData(pixels, 0, 0); return [part.id, canvas.toDataURL('image/png')] as const
    })).then((entries) => { if (live) setTintedParts(Object.fromEntries(entries)) }).catch((reason: unknown) => { if (live) setError(reason instanceof Error ? reason.message : 'Não foi possível colorir a pele da prévia.') })
    return () => { live = false }
  }, [tintParts, selectedCharacter?.customization.modelSkinTone, selectedCharacter?.customization.modelOutlineColor, sharedModelAppearance?.modelSkinTone, sharedModelAppearance?.modelOutlineColor, displayBase?.modelSkinTone, displayBase?.modelOutlineColor])

  useEffect(() => {
    const element = stageRef.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => setStageSize({ width: entry.contentRect.width, height: entry.contentRect.height }))
    observer.observe(element); return () => observer.disconnect()
  }, [largePreview])

  const makeInitialAnimation = useCallback(async (slot: number, project: FabricatorProject, name: string): Promise<AnimatorAnimation> => {
    const transforms = transformsFromProject(project)
    const thumbnail = await renderThumbnail(project, transforms)
    const frame: AnimatorFrame = { id: crypto.randomUUID(), durationMs: 250, transforms, joints: structuredClone(project.joints), thumbnailDataUrl: thumbnail }
    return {
      schemaVersion: 1, slot, name, sourceModelSlot: project.slot, sourceModelName: project.name,
      sourceModelUpdatedAt: source?.updatedAt ?? project.updatedAt, sourceModelPartCount: source?.parts.length ?? project.parts.length,
      basePoseSlot: selectedCharacter?.customization.poseSlot ?? null, characterId: selectedCharacter?.id ?? null,
      width: project.width, height: project.height, parts: structuredClone(project.parts), joints: structuredClone(project.joints),
      layerOrder: normalizeLayerOrder(project.parts, project.layerOrder), hiddenPartIds: [...(project.hiddenPartIds ?? [])], frames: [frame],
      interpolation: 'smooth', loopMode: 'loop', speed: 1, thumbnailDataUrl: thumbnail, updatedAt: new Date().toISOString()
    }
  }, [source, selectedCharacter])

  const persistDraftNow = async (snapshot = animation, targetSlot = activeSlot, editorState = stateRef.current, removeMatchingDraftWhenClean = true) => {
    if (!snapshot || !editorState) return
    if (draftTimer.current !== null) clearTimeout(draftTimer.current)
    draftTimer.current = null
    const frame = snapshot.frames.find((item) => item.id === editorState.frameId)
    const stateIsDirty = Boolean(frame && (JSON.stringify(frame.transforms) !== JSON.stringify(editorState.transforms) || JSON.stringify(frame.joints) !== JSON.stringify(editorState.joints)))
    const documentIsDirty = savedAnimationRef.current === null || JSON.stringify(serializeAnimation(snapshot)) !== savedAnimationRef.current || stateIsDirty
    if (!documentIsDirty) {
      await writeQueue.current
      if (!removeMatchingDraftWhenClean) return
      const existing = await window.desktop.fabricator.loadAnimatorDraft(snapshot.sourceModelSlot)
      if (existing?.editingSlot === targetSlot) await window.desktop.fabricator.deleteAnimatorDraft(snapshot.sourceModelSlot)
      if (mountedRef.current) setDraft(null)
      return
    }
    const serialized = serializeDraft(snapshot, targetSlot, editorState, stateIsDirty)
    const assets: AnimatorAnimationAsset[] = draftAssetsPersisted.current ? [] : snapshot.parts.flatMap((part) => pendingAssets.current.has(part.id) ? [{ id: part.id, dataUrl: pendingAssets.current.get(part.id)! }] : [])
    const next = writeQueue.current.catch(() => undefined).then(() => window.desktop.fabricator.saveAnimatorDraft(snapshot.sourceModelSlot, serialized, assets))
    writeQueue.current = next
    await next
    draftAssetsPersisted.current = true
    if (mountedRef.current) setDraft(serialized)
  }

  const flushDraftAndQueue = async () => {
    if (draftTimer.current !== null) clearTimeout(draftTimer.current)
    draftTimer.current = null
    const current = stateRef.current
    const active = current?.animation
    if (active && current) {
      await persistDraftNow(active, active.slot, current, false)
      return
    }
    await writeQueue.current
  }
  draftFlushRef.current = flushDraftAndQueue

  useEffect(() => {
    mountedRef.current = true
    const unregister = registerPendingWriteFlusher(() => draftFlushRef.current())
    return () => {
      mountedRef.current = false
      unregister()
      if (draftTimer.current !== null) clearTimeout(draftTimer.current)
      draftTimer.current = null
    }
  }, [])

  const createAnimation = async () => {
    if (saving) return
    if (!baseProject) { setError('Escolha um modelo salvo antes de criar uma animação.'); return }
    if (animation) {
      const changed = savedAnimationRef.current === null || JSON.stringify(serializeAnimation(animation)) !== savedAnimationRef.current || dirtyFrame
      if (changed) {
        if (!window.confirm('A animação atual tem alterações. Salvar no slot antes de criar outra?')) return
        if (!await saveAnimation()) return
      }
    }
    if (draft && !animation) {
      if (!window.confirm('Existe um rascunho recuperável. Descartar e começar uma animação nova?')) return
      await window.desktop.fabricator.deleteAnimatorDraft(modelSlot!)
      setDraft(null)
    }
    const occupied = new Set(summaries.map((item) => item.slot))
    if (animation && savedAnimationRef.current !== null) occupied.add(animation.slot)
    const slot = Array.from({ length: SLOT_COUNT }, (_, index) => index + 1).find((candidate) => !occupied.has(candidate)) ?? 0
    if (!slot) { setError('Os 12 slots deste modelo estão ocupados. Exclua uma animação para liberar espaço.'); return }
    const name = `Animação ${String(slot).padStart(2, '0')}`
    try {
      const created = await makeInitialAnimation(slot, baseProject, name)
      pendingAssets.current = new Map(created.parts.map((part) => [part.id, part.dataUrl]))
      draftAssetsPersisted.current = false
      savedAnimationRef.current = null
      setAnimation(created); setActiveSlot(slot); setSelectedFrameId(created.frames[0].id); setSelectedPartId(created.parts[0]?.id ?? '')
      setCurrentTransforms(created.frames[0].transforms); setCurrentJoints(created.frames[0].joints); setUndoStack([]); setRedoStack([]); playheadRef.current = 0; setPlayhead(0); setError(''); setSaveMessage('Rascunho novo')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível criar a animação.') }
  }

  const createBreathingSet = async () => {
    if (!source || modelSlot === null || breathingSaving || saving) return
    setBreathingSaving(true); setError('')
    const createdSlots: number[] = []
    let previousBreathing: AnimatorAnimation[] = []
    let replacementStarted = false
    try {
      const [poseSummaries, summariesBefore] = await Promise.all([
        window.desktop.fabricator.listFabricatorPoseSlots(modelSlot),
        window.desktop.fabricator.listAnimatorAnimations(modelSlot)
      ])
      const oldBreathing = await Promise.all(summariesBefore.filter((item) => item.name.startsWith('Respiração ·')).map(async (item) => {
        const saved = await window.desktop.fabricator.loadAnimatorAnimation(modelSlot, item.slot)
        if (!saved) throw new Error(`Não consegui ler a animação de respiração no slot ${item.slot}; não alterei nenhum slot.`)
        return saved
      }))
      previousBreathing = oldBreathing
      const poses = await Promise.all(poseSummaries.map(async (summary) => {
        if (!summary) return null
        const pose = await window.desktop.fabricator.loadFabricatorPose(modelSlot, summary.slot)
        return pose ? { pose, category: resolvePoseCategory(pose) } : null
      }))
      const standing = poses.find((entry) => entry?.category.toLocaleLowerCase('pt-BR').includes('parad'))
      const sitting = poses.find((entry) => entry?.category.toLocaleLowerCase('pt-BR').includes('sentad'))
      if (!standing || !sitting) throw new Error('Salve pelo menos uma pose “Parado” e uma “Sentado” em Poses Dev para criar as variações.')
      const replaceable = new Set(oldBreathing.map((item) => item.slot))
      const occupied = new Set(summariesBefore.filter((item) => !replaceable.has(item.slot)).map((item) => item.slot))
      const freeSlots = Array.from({ length: SLOT_COUNT }, (_, index) => index + 1).filter((slot) => !occupied.has(slot))
      const needed = breathingVariations.length * 2
      if (freeSlots.length < needed) throw new Error(`São necessários ${needed} slots livres; este modelo tem ${freeSlots.length}. Libere slots sem animação para continuar.`)
      const plans = [
        ...breathingVariations.map((variation) => ({ pose: standing.pose, variation })),
        ...breathingVariations.map((variation) => ({ pose: sitting.pose, variation }))
      ]
      const newAnimations = await Promise.all(plans.map((plan, index) => createBreathingAnimation(source, plan.pose, freeSlots[index], characterId || null, plan.variation, renderThumbnail)))
      replacementStarted = true
      for (const old of oldBreathing) await window.desktop.fabricator.deleteAnimatorAnimation(modelSlot, old.slot)
      for (const animation of newAnimations) {
        const assets: AnimatorAnimationAsset[] = animation.parts.map((part) => ({ id: part.id, dataUrl: part.dataUrl }))
        await window.desktop.fabricator.saveAnimatorAnimation(modelSlot, animation.slot, serializeAnimation(animation), assets)
        createdSlots.push(animation.slot)
      }
      const updated = await window.desktop.fabricator.listAnimatorAnimations(modelSlot)
      setSummaries(updated)
      setSaveMessage('8 variações de respiração salvas')
      setBreathingDialog(false)
    } catch (reason) {
      // This batch owns only the empty slots reserved above; roll back its partial writes.
      await Promise.all(createdSlots.map((slot) => window.desktop.fabricator.deleteAnimatorAnimation(modelSlot, slot).catch(() => undefined)))
      // If a write failed after replacement began, restore the old breathing set.
      if (replacementStarted) for (const old of previousBreathing) {
        const assets: AnimatorAnimationAsset[] = old.parts.map((part) => ({ id: part.id, dataUrl: part.dataUrl }))
        await window.desktop.fabricator.saveAnimatorAnimation(modelSlot, old.slot, serializeAnimation(old), assets).catch(() => undefined)
      }
      if (replacementStarted) setSummaries(await window.desktop.fabricator.listAnimatorAnimations(modelSlot).catch(() => summaries))
      setError(reason instanceof Error ? reason.message : 'Não foi possível criar as animações de respiração.')
    } finally { setBreathingSaving(false) }
  }

  const selectAnimationSlot = async (slot: number) => {
    if (saving) return
    if (animation) {
      const changed = savedAnimationRef.current === null || JSON.stringify(serializeAnimation(animation)) !== savedAnimationRef.current || dirtyFrame
      if (changed) {
        if (!window.confirm('A animação atual tem alterações. Salvar no slot antes de trocar?')) return
        if (!await saveAnimation()) return
      } else await persistDraftNow()
    }
    else if (draft && draft.editingSlot !== slot && !window.confirm('Há um rascunho recuperável. Descartar esse rascunho para abrir outro slot?')) return
    else if (draft && draft.editingSlot !== slot) { await window.desktop.fabricator.deleteAnimatorDraft(modelSlot!); setDraft(null) }
    else if (draft && draft.editingSlot === slot && !window.confirm('Este slot tem um rascunho recuperável. Abrir a versão salva e descartar o rascunho?')) return
    else if (draft && draft.editingSlot === slot) { await window.desktop.fabricator.deleteAnimatorDraft(modelSlot!); setDraft(null) }
    setPlaying(false); setActiveSlot(slot); setError('')
    const loadId = ++animationLoadId.current
    const summary = summaries.find((item) => item.slot === slot)
    if (!summary) { setLoading(false); setAnimation(null); setSelectedFrameId(''); setCurrentTransforms({}); setCurrentJoints([]); setSelectedPartId(''); return }
    setLoading(true); setAnimation(null); setCurrentTransforms({}); setCurrentJoints([]); savedAnimationRef.current = null
    try {
      const loaded = await window.desktop.fabricator.loadAnimatorAnimation(summary.sourceModelSlot, slot)
      if (loadId !== animationLoadId.current) return
      if (!loaded) throw new Error('A animação não pôde ser carregada.')
      const first = loaded.frames[0]
      savedAnimationRef.current = JSON.stringify(serializeAnimation(loaded))
      pendingAssets.current = new Map(loaded.parts.map((part) => [part.id, part.dataUrl])); draftAssetsPersisted.current = false
      setAnimation(loaded); setSelectedFrameId(first.id); setCurrentTransforms(first.transforms); setCurrentJoints(first.joints); setSelectedPartId(loaded.parts[0]?.id ?? '')
      setCharacterId(characters.find((character) => character.id === loaded.characterId && character.customization.modelSlot === loaded.sourceModelSlot)?.id ?? '')
      setModelSlot(loaded.sourceModelSlot); setUndoStack([]); setRedoStack([]); playheadRef.current = 0; setPlayhead(0)
      const currentModel = await window.desktop.fabricator.loadFabricatorSlot(loaded.sourceModelSlot)
      if (loadId !== animationLoadId.current) return
      if (currentModel && (currentModel.updatedAt !== loaded.sourceModelUpdatedAt || currentModel.name !== loaded.sourceModelName || currentModel.parts.length !== loaded.sourceModelPartCount)) setError('A origem deste modelo mudou desde a criação. A animação continua usando a cópia original salva.')
      if (!currentModel) setError('O modelo de origem foi removido. A cópia guardada na animação continua disponível para edição.')
    } catch (reason) { if (loadId === animationLoadId.current) setError(reason instanceof Error ? reason.message : 'Não foi possível abrir a animação.') }
    finally { if (loadId === animationLoadId.current) setLoading(false) }
  }

  const saveAnimation = async (): Promise<boolean> => {
    if (!animation || saving) return false
    if (draftTimer.current !== null) clearTimeout(draftTimer.current)
    draftTimer.current = null
    setSaving(true); setError('')
    try {
      await writeQueue.current.catch(() => undefined)
      let snapshot = animation
      if (dirtyFrame && displayBase && selectedFrame) {
        const thumbnail = await renderThumbnail(displayBase, currentTransforms)
        const frame: AnimatorFrame = { id: crypto.randomUUID(), durationMs: selectedFrame.durationMs, transforms: structuredClone(currentTransforms), joints: structuredClone(currentJoints), thumbnailDataUrl: thumbnail }
        const frames = [...animation.frames]; frames.splice(Math.max(0, selectedFrameIndex + 1), 0, frame)
        snapshot = { ...animation, frames, thumbnailDataUrl: frames[0].thumbnailDataUrl }
        setAnimation(snapshot); setSelectedFrameId(frame.id)
      }
      const updated = { ...snapshot, updatedAt: new Date().toISOString(), thumbnailDataUrl: snapshot.frames[0]?.thumbnailDataUrl ?? snapshot.thumbnailDataUrl }
      const assets: AnimatorAnimationAsset[] = updated.parts.flatMap((part) => pendingAssets.current.has(part.id) ? [{ id: part.id, dataUrl: pendingAssets.current.get(part.id)! }] : [])
      await window.desktop.fabricator.saveAnimatorAnimation(updated.sourceModelSlot, updated.slot, serializeAnimation(updated), assets)
      const savedDraft = await window.desktop.fabricator.loadAnimatorDraft(updated.sourceModelSlot)
      if (savedDraft?.editingSlot === updated.slot) await window.desktop.fabricator.deleteAnimatorDraft(updated.sourceModelSlot)
      writeQueue.current = Promise.resolve()
      pendingAssets.current = new Map(updated.parts.map((part) => [part.id, part.dataUrl]))
      draftAssetsPersisted.current = false
      savedAnimationRef.current = JSON.stringify(serializeAnimation(updated))
      setAnimation(updated); setDraft(null); setSummaries((current) => [...current.filter((item) => item.slot !== updated.slot), {
        slot: updated.slot, sourceModelSlot: updated.sourceModelSlot, name: updated.name, sourceModelName: updated.sourceModelName,
        sourceModelUpdatedAt: updated.sourceModelUpdatedAt, sourceModelPartCount: updated.sourceModelPartCount,
        thumbnailDataUrl: updated.thumbnailDataUrl, updatedAt: updated.updatedAt
      }].sort((a, b) => a.slot - b.slot)); setSaveMessage('Animação salva'); return true
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível salvar a animação.'); return false }
    finally { setSaving(false) }
  }

  const renameAnimation = () => {
    if (saving || !animation) return
    setNameDialog({ mode: 'rename', value: animation.name })
  }

  const updatePlaybackSettings = (patch: Partial<Pick<AnimatorAnimation, 'interpolation' | 'loopMode' | 'speed'>>) => {
    if (!animation) return
    pushHistory()
    const updated = { ...animation, ...patch }
    setAnimation(updated)
    if (stateRef.current) stateRef.current = { ...stateRef.current, animation: updated }
  }

  const moveAnimationLayer = (partId: string, direction: -1 | 1) => {
    if (!animation || saving || playing) return
    const frontToBack = normalizeLayerOrder(animation.parts, animation.layerOrder).reverse()
    const index = frontToBack.indexOf(partId)
    const target = index + direction
    if (index < 0 || target < 0 || target >= frontToBack.length) return
    const before = stateRef.current
    pushHistory(before)
    ;[frontToBack[index], frontToBack[target]] = [frontToBack[target], frontToBack[index]]
    const updated: AnimatorAnimation = { ...animation, layerOrder: frontToBack.reverse(), updatedAt: new Date().toISOString() }
    setAnimation(updated)
    if (before) stateRef.current = { ...before, animation: updated }
  }

  const duplicateAnimation = async (requestedName: string) => {
    if (saving || !animation) return
    if (savedAnimationRef.current === null || JSON.stringify(serializeAnimation(animation)) !== savedAnimationRef.current || dirtyFrame) {
      if (!window.confirm('A animação atual tem alterações. Salvar antes de duplicar?')) return
      if (!await saveAnimation()) return
    }
    const slot = Array.from({ length: SLOT_COUNT }, (_, index) => index + 1).find((candidate) => !summaries.some((item) => item.slot === candidate)) ?? 0
    if (!slot) { setError('Os 12 slots deste modelo estão ocupados.'); return }
    const name = requestedName.trim()
    if (!name) return
    const copy = { ...structuredClone(animation), slot, name, frames: animation.frames.map((frame) => ({ ...structuredClone(frame), id: crypto.randomUUID() })), updatedAt: new Date().toISOString() }
    pendingAssets.current = new Map(copy.parts.map((part) => [part.id, part.dataUrl])); draftAssetsPersisted.current = false
    savedAnimationRef.current = null
    setAnimation(copy); setActiveSlot(slot); setSelectedFrameId(copy.frames[0].id); setCurrentTransforms(copy.frames[0].transforms); setCurrentJoints(copy.frames[0].joints); setUndoStack([]); setRedoStack([]); setSaveMessage('Cópia não salva')
  }

  const submitNameDialog = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const name = nameDialog?.value.trim()
    if (!name || !nameDialog) return
    if (nameDialog.mode === 'rename' && animation) {
      pushHistory(); setAnimation((current) => current ? { ...current, name, updatedAt: new Date().toISOString() } : current)
    } else if (nameDialog.mode === 'duplicate') void duplicateAnimation(name)
    setNameDialog(null)
  }

  const deleteAnimation = async () => {
    if (saving || !animation || !window.confirm(`Excluir a animação “${animation.name}” do slot ${animation.slot}?`)) return
    if (draftTimer.current !== null) clearTimeout(draftTimer.current)
    draftTimer.current = null
    try {
      await writeQueue.current.catch(() => undefined)
      await window.desktop.fabricator.deleteAnimatorAnimation(animation.sourceModelSlot, animation.slot)
      const savedDraft = await window.desktop.fabricator.loadAnimatorDraft(animation.sourceModelSlot)
      if (savedDraft?.editingSlot === animation.slot) await window.desktop.fabricator.deleteAnimatorDraft(animation.sourceModelSlot)
      writeQueue.current = Promise.resolve()
      setSummaries((current) => current.filter((item) => item.slot !== animation.slot)); setAnimation(null); setCurrentTransforms({}); setCurrentJoints([]); setSelectedFrameId(''); setSelectedPartId(''); setSaveMessage(''); setDraft(null); savedAnimationRef.current = null
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível excluir a animação.') }
  }

  const saveFrame = async () => {
    if (saving || !animation || !displayBase || !dirtyFrame) return
    const thumbnail = await renderThumbnail(displayBase, currentTransforms)
    const frame: AnimatorFrame = { id: crypto.randomUUID(), durationMs: selectedFrame?.durationMs ?? 250, transforms: structuredClone(currentTransforms), joints: structuredClone(currentJoints), thumbnailDataUrl: thumbnail }
    pushHistory()
    const frames = [...animation.frames]; const insertion = Math.max(0, selectedFrameIndex + 1); frames.splice(insertion, 0, frame)
    const next = { ...animation, frames, thumbnailDataUrl: frames[0].thumbnailDataUrl, updatedAt: new Date().toISOString() }
    setAnimation(next); setSelectedFrameId(frame.id); setSaveMessage('Frame adicionado'); setError('')
  }

  const selectFrame = (frame: AnimatorFrame) => {
    if (dirtyFrame && !window.confirm('As alterações deste frame ainda não foram gravadas. Descartar essas alterações e abrir o outro frame?')) return
    const startTime = animation?.frames.slice(0, animation.frames.indexOf(frame)).reduce((sum, item) => sum + item.durationMs, 0) ?? 0
    playheadRef.current = startTime
    setPlaying(false); setSelectedFrameId(frame.id); setCurrentTransforms(structuredClone(frame.transforms)); setCurrentJoints(structuredClone(frame.joints)); setPlayhead(startTime)
  }

  const duplicateFrame = () => {
    if (!animation || !selectedFrame) return
    pushHistory(); const copy = { ...structuredClone(selectedFrame), id: crypto.randomUUID() }
    const frames = [...animation.frames]; frames.splice(selectedFrameIndex + 1, 0, copy)
    setAnimation({ ...animation, frames }); setSelectedFrameId(copy.id); setCurrentTransforms(copy.transforms); setCurrentJoints(copy.joints)
  }

  const deleteFrame = () => {
    if (!animation || animation.frames.length <= 1 || !selectedFrame) return
    pushHistory(); const frames = animation.frames.filter((frame) => frame.id !== selectedFrame.id); const nextIndex = Math.max(0, selectedFrameIndex - 1); const frame = frames[nextIndex]
    setAnimation({ ...animation, frames, thumbnailDataUrl: frames[0].thumbnailDataUrl }); setSelectedFrameId(frame.id); setCurrentTransforms(frame.transforms); setCurrentJoints(frame.joints)
  }

  const reorderFrame = (offset: -1 | 1) => {
    if (!animation || selectedFrameIndex < 0) return
    const target = selectedFrameIndex + offset; if (target < 0 || target >= animation.frames.length) return
    pushHistory(); const frames = [...animation.frames]; [frames[selectedFrameIndex], frames[target]] = [frames[target], frames[selectedFrameIndex]]
    const startTime = frames.slice(0, target).reduce((sum, frame) => sum + frame.durationMs, 0)
    setAnimation({ ...animation, frames }); playheadRef.current = startTime; setPlayhead(startTime)
  }

  const changeFrameDuration = (value: number) => {
    if (!animation || !selectedFrame || !Number.isFinite(value)) return
    const duration = Math.max(40, Math.min(10000, value))
    if (duration === selectedFrame.durationMs) return
    pushHistory(); setAnimation({ ...animation, frames: animation.frames.map((frame) => frame.id === selectedFrame.id ? { ...frame, durationMs: duration } : frame) })
  }

  const undo = () => {
    if (saving) return
    const previous = undoStack.at(-1); const current = stateRef.current
    if (!previous || !current) return
    setRedoStack((stack) => [...stack, structuredClone(current)].slice(-HISTORY_LIMIT)); setUndoStack((stack) => stack.slice(0, -1)); setEditorState(previous)
  }
  const redo = () => {
    if (saving) return
    const next = redoStack.at(-1); const current = stateRef.current
    if (!next || !current) return
    setUndoStack((stack) => [...stack, structuredClone(current)].slice(-HISTORY_LIMIT)); setRedoStack((stack) => stack.slice(0, -1)); setEditorState(next)
  }

  const transformSelected = (axis: 'x' | 'y' | 'rotation', value: number) => {
    if (!animation || !selectedPart || !selectedCanTransform || !Number.isFinite(value)) return
    pushHistory()
    let next = stateRef.current
    if (!next) return
    const currentPart = displayProject?.parts.find((part) => part.id === selectedPart.id)
    if (!currentPart) return
    if (axis === 'rotation') next = rotateFramePart(displayBase!, next, selectedPart.id, value - currentPart.rotation, includeChildren)
    else next = moveFramePart(displayBase!, next, selectedPart.id, axis === 'x' ? value - currentPart.x : 0, axis === 'y' ? value - currentPart.y : 0, includeChildren)
    if (!applyToAllFrames || !selectedFrame) { setEditorState(next); return }
    const delta = axis === 'rotation' ? value - currentPart.rotation : 0
    const dx = axis === 'x' ? value - currentPart.x : 0
    const dy = axis === 'y' ? value - currentPart.y : 0
    const frames = animation.frames.map((frame) => {
      const before: FrameHistoryState = { animation, transforms: frame.transforms, joints: frame.joints, frameId: frame.id }
      const after = frame.id === selectedFrame.id ? next : axis === 'rotation'
        ? rotateFramePart(displayBase!, before, selectedPart.id, delta, includeChildren)
        : moveFramePart(displayBase!, before, selectedPart.id, dx, dy, includeChildren)
      return { ...frame, transforms: after.transforms, joints: after.joints }
    })
    const updated = { ...animation, frames, thumbnailDataUrl: frames[0].thumbnailDataUrl }
    setAnimation(updated); setEditorState({ ...next, animation: updated })
    void Promise.all(frames.map(async (frame) => ({ id: frame.id, thumbnailDataUrl: await renderThumbnail(displayBase!, frame.transforms) }))).then((thumbs) => {
      setAnimation((current) => current?.slot === updated.slot ? { ...current, thumbnailDataUrl: thumbs[0]?.thumbnailDataUrl ?? current.thumbnailDataUrl, frames: current.frames.map((frame) => ({ ...frame, thumbnailDataUrl: thumbs.find((thumb) => thumb.id === frame.id)?.thumbnailDataUrl ?? frame.thumbnailDataUrl })) } : current)
    })
  }

  const beginDrag = (event: ReactPointerEvent<HTMLImageElement>, part: PosePart) => {
    if (!animation || playing || !displayProject) return
    event.preventDefault(); event.stopPropagation(); setSelectedPartId(part.id)
    if (isCorePart(part) && allowCorePartId !== part.id) return
    const rect = event.currentTarget.closest('.animator-artboard')?.getBoundingClientRect()
    const pivot = partJointAnchor(part, displayProject.joints) ?? { x: part.x + part.width / 2, y: part.y + part.height / 2 }
    const pivotX = (rect?.left ?? 0) + pivot.x * scale, pivotY = (rect?.top ?? 0) + pivot.y * scale
    event.currentTarget.setPointerCapture(event.pointerId)
    const angle = Math.atan2(event.clientY - pivotY, event.clientX - pivotX) * 180 / Math.PI
    gestureRef.current = { pointerId: event.pointerId, partId: part.id, startX: event.clientX, startY: event.clientY, lastAngle: angle, rotationDelta: 0, before: structuredClone(stateRef.current!), pivotX, pivotY, scale, mode: dragMode }
  }

  const moveDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const panGesture = panGestureRef.current
    if (panGesture?.pointerId === event.pointerId) {
      setPan({ x: panGesture.originX + event.clientX - panGesture.startX, y: panGesture.originY + event.clientY - panGesture.startY })
      return
    }
    const gesture = gestureRef.current
    if (!gesture || gesture.pointerId !== event.pointerId || !displayBase) return
    if (gesture.mode === 'rotate') {
      const angle = Math.atan2(event.clientY - gesture.pivotY, event.clientX - gesture.pivotX) * 180 / Math.PI
      gesture.rotationDelta += shortestAngle(gesture.lastAngle, angle); gesture.lastAngle = angle
      setEditorState(rotateFramePart(displayBase, gesture.before, gesture.partId, gesture.rotationDelta, includeChildren))
    } else {
      const dx = (event.clientX - gesture.startX) / gesture.scale, dy = (event.clientY - gesture.startY) / gesture.scale
      setEditorState(moveFramePart(displayBase, gesture.before, gesture.partId, dx, dy, includeChildren))
    }
  }

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (panGestureRef.current?.pointerId === event.pointerId) { panGestureRef.current = null; return }
    const gesture = gestureRef.current
    if (!gesture || gesture.pointerId !== event.pointerId) return
    gestureRef.current = null
    const after = stateRef.current
    if (JSON.stringify(gesture.before.transforms) !== JSON.stringify(after?.transforms)) {
      pushHistory(gesture.before)
      if (applyToAllFrames && animation && displayBase && after) {
        const beforePart = gesture.before.transforms[gesture.partId], afterPart = after.transforms[gesture.partId]
        if (beforePart && afterPart) {
          const deltaAngle = afterPart.rotation - beforePart.rotation
          const dx = afterPart.x - beforePart.x, dy = afterPart.y - beforePart.y
          const frames = animation.frames.map((frame) => {
            if (frame.id === after.frameId) return { ...frame, transforms: after.transforms, joints: after.joints }
            const state: FrameHistoryState = { animation, transforms: frame.transforms, joints: frame.joints, frameId: frame.id }
            const changed = gesture.mode === 'rotate' ? rotateFramePart(displayBase, state, gesture.partId, deltaAngle, includeChildren) : moveFramePart(displayBase, state, gesture.partId, dx, dy, includeChildren)
            return { ...frame, transforms: changed.transforms, joints: changed.joints }
          })
          const updated = { ...animation, frames }
          setAnimation(updated); stateRef.current = { ...after, animation: updated }
          void refreshThumbnails(displayBase, frames).then((nextFrames) => setAnimation((current) => current?.slot === updated.slot ? { ...current, frames: nextFrames, thumbnailDataUrl: nextFrames[0]?.thumbnailDataUrl ?? current.thumbnailDataUrl } : current))
        }
      }
    }
  }

  const beginPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.target instanceof Element && event.target.closest('.animator-part,.animator-stage-tools')) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    panGestureRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, originX: pan.x, originY: pan.y }
  }

  const seek = (time: number) => { const value = Math.max(0, Math.min(totalDuration, time)); playheadRef.current = value; setPlayhead(value); setPlaying(false) }
  const play = () => {
    if (!animation || !animation.frames.length) return
    if (playheadRef.current >= totalDuration) {
      const firstFrame = animation.frames[0]
      playheadRef.current = 0; setPlayhead(0)
      setEditorState({ animation, transforms: structuredClone(firstFrame.transforms), joints: structuredClone(firstFrame.joints), frameId: firstFrame.id })
    }
    directionRef.current = 1; setPlayDirection(1); setPlaying(true)
  }

  useEffect(() => {
    if (!playing || !animation) return
    let raf = 0, previous = performance.now()
    const tick = (now: number) => {
      const delta = Math.min(80, now - previous) * animation.speed; previous = now
      let time = playheadRef.current + delta * directionRef.current
      if (animation.loopMode === 'loop') time = time >= totalDuration ? time % totalDuration : time
      else if (animation.loopMode === 'pingpong') {
        if (time >= totalDuration) { directionRef.current = -1; setPlayDirection(-1); time = Math.max(0, totalDuration - (time - totalDuration)) }
        else if (time <= 0 && directionRef.current < 0) { directionRef.current = 1; setPlayDirection(1); time = Math.min(totalDuration, -time) }
      } else if (time >= totalDuration) {
        time = totalDuration
        const lastFrame = animation.frames.at(-1)
        if (lastFrame) setEditorState({ animation, transforms: structuredClone(lastFrame.transforms), joints: structuredClone(lastFrame.joints), frameId: lastFrame.id })
        setPlaying(false)
      }
      playheadRef.current = time; setPlayhead(time); raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf)
  }, [playing, animation, totalDuration, setEditorState])

  useEffect(() => {
    if (!animation || modelSlot === null || saving) return
    if (draftTimer.current !== null) clearTimeout(draftTimer.current)
    draftTimer.current = null
    const snapshot = animation
    const editorState = stateRef.current ?? { animation, transforms: currentTransforms, joints: currentJoints, frameId: selectedFrameId }
    const frame = snapshot.frames.find((item) => item.id === editorState.frameId)
    const frameIsDirty = Boolean(frame && (JSON.stringify(frame.transforms) !== JSON.stringify(editorState.transforms) || JSON.stringify(frame.joints) !== JSON.stringify(editorState.joints)))
    const documentIsDirty = savedAnimationRef.current === null || JSON.stringify(serializeAnimation(snapshot)) !== savedAnimationRef.current || frameIsDirty
    if (!documentIsDirty) { setSaveMessage('Animação salva'); return }
    const serialized = serializeDraft(snapshot, activeSlot, editorState, dirtyFrame)
    const assets: AnimatorAnimationAsset[] = draftAssetsPersisted.current ? [] : snapshot.parts.flatMap((part) => pendingAssets.current.has(part.id) ? [{ id: part.id, dataUrl: pendingAssets.current.get(part.id)! }] : [])
    setSaveMessage(dirtyFrame ? 'Frame alterado · rascunho automático' : 'Rascunho automático')
    draftTimer.current = setTimeout(() => {
      draftTimer.current = null
      const next = writeQueue.current.catch(() => undefined).then(() => window.desktop.fabricator.saveAnimatorDraft(snapshot.sourceModelSlot, serialized, assets))
      writeQueue.current = next
      void next.then(() => { draftAssetsPersisted.current = true; if (mountedRef.current) setDraft(serialized) }).catch((reason: unknown) => {
        if (mountedRef.current) setError(reason instanceof Error ? `Não foi possível salvar o rascunho: ${reason.message}` : 'Não foi possível salvar o rascunho.')
      })
    }, 350)
    return () => { if (draftTimer.current !== null) clearTimeout(draftTimer.current); draftTimer.current = null }
  }, [animation, activeSlot, currentTransforms, currentJoints, selectedFrameId, dirtyFrame, modelSlot, saving])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (saving || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) return
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? redo() : undo() }
      else if (event.code === 'Space' && animation) { event.preventDefault(); setPlaying((value) => !value) }
      else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); if (dirtyFrame) void saveFrame(); else void saveAnimation() }
    }
    window.addEventListener('keydown', onKeyDown); return () => window.removeEventListener('keydown', onKeyDown)
  }, [animation, dirtyFrame, undoStack, redoStack, currentTransforms, currentJoints, saving])

  const stageScale = scale
  const frameSeconds = (milliseconds: number) => `${(milliseconds / 1000).toFixed(2)}s`
  const modelOptions = [
    ...models.filter((model): model is NonNullable<FabricatorSlotSummary> => Boolean(model)).map((model) => ({ slot: model.slot, label: `Modelo ${String(model.slot).padStart(2, '0')} · ${model.name}` })),
    ...animationSourceSlots.filter((slot) => !models.some((model) => model?.slot === slot)).map((slot) => ({ slot, label: `Origem indisponível · Modelo ${String(slot).padStart(2, '0')}` }))
  ]
  const changeModel = async (nextSlot: number) => {
    if (saving) return
    if (nextSlot === modelSlot) { setCharacterId(''); return }
    if (animation) await persistDraftNow()
    animationLoadId.current++
    setCharacterId(''); setModelSlot(nextSlot); setAnimation(null); setCurrentTransforms({}); setCurrentJoints([]); setSummaries([]); setDraft(null); setActiveSlot(1); setAllowCorePartId(''); savedAnimationRef.current = null
  }
  const changeCharacter = async (id: string) => {
    if (saving) return
    if (animation) await persistDraftNow()
    const character = characters.find((item) => item.id === id)
    setCharacterId(id)
    if (character?.customization.modelSlot) {
      const modelChanged = character.customization.modelSlot !== modelSlot
      animationLoadId.current++
      setModelSlot(character.customization.modelSlot); setAnimation(null); setCurrentTransforms({}); setCurrentJoints([]); if (modelChanged) { setSummaries([]); setDraft(null); savedAnimationRef.current = null }; setActiveSlot(modelChanged ? 1 : animation?.slot ?? draft?.editingSlot ?? activeSlot); setAllowCorePartId('')
    }
  }

  return <section className={`fabricator-workspace animator-workspace${largePreview ? ' animator-large-preview' : ''}${saving ? ' animator-saving' : ''}`} aria-label="Animador Dev">
    <header className="animator-toolbar">
      <span className="animator-title"><Icon name="sparkles" /><span><strong>Animador Dev</strong><small>Editor manual por frames</small></span></span>
      <label className="animator-character">Personagem<select value={characterId} onChange={(event) => { void changeCharacter(event.target.value) }}><option value="">Sem personagem</option>{characters.filter((character) => character.customization.modelSlot !== null).map((character) => <option key={character.id} value={character.id}>{character.name}</option>)}</select></label>
      <label className="animator-model">Modelo<select value={modelSlot ?? ''} onChange={(event) => { void changeModel(Number(event.target.value)) }}><option value="" disabled>Escolher modelo</option>{modelOptions.map((model) => <option key={model.slot} value={model.slot}>{model.label}</option>)}</select></label>
      <span className="animator-toolbar-spacer" />
      <button className="pose-button secondary animator-breathing-button" onClick={() => setBreathingDialog(true)} disabled={!source || loading || saving || breathingSaving} type="button"><Icon name="sparkles" /> Respiração</button>
      <button className="pose-button secondary" onClick={() => void createAnimation()} disabled={!baseProject || loading || saving} type="button"><Icon name="plus" /> Nova animação</button>
      <button className="pose-icon-button" title="Desfazer (Ctrl+Z)" disabled={!undoStack.length} onClick={undo} type="button"><Icon name="undo" /></button>
      <button className="pose-icon-button" title="Refazer (Ctrl+Shift+Z)" disabled={!redoStack.length} onClick={redo} type="button"><Icon name="redo" /></button>
      {animation && <><button className="pose-button secondary" onClick={renameAnimation} disabled={saving} type="button">Renomear</button><button className="pose-button secondary" onClick={() => setNameDialog({ mode: 'duplicate', value: `${animation.name} — cópia` })} disabled={saving} type="button">Duplicar</button><button className="pose-button danger" onClick={() => void deleteAnimation()} disabled={saving} type="button"><Icon name="trash" /></button><button className="pose-button primary" onClick={() => void saveAnimation()} disabled={saving} type="button"><Icon name="check" />{saving ? 'Salvando…' : 'Salvar animação'}</button></>}
      <span className={`pose-save-state${dirtyFrame ? ' pending' : ''}`}><i />{saveMessage || (animation ? 'Animação aberta' : 'Biblioteca vazia')}</span>
    </header>
    {breathingDialog && <div className="animator-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !breathingSaving) setBreathingDialog(false) }}><section className="animator-breathing-dialog" role="dialog" aria-modal="true" aria-labelledby="animator-breathing-title"><header><span><strong id="animator-breathing-title">Animações de respiração</strong><small>Quatro estilos para cada pose. Substitui somente as respirações anteriores.</small></span><button className="pose-icon-button" onClick={() => setBreathingDialog(false)} disabled={breathingSaving} type="button" aria-label="Fechar">×</button></header><div className="animator-breathing-groups">{(['Parado', 'Sentado'] as const).map((category) => <article key={category}><strong>{category}</strong><div>{breathingVariations.map((variation, index) => <div className="animator-breathing-variation" key={variation.key}><span><b>{index + 1}</b>{variation.name}</span><small>{(variation.cycleMs / 1000).toFixed(1)} s · loop suave</small></div>)}</div></article>)}</div><p>O movimento anima o tronco, os braços e um leve balanço da cabeça. Quadris e pernas ficam ancorados; sua animação manual e outros slots são preservados.</p><footer><button className="pose-button secondary" onClick={() => setBreathingDialog(false)} disabled={breathingSaving} type="button">Cancelar</button><button className="pose-button primary" onClick={() => void createBreathingSet()} disabled={breathingSaving || loading || !source} type="button"><Icon name={breathingSaving ? 'sparkles' : 'check'} />{breathingSaving ? 'Atualizando…' : 'Substituir respirações'}</button></footer></section></div>}
    {nameDialog && <div className="animator-dialog-backdrop"><form className="animator-name-dialog" onSubmit={submitNameDialog} role="dialog" aria-modal="true" aria-labelledby="animator-name-title"><strong id="animator-name-title">{nameDialog.mode === 'rename' ? 'Renomear animação' : 'Duplicar animação'}</strong><input autoFocus maxLength={80} value={nameDialog.value} onChange={(event) => setNameDialog((current) => current ? { ...current, value: event.target.value } : current)} aria-label="Nome da animação" /><div><button className="pose-button secondary" onClick={() => setNameDialog(null)} type="button">Cancelar</button><button className="pose-button primary" disabled={!nameDialog.value.trim() || saving} type="submit">{nameDialog.mode === 'rename' ? 'Renomear' : 'Duplicar'}</button></div></form></div>}
    {error && <div className="animator-error" role="alert"><span>{error}</span><button onClick={() => setError('')} type="button">Fechar</button></div>}
    {draft && !animation && <div className="pose-recovery"><span><strong>Rascunho de animação recuperável</strong><small>{draft.animation.name} · {draft.animation.frames.length} frames</small></span><div><button onClick={() => { void window.desktop.fabricator.deleteAnimatorDraft(modelSlot!).then(() => setDraft(null)) }} type="button">Descartar</button><button className="pose-recover-button" onClick={() => {
      const restoredParts = draft.animation.parts as unknown as PosePart[]
      const restored = { ...draft.animation, slot: draft.editingSlot ?? (slots.findIndex((item) => !item) + 1 || 1), parts: restoredParts } as AnimatorAnimation
      pendingAssets.current = new Map(restoredParts.map((part) => [part.id, part.dataUrl])); draftAssetsPersisted.current = true
      setAnimation(restored); setActiveSlot(restored.slot); setCurrentTransforms(draft.currentTransforms); setCurrentJoints(draft.currentJoints); setSelectedFrameId(draft.selectedFrameId); setSelectedPartId(restored.parts[0]?.id ?? ''); stateRef.current = { animation: restored, transforms: draft.currentTransforms, joints: draft.currentJoints, frameId: draft.selectedFrameId }; setDraft(null)
    }} type="button">Retomar rascunho</button></div></div>}
    <div className="animator-editor-body">
      <section className="animator-preview-column" aria-label="Prévia do personagem">
        <div className="animator-preview-heading"><span><i />{animation ? `PRÉVIA · ${animation.name}` : 'PRÉVIA DO MODELO'}</span><span>{displayProject ? `${displayProject.width} × ${displayProject.height}` : 'Escolha um modelo salvo'}</span><button onClick={() => setLargePreview((value) => !value)} title={largePreview ? 'Voltar ao editor' : 'Ampliar prévia'} type="button"><Icon name="frame" /></button></div>
        <div ref={stageRef} className={`animator-stage${dragMode === 'move' ? ' move-tool-active' : ''}`} style={{ '--preview-background': background } as CSSProperties} onPointerDown={beginPan} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}>
          {displayProject && <div className="animator-artboard" style={{ width: displayProject.width * stageScale, height: displayProject.height * stageScale, left: `calc(50% + ${pan.x}px)`, top: `calc(50% + ${pan.y}px)` }}>
            {parts.map((part, index) => <img key={part.id} className={`animator-part${selectedPartId === part.id ? ' selected' : ''}${selectedCanTransform && selectedPartId === part.id ? ' can-transform' : ''}`} src={tintedParts[part.id] ?? appearancePreviewForPart(part)} alt={part.name} draggable={false} onClick={(event) => { event.stopPropagation(); setSelectedPartId(part.id) }} onPointerDown={(event) => beginDrag(event, part)} style={{ left: part.x * scale, top: part.y * scale, width: part.width * scale, height: part.height * scale, zIndex: (layerIndex.get(part.id) ?? index) * layerStride + 2, transform: `rotate(${part.rotation}deg)` }} />)}
            {garmentLayers.map((garment) => <div key={garment.key} className="animator-garment-root" style={{ left: garment.centerX * scale, top: garment.centerY * scale, zIndex: garment.zIndex, opacity: garment.opacity, transform: `translate(${garment.groupX * scale}px, ${garment.groupY * scale}px) rotate(${garment.groupRotation}deg) scale(${garment.groupScaleX}, ${garment.groupScaleY})` }}><div className="animator-garment-bone" style={{ left: (garment.originX - garment.centerX) * scale, top: (garment.originY - garment.centerY) * scale, transform: garment.matrix }}><img className="animator-garment-image" src={garment.dataUrl} alt="Roupa do personagem" draggable={false} style={{ left: garment.localLeft * scale, top: garment.localTop * scale, width: garment.width * scale, height: garment.height * scale, transform: `rotate(${garment.rotation}deg)` }} /></div></div>)}
            {headOverlays.map((overlay) => <img key={overlay.key} className="animator-accessory" src={overlay.dataUrl} alt="" draggable={false} style={{ left: overlay.x * scale, top: overlay.y * scale, width: overlay.width * scale, height: overlay.height * scale, zIndex: overlay.zIndex, transform: `translate(-50%, -50%) rotate(${overlay.rotation}deg) scaleX(${overlay.flipX ? -1 : 1})` }} />)}
          </div>}
          {!displayProject && <div className="animator-empty"><Icon name="body" /><strong>{loading ? 'Carregando modelo…' : 'Escolha um modelo salvo'}</strong><small>O Animador Dev cria uma cópia independente do modelo e das juntas do Fabricador.</small></div>}
          <div className="animator-stage-tools"><span>{Math.round(zoom * 100)}%</span><button onClick={() => setZoom((value) => Math.min(2.5, value + .15))} title="Aproximar" type="button">+</button><button onClick={() => setZoom((value) => Math.max(.45, value - .15))} title="Afastar" type="button">−</button><button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }) }} title="Centralizar" type="button"><Icon name="frame" /></button></div>
        </div>
        <footer className="animator-preview-footer"><span>{animation ? `${animation.parts.length} peças · ${animation.joints.length} juntas · ${animation.frames.length} frames` : 'O modelo e as poses salvos ficam protegidos'}</span><span>{animation && dirtyFrame ? 'Frame com alterações não gravadas' : animation ? 'Arraste uma peça para ajustar' : 'Crie uma animação para começar'}</span></footer>
      </section>
      <aside className="animator-side-panel">
        <section className="animator-library-panel"><header><span><strong>Slots de animações</strong><small>12 espaços · separados por modelo</small></span><span>{summaries.length}/12</span></header><div className="animator-slot-grid">{slots.map((summary, index) => <button key={index} className={`animator-slot${activeSlot === index + 1 ? ' active' : ''}${summary ? ' filled' : ''}`} onClick={() => void selectAnimationSlot(index + 1)} type="button" title={summary?.name ?? `Slot ${index + 1} vazio`}><span>{summary?.thumbnailDataUrl ? <img src={summary.thumbnailDataUrl} alt="" /> : <b>{String(index + 1).padStart(2, '0')}</b>}</span><small>{summary?.name ?? 'Vazio'}</small></button>)}</div></section>
        <section className="animator-edit-panel"><header><span><small>EDIÇÃO</small><strong>{animation ? selectedPart?.name ?? 'Selecione uma peça' : 'Controles'}</strong></span>{animation && <div className="pose-heading-actions"><button className={`pose-move-tool${dragMode === 'move' ? ' active' : ''}`} aria-pressed={dragMode === 'move'} disabled={playing || saving} title={dragMode === 'move' ? 'Desativar modo mover peça' : 'Ativar modo mover peça'} onClick={() => setDragMode((mode) => mode === 'move' ? 'rotate' : 'move')} type="button"><Icon name="move" /><span>{dragMode === 'move' ? 'Mover ligado' : 'Mover peça'}</span></button></div>}</header><nav>{([['parts', 'Peças'], ['layers', 'Camadas'], ['rig', 'Rig'], ['settings', 'Animação']] as const).map(([tab, label]) => <button key={tab} className={panelTab === tab ? 'active' : ''} onClick={() => setPanelTab(tab)} type="button">{label}</button>)}</nav>
          {animation && panelTab === 'parts' && <div className="animator-panel-content"><div className="animator-piece-list">{orderedParts(animation.parts, animation.layerOrder).map((part) => <button key={part.id} className={`animator-piece-row${part.id === selectedPartId ? ' selected' : ''}`} onClick={() => setSelectedPartId(part.id)} type="button"><span>{part.name}</span><small>{Math.round(displayProject?.parts.find((item) => item.id === part.id)?.rotation ?? 0)}°</small></button>)}</div>
          {selectedPart && <div className="animator-transform-card"><strong>Transformação do frame atual</strong>{isCorePart(selectedPart) && <label className="animator-check"><input type="checkbox" checked={allowCorePartId === selectedPart.id} onChange={(event) => setAllowCorePartId(event.target.checked ? selectedPart.id : '')} /> Permitir manipular esta peça central</label>}<div className="animator-number-row"><label>X<input type="number" disabled={!selectedCanTransform} value={Number(selectedPart.x.toFixed(1))} onChange={(event) => transformSelected('x', Number(event.target.value))} /></label><label>Y<input type="number" disabled={!selectedCanTransform} value={Number(selectedPart.y.toFixed(1))} onChange={(event) => transformSelected('y', Number(event.target.value))} /></label></div><label className="animator-angle">Rotação <output>{selectedPart.rotation.toFixed(1)}°</output><input type="range" min={selectedPart.rotation - 180} max={selectedPart.rotation + 180} step="1" disabled={!selectedCanTransform} value={selectedPart.rotation} onChange={(event) => transformSelected('rotation', Number(event.target.value))} /></label><div className="animator-number-row"><label>Graus<input type="number" disabled={!selectedCanTransform} value={Number(selectedPart.rotation.toFixed(1))} onChange={(event) => transformSelected('rotation', Number(event.target.value))} /></label><button onClick={() => transformSelected('rotation', 0)} disabled={!selectedCanTransform} type="button">Zerar</button></div><div className="animator-mode-toggle"><button className={dragMode === 'rotate' ? 'active' : ''} onClick={() => setDragMode('rotate')} type="button">Arrastar para girar</button><button className={dragMode === 'move' ? 'active' : ''} onClick={() => setDragMode('move')} type="button">Arrastar para mover</button></div><label className="animator-check"><input type="checkbox" checked={includeChildren} onChange={(event) => setIncludeChildren(event.target.checked)} /> Aplicar às descendentes conectadas</label><label className="animator-check"><input type="checkbox" checked={applyToAllFrames} onChange={(event) => setApplyToAllFrames(event.target.checked)} /> Aplicar a todos os frames</label><small>{selectedCanTransform ? 'A bolinha de junta define o pivô da rotação.' : 'Cabeça e tronco ficam bloqueados por segurança.'}</small></div>}
          </div>}
          {animation && panelTab === 'layers' && <div className="animator-panel-content animator-layer-editor"><p>Ordem exclusiva deste slot. O topo da lista fica à frente na prévia.</p><div className="animator-layer-list">{orderedParts(animation.parts, animation.layerOrder).reverse().map((part, index, frontToBack) => <article className={`animator-layer-row${part.id === selectedPartId ? ' selected' : ''}`} key={part.id}><button className="animator-layer-select" onClick={() => setSelectedPartId(part.id)} type="button"><span>{part.name}</span><small>{index === 0 ? 'Frente' : index === frontToBack.length - 1 ? 'Fundo' : `Camada ${frontToBack.length - index}`}</small></button><div><button disabled={saving || playing || index === 0} onClick={() => moveAnimationLayer(part.id, -1)} title="Trazer para frente" type="button" aria-label={`Trazer ${part.name} para frente`}>↑</button><button disabled={saving || playing || index === frontToBack.length - 1} onClick={() => moveAnimationLayer(part.id, 1)} title="Enviar para trás" type="button" aria-label={`Enviar ${part.name} para trás`}>↓</button></div></article>)}</div><small className="animator-layer-note">Salvar a animação grava esta ordem somente no slot atual. O modelo original e os demais slots permanecem intactos.</small></div>}
          {animation && panelTab === 'rig' && <div className="animator-panel-content animator-rig-list">{diagnostics.map((joint) => <article key={joint.id}><strong>{joint.parent} → {joint.child}</strong><small>{joint.exists ? joint.fixed ? 'Conectada · acompanha quando o ramo está ativo' : 'Conexão solta' : 'Peça ausente na cópia'}</small></article>)}{!diagnostics.length && <p>Este modelo não possui juntas. Configure o rig em Modelos Dev para animar os membros conectados.</p>}</div>}
          {animation && panelTab === 'settings' && <div className="animator-panel-content animator-settings"><label>Interpolação<select value={animation.interpolation} onChange={(event) => updatePlaybackSettings({ interpolation: event.target.value as AnimatorAnimation['interpolation'] })}><option value="smooth">Suave · menor caminho angular</option><option value="stepped">Quadro a quadro</option></select></label><label>Repetição<select value={animation.loopMode} onChange={(event) => updatePlaybackSettings({ loopMode: event.target.value as AnimatorAnimation['loopMode'] })}><option value="loop">Loop contínuo</option><option value="once">Uma vez</option><option value="pingpong">Ida e volta</option></select></label><label>Velocidade <output>{animation.speed.toFixed(2)}×</output><input type="range" min="0.25" max="2.5" step="0.05" value={animation.speed} onChange={(event) => updatePlaybackSettings({ speed: Number(event.target.value) })} /></label><label>Duração do frame <output>{frameSeconds(selectedFrame?.durationMs ?? 250)}</output><input type="range" min="80" max="1600" step="20" value={selectedFrame?.durationMs ?? 250} onChange={(event) => changeFrameDuration(Number(event.target.value))} /></label><small>A duração é individual por frame. A animação usa uma cópia independente da origem.</small></div>}
          {!animation && <div className="animator-panel-empty"><Icon name="sparkles" /><strong>Prévia do modelo selecionado</strong><small>Crie uma animação para editar peças e registrar frames.</small></div>}
        </section>
      </aside>
    </div>
    <section className="animator-timeline-panel" aria-label="Sequência de frames"><header><span><strong>Frames</strong><small>{animation ? `${animation.frames.length} frames · ${frameSeconds(totalDuration)} total` : 'Crie uma animação para gravar estados'}</small></span><div className="animator-player-actions"><button disabled={!animation} onClick={() => seek(0)} type="button" title="Voltar ao início">⏮</button><button className="animator-play" disabled={!animation} onClick={() => playing ? setPlaying(false) : play()} type="button">{playing ? '❚❚ Pausar' : '▶ Reproduzir'}</button><label className="animator-loop-toggle"><input type="checkbox" checked={animation?.loopMode === 'loop'} disabled={!animation} onChange={(event) => updatePlaybackSettings({ loopMode: event.target.checked ? 'loop' : 'once' })} /><span>Loop</span></label><button disabled={!animation || selectedFrameIndex >= (animation?.frames.length ?? 0) - 1} onClick={() => { if (animation && animation.frames[selectedFrameIndex + 1]) selectFrame(animation.frames[selectedFrameIndex + 1]) }} type="button" title="Próximo frame">⏭</button><span>{frameSeconds(playhead)} / {frameSeconds(totalDuration)}</span></div></header>
      {animation && <><input className="animator-scrubber" type="range" min="0" max={Math.max(1, totalDuration)} step="1" value={Math.min(playhead, totalDuration)} onChange={(event) => seek(Number(event.target.value))} aria-label="Posição na sequência"/><div className="animator-frame-strip">{animation.frames.map((frame, index) => <button key={frame.id} className={`animator-frame-card${frame.id === selectedFrameId ? ' active' : ''}${frame.id === selectedFrameId && dirtyFrame ? ' dirty' : ''}`} onClick={() => selectFrame(frame)} type="button"><span className="animator-frame-thumb">{frame.thumbnailDataUrl && <img src={frame.thumbnailDataUrl} alt="" />}</span><b>{String(index + 1).padStart(2, '0')}</b><small>{frameSeconds(frame.durationMs)}</small></button>)}</div><div className="animator-frame-actions"><button className="pose-button primary" disabled={!dirtyFrame || playing} onClick={() => void saveFrame()} type="button"><Icon name="check" /> Salvar frame</button><button className="pose-button secondary" disabled={!selectedFrame || playing} onClick={duplicateFrame} type="button">Duplicar</button><button className="pose-button secondary" disabled={!selectedFrame || playing} onClick={() => setCopiedTransforms({ transforms: structuredClone(currentTransforms), joints: structuredClone(currentJoints) })} type="button">Copiar transforms</button><button className="pose-button secondary" disabled={!copiedTransforms || playing} onClick={() => { if (!copiedTransforms) return; pushHistory(); setCurrentTransforms(structuredClone(copiedTransforms.transforms)); setCurrentJoints(structuredClone(copiedTransforms.joints)) }} type="button">Colar transforms</button><button className="pose-icon-button" disabled={selectedFrameIndex <= 0 || playing} onClick={() => reorderFrame(-1)} title="Mover frame para trás" type="button">←</button><button className="pose-icon-button" disabled={!animation || selectedFrameIndex >= animation.frames.length - 1 || playing} onClick={() => reorderFrame(1)} title="Mover frame para frente" type="button">→</button><button className="pose-button danger" disabled={!selectedFrame || animation.frames.length <= 1 || playing} onClick={deleteFrame} type="button"><Icon name="trash" /> Excluir frame</button></div></>}
    </section>
  </section>
}

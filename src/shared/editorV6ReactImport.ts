/** Portable AI react format. This is intentionally NOT the persisted EditorV6Document. */
import { z } from 'zod'
import type { CustomizerCharacter } from './customizer'
import type { EditorV6MediaAsset } from './editorV6'
import type { VideoLibraryItem } from './mediaLibrary'
import type { BaseVideoDetails } from './baseVideos'
import { EDITOR_V6_TIMELINE_FPS, secondsToFrame } from './editorV6Timing.ts'
import { EDITOR_V6_VIDEO_LOADING_FRAMES, editorV6VideoPresentationImportSchema } from './editorV6VideoPresentation.ts'
import { editorV6IntroDurationFrames, editorV6ReactIntroSchema, type EditorV6IntroClip } from './editorV6Intro.ts'
import { editorV6PoseCategoryKey } from './editorV6PoseCategories.ts'

export { secondsToFrame } from './editorV6Timing.ts'

export const EDITOR_V6_REACT_IMPORT_FORMAT = 'NYMI_EDITOR_V6_REACT_V1'
export const EDITOR_V6_REACT_CHARACTER_SCALE = 121
const MIN_RECOMMENDED_BEAT_GAP_FRAMES = 8
const seconds = z.number().finite().min(0).max(33_333)
const characterRef = z.string().trim().min(1).max(120)
const emotion = z.string().trim().min(1).max(120)
const gaze = z.enum(['left', 'right'])
const pose = z.number().int().min(1).max(999)
const poseCategory = z.string().trim().min(1).max(32)
const placement = z.object({
  x: z.number().finite().min(-100).max(100),
  y: z.number().finite().min(-100).max(100),
  scale: z.number().finite().min(10).max(300).optional(),
  flipX: z.boolean().optional()
})
export const editorV6ReactImportSchema = z.object({
  format: z.literal(EDITOR_V6_REACT_IMPORT_FORMAT),
  title: z.string().trim().min(1).max(100),
  seed: z.number().int().min(0).max(2147483647).default(1),
  backgroundColor: z.string().regex(/^#[\da-f]{6}$/i).default('#d7b5cd'),
  backgroundLibraryId: z.string().uuid().optional(),
  intro: editorV6ReactIntroSchema.optional(),
  autoPoseEverySeconds: z.number().int().min(0).max(3600).default(15),
  autoListenerGaze: z.boolean().default(true),
  cast: z.array(placement.extend({
    character: characterRef,
    poseSlot: pose.nullable().optional(),
    poseCategory: poseCategory.optional(),
    expression: emotion.optional(),
    gaze: gaze.optional()
  })).min(1).max(24),
  videos: z.array(z.object({
    videoId: z.string().uuid().optional(),
    videoName: z.string().trim().min(1).max(255).optional(),
    videoNumber: z.number().int().min(1).max(500).optional(),
    startSeconds: seconds,
    durationSeconds: z.number().finite().gt(0).max(33_333).optional(),
    presentation: editorV6VideoPresentationImportSchema.optional(),
    layout: z.object({
      x: z.number().finite().min(-200).max(200),
      y: z.number().finite().min(-200).max(200),
      width: z.number().finite().min(1).max(200),
      height: z.number().finite().min(1).max(200),
      rotation: z.number().finite().min(-180).max(180).default(0)
    }).optional()
  }).refine((item)=>[item.videoId,item.videoName,item.videoNumber].filter((value)=>value!==undefined).length===1,'Informe exatamente um identificador de vídeo: videoId, videoName ou videoNumber.')).max(500),
  lines: z.array(z.object({
    character: characterRef,
    kind: z.enum(['speech', 'thought']),
    text: z.string().min(1).max(10000),
    englishText: z.string().max(10000).optional(),
    startSeconds: seconds,
    durationSeconds: z.number().finite().gt(0).max(120),
    x: z.number().finite().min(-200).max(200).optional(),
    y: z.number().finite().min(-200).max(200).optional(),
    width: z.number().finite().min(1).max(200).optional(),
    height: z.number().finite().min(1).max(200).optional()
  })).max(10000),
  beats: z.array(z.object({
    character: characterRef,
    startSeconds: seconds,
    poseSlot: pose.nullable().optional(),
    poseCategory: poseCategory.optional(),
    expression: emotion.optional(),
    gaze: gaze.optional()
  })).max(10000).default([]),
  durationSeconds: seconds.optional()
}).strict()

export type EditorV6ReactImport = z.infer<typeof editorV6ReactImportSchema>
export type EditorV6ReactImportSource = z.input<typeof editorV6ReactImportSchema>
export type ReactImportCast = EditorV6ReactImport['cast'][number] & { characterId: string; name: string; modelSlot: number }
export type ReactImportLine = EditorV6ReactImport['lines'][number] & { characterId: string; startFrame: number; durationFrames: number }
export type ReactImportBeat = { characterId: string; startFrame: number; poseSlot?: number | null; expression?: string; gaze?: 'left' | 'right' }
type FrameRange = { startFrame: number; durationFrames: number }
export type ReactImportIntroPart = FrameRange & (
  Extract<EditorV6IntroClip, { kind: 'black' }> |
  (Omit<Extract<EditorV6IntroClip, { kind: 'character' }>, 'assetId' | 'poseCategory' | 'poseSlot'> & { poseSlot: number | null; gaze: 'left' | 'right' })
)
export type EditorV6ReactImportPlan = {
  title: string; seed: number; backgroundColor: string; durationFrames: number
  contentStartFrame: number
  intro: ReactImportIntroPart[]
  cast: ReactImportCast[]
  videos: Array<Pick<EditorV6ReactImport['videos'][number], 'layout' | 'presentation'> & { video: EditorV6MediaAsset; startFrame: number; durationFrames: number }>
  lines: ReactImportLine[]
  beats: ReactImportBeat[]
  warnings: string[]
}
export type ReactImportSources = {
  characters: readonly CustomizerCharacter[]
  posesByCharacter: ReadonlyMap<string, readonly number[]>
  poseCategoriesByCharacter?: ReadonlyMap<string, ReadonlyMap<number, string>>
  selectedPosesByCharacter?: ReadonlyMap<string, readonly number[]>
  presetsByModel: ReadonlyMap<number, readonly { id: string; name: string }[]>
  media: readonly EditorV6MediaAsset[]
}

function createCharacterLookup(characters: readonly CustomizerCharacter[]) {
  const byId = new Map(characters.map((item) => [item.id, item]))
  const byName = new Map<string, CustomizerCharacter[]>()
  for (const character of characters) {
    const key = canonical(character.name)
    byName.set(key, [...(byName.get(key) ?? []), character])
  }
  const resolveCharacter = (value: string): CustomizerCharacter => {
    const direct = byId.get(value)
    if (direct) return direct
    const matches = byName.get(canonical(value)) ?? []
    if (matches.length !== 1) throw new Error(matches.length
      ? 'Nome de personagem ambíguo: ' + value
      : 'Personagem não encontrado no Customizador: ' + value)
    return matches[0]
  }
  return { byId, resolveCharacter }
}

function resolveImportExpression(actor: ReactImportCast, name: string, available: Pick<ReactImportSources, 'presetsByModel'>): string {
  const presets = available.presetsByModel.get(actor.modelSlot) ?? []
  const found = presets.find((item) => item.id === name)
    ?? presets.find((item) => canonical(item.name) === canonical(name))
  if (!found) throw new Error('Expressão não encontrada para ' + actor.name + ': ' + name)
  return found.id
}

function getImportPoseCategoryOptions(actor: ReactImportCast, category: string,
  available: Pick<ReactImportSources, 'posesByCharacter' | 'selectedPosesByCharacter' | 'poseCategoriesByCharacter'>): number[] {
  const availableSlots = available.posesByCharacter.get(actor.characterId) ?? []
  const selected = available.selectedPosesByCharacter?.get(actor.characterId) ?? availableSlots
  const categories = available.poseCategoriesByCharacter?.get(actor.characterId)
  const matches = [...new Set(selected)].filter((slot) => availableSlots.includes(slot) && categories?.has(slot)
    && categoryKey(categories.get(slot)!) === categoryKey(category)).sort((a,b) => a-b)
  if (!matches.length) throw new Error(`Nenhuma pose selecionada da categoria “${category}” para ${actor.name}.`)
  return matches
}

/** Validate route semantics before media probing; media-dependent timing is checked by the final plan. */
export function preflightEditorV6ReactImport(source: EditorV6ReactImport, available: Omit<ReactImportSources, 'media'>): void {
  const { byId, resolveCharacter } = createCharacterLookup(available.characters)
  const tvX = source.videos[0]?.layout?.x ?? 0
  const cast: ReactImportCast[] = source.cast.map((item) => {
    const character = resolveCharacter(item.character)
    return { ...item, scale: EDITOR_V6_REACT_CHARACTER_SCALE, flipX: item.flipX ?? item.x > tvX,
      characterId: character.id, name: character.name, modelSlot: character.customization.modelSlot ?? 1 }
  })
  if (new Set(cast.map((actor) => actor.characterId)).size !== cast.length) throw new Error('O elenco contém um personagem repetido.')
  const castById = new Map(cast.map((actor) => [actor.characterId, actor]))
  const resolveCast = (name: string): ReactImportCast => {
    const character = resolveCharacter(name)
    const actor = castById.get(character.id)
    if (!actor) throw new Error('Personagem usado fora do elenco: ' + name)
    return actor
  }
  const hasCategory = new Set<string>()
  const hasSlot = new Set<string>()
  for (const actor of cast) {
    if (actor.poseCategory !== undefined && actor.poseSlot !== undefined)
      throw new Error(`Informe categoria ou slot de pose para ${actor.name}, não ambos.`)
    const slots = available.posesByCharacter.get(actor.characterId) ?? []
    if (typeof actor.poseSlot === 'number' && !slots.includes(actor.poseSlot))
      throw new Error('Pose ' + actor.poseSlot + ' não encontrada para ' + actor.name)
    if (actor.poseCategory !== undefined) { getImportPoseCategoryOptions(actor, actor.poseCategory, available); hasCategory.add(actor.characterId) }
    if (actor.poseSlot !== undefined) hasSlot.add(actor.characterId)
    if (actor.expression && !byId.get(actor.characterId)?.customization.faceAppearance)
      throw new Error(actor.name + ' não possui aparência facial para usar a expressão especificada.')
    if (actor.expression) resolveImportExpression(actor, actor.expression, available)
  }

  for (const line of source.lines) {
    resolveCast(line.character)
    const startFrame = secondsToFrame(line.startSeconds)
    const durationFrames = Math.max(1, secondsToFrame(line.durationSeconds))
    if (startFrame + durationFrames > 1_000_000) throw new Error('Uma fala ultrapassa o limite do Editor V6.')
  }

  type BeatValue = { field: string; value: string | number | null; index: number }
  type BeatAtFrame = { actor: ReactImportCast; frame: number; sequence: number; pose?: BeatValue; expression?: BeatValue; gaze?: BeatValue }
  const beatsAtFrame = new Map<string, BeatAtFrame>()
  for (const [index, beat] of source.beats.entries()) {
    const actor = resolveCast(beat.character)
    if (beat.expression && !byId.get(actor.characterId)?.customization.faceAppearance)
      throw new Error(actor.name + ' não possui rosto configurado para a expressão especificada.')
    if (beat.poseCategory !== undefined && beat.poseSlot !== undefined)
      throw new Error(`beats[${index}] informa poseCategory e poseSlot ao mesmo tempo para ${actor.name}; use somente um dos campos.`)
    if (beat.poseSlot !== undefined && beat.poseSlot !== null
      && !(available.posesByCharacter.get(actor.characterId) ?? []).includes(beat.poseSlot))
      throw new Error(`Pose ${beat.poseSlot} não encontrada para ${actor.name} em beats[${index}].poseSlot.`)
    if (beat.poseCategory !== undefined) { getImportPoseCategoryOptions(actor, beat.poseCategory, available); hasCategory.add(actor.characterId) }
    if (beat.poseSlot !== undefined) hasSlot.add(actor.characterId)
    const expression = beat.expression === undefined ? undefined : resolveImportExpression(actor, beat.expression, available)
    const frame = secondsToFrame(beat.startSeconds)
    const key = `${actor.characterId}:${frame}`
    const previous = beatsAtFrame.get(key) ?? { actor, frame, sequence: index }
    const merge = (attribute: string, current: BeatValue | undefined, field: string, value: string | number | null | undefined): BeatValue | undefined => {
      if (value === undefined) return current
      if (current) {
        const equal = attribute === 'pose' && typeof current.value === 'string' && typeof value === 'string'
          ? categoryKey(current.value) === categoryKey(value)
          : current.value === value
        if (!equal) throw new Error(`Conflito de ${attribute} no quadro ${frame} para ${actor.name}: beats[${current.index}].${current.field} e beats[${index}].${field}. Combine atributos diferentes no mesmo quadro e deixe apenas um valor para cada atributo.`)
        return current
      }
      return { field, value, index }
    }
    previous.pose = merge('pose', previous.pose, beat.poseCategory !== undefined ? 'poseCategory' : 'poseSlot',
      beat.poseCategory !== undefined ? beat.poseCategory : beat.poseSlot)
    previous.expression = merge('expressão', previous.expression, 'expression', expression)
    previous.gaze = merge('direção do olhar', previous.gaze, 'gaze', beat.gaze)
    beatsAtFrame.set(key, previous)
  }
  for (const actor of cast) if (hasCategory.has(actor.characterId) && hasSlot.has(actor.characterId))
    throw new Error(`Use somente categorias ou somente slots de pose para ${actor.name}.`)

  let introEnd = 0
  for (const entry of source.intro ?? []) {
    const startFrame = entry.startSeconds === undefined ? introEnd : secondsToFrame(entry.startSeconds)
    introEnd = startFrame + editorV6IntroDurationFrames(entry)
    if (entry.kind !== 'character') continue
    const actor = resolveCast(entry.character)
    for (const part of entry.parts) {
      if (part.expression && !byId.get(actor.characterId)?.customization.faceAppearance)
        throw new Error(actor.name + ' precisa de uma aparência facial para usar expressões na Intro.')
      if (part.expression) resolveImportExpression(actor, part.expression, available)
      if (part.poseCategory !== undefined) getImportPoseCategoryOptions(actor, part.poseCategory, available)
      if (typeof part.poseSlot === 'number' && !(available.posesByCharacter.get(actor.characterId) ?? []).includes(part.poseSlot))
        throw new Error('Pose ' + part.poseSlot + ' não encontrada para ' + actor.name)
    }
  }
  const hasContent = source.videos.length > 0 || source.lines.length > 0 || source.beats.length > 0 || Boolean(source.durationSeconds)
  const minimumContentEnd = !hasContent && (source.intro?.length ?? 0) > 0 ? 0 : 1
  const declaredContentEnd = source.durationSeconds === undefined ? minimumContentEnd : secondsToFrame(source.durationSeconds)
  const contentEnd = Math.max(minimumContentEnd, declaredContentEnd,
    ...source.lines.map((line) => secondsToFrame(line.startSeconds) + Math.max(1, secondsToFrame(line.durationSeconds))),
    ...source.beats.map((beat) => secondsToFrame(beat.startSeconds) + 1))
  if (introEnd + contentEnd > 1_000_000) throw new Error('Intro e conteúdo excedem 1.000.000 de quadros.')
}

export function parseEditorV6ReactImport(source: unknown): EditorV6ReactImport {
  return editorV6ReactImportSchema.parse(source)
}
/** Resolve human-friendly video numbers/names to the installed Base de Vídeos UUIDs. */
export function resolveEditorV6ReactVideos(source:EditorV6ReactImport,items:readonly VideoLibraryItem[],details:readonly BaseVideoDetails[]):EditorV6ReactImport {
  const available=items.filter((item)=>item.available)
  return {...source,videos:source.videos.map((video)=>{
    if(video.videoId){
      if(!available.some((item)=>item.id===video.videoId))throw new Error('Vídeo ausente na Base de Vídeos: '+video.videoId)
      return video
    }
    const matched=video.videoNumber!==undefined?
      available.filter((item)=>details.some((entry)=>entry.videoId===item.id&&entry.videoNumber===video.videoNumber)):
      available.filter((item)=>canonical(item.name)===canonical(video.videoName??''))
    if(matched.length!==1)throw new Error((matched.length?'Vídeo ambíguo':'Vídeo não encontrado')+': '+String(video.videoNumber??video.videoName))
    const { videoName: _name, videoNumber: _number, ...clip } = video
    return { ...clip, videoId: matched[0].id }
  })}
}

const canonical = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('pt-BR')
const categoryKey = editorV6PoseCategoryKey
const random = (seed: number) => {
  let state = seed >>> 0
  return () => { state = (Math.imul(1664525, state) + 1013904223) >>> 0; return state / 4294967296 }
}

export function planEditorV6ReactImport(
  source: EditorV6ReactImport,
  available: ReactImportSources
): EditorV6ReactImportPlan {
  const warnings: string[] = []
  const { byId, resolveCharacter } = createCharacterLookup(available.characters)
  const rng = random(source.seed)
  const tvX = source.videos[0]?.layout?.x ?? 0
  const cast: ReactImportCast[] = source.cast.map((item) => {
    const character = resolveCharacter(item.character)
    return { ...item, scale: EDITOR_V6_REACT_CHARACTER_SCALE, flipX: item.flipX ?? item.x > tvX, characterId: character.id, name: character.name, modelSlot: character.customization.modelSlot ?? 1 }
  })
  if (new Set(cast.map((item) => item.characterId)).size !== cast.length) throw new Error('O elenco contém um personagem repetido.')
  const castById = new Map(cast.map((item) => [item.characterId, item]))
  // Directions in the JSON refer to the stage; facial gaze is relative to the
  // unmirrored portrait. The normal portrait looks right before mirroring.
  const localGaze=(actor:ReactImportCast, direction:'left'|'right'):'left'|'right'=>actor.flipX ? (direction==='left'?'right':'left') : direction
  const frontGaze=(actor:ReactImportCast):'left'|'right'=>actor.gaze ? localGaze(actor,actor.gaze) : 'right'
  const resolveCast = (name: string): ReactImportCast => {
    const character = resolveCharacter(name)
    const selected = castById.get(character.id)
    if (!selected) throw new Error('Personagem usado fora do elenco: ' + name)
    return selected
  }
  for (const actor of cast) {
    const actorBeats = source.beats.filter((beat) => resolveCast(beat.character).characterId === actor.characterId)
    if ((actor.poseCategory !== undefined || actorBeats.some((beat) => beat.poseCategory !== undefined))
      && (actor.poseSlot !== undefined || actorBeats.some((beat) => beat.poseSlot !== undefined))) {
      throw new Error(`Use somente categorias ou somente slots de pose para ${actor.name}.`)
    }
    const requestedFrames = [...new Set([0, ...actorBeats.map((beat) => secondsToFrame(beat.startSeconds))])].sort((a, b) => a - b)
    for (let index = 1; index < requestedFrames.length; index++) {
      const gap = requestedFrames[index] - requestedFrames[index - 1]
      if (gap > 0 && gap < MIN_RECOMMENDED_BEAT_GAP_FRAMES) {
        warnings.push(`${actor.name}: estados separados por ${gap} quadro(s); a mudança pode ficar imperceptível e criar um bloco difícil de selecionar. Revise os beats próximos.`)
      }
    }
  }
  const resolvedExpression = (actor: ReactImportCast, name: string): string => resolveImportExpression(actor, name, available)
  const usedInitialExpressions = new Set<string>()
  const usedInitialPoses = new Set<number>()
  const selectedPose = new Map<string, number | null>()
  const selectedEmotion = new Map<string, string | undefined>()
  const categoryOptions = (actor: ReactImportCast, category: string): number[] => getImportPoseCategoryOptions(actor, category, available)
  const initial: ReactImportBeat[] = cast.map((actor) => {
    if (actor.poseCategory !== undefined && actor.poseSlot !== undefined) throw new Error(`Informe categoria ou slot de pose para ${actor.name}, não ambos.`)
    const options = actor.poseCategory ? categoryOptions(actor, actor.poseCategory) : [...new Set(available.posesByCharacter.get(actor.characterId) ?? [])].sort((a,b) => a - b)
    let poseSlot = actor.poseSlot
    if (typeof poseSlot === 'number' && !options.includes(poseSlot)) throw new Error('Pose ' + poseSlot + ' não encontrada para ' + actor.name)
    if (poseSlot === undefined && options.length) {
      const unused = options.filter((slot) => !usedInitialPoses.has(slot))
      const candidates = unused.length ? unused : options
      poseSlot = candidates[Math.floor(rng() * candidates.length)]
    }
    if (poseSlot === undefined) {
      poseSlot = null
      warnings.push(actor.name + ': sem pose salva; será usada a pose padrão do Customizador.')
    }
    if (poseSlot !== null) usedInitialPoses.add(poseSlot)
    selectedPose.set(actor.characterId, poseSlot)
    const presets = available.presetsByModel.get(actor.modelSlot) ?? []
    const sourceCharacter=byId.get(actor.characterId)!
    if(actor.expression&&!sourceCharacter.customization.faceAppearance)throw new Error(actor.name+' não possui aparência facial para usar a expressão especificada.')
    let expression = actor.expression ? resolvedExpression(actor, actor.expression) : undefined
    if (!expression && presets.length && sourceCharacter.customization.faceAppearance) {
      const unused = presets.filter((item) => !usedInitialExpressions.has(item.id))
      const pool = unused.length ? unused : presets
      expression = pool[Math.floor(rng() * pool.length)].id
    }
    if (expression) usedInitialExpressions.add(expression)
    else warnings.push(actor.name + ': sem expressão disponível; será usada a aparência facial original.')
    selectedEmotion.set(actor.characterId, expression)
    return { characterId: actor.characterId, startFrame: 0, poseSlot, ...(expression ? { expression } : {}), gaze: frontGaze(actor) }
  })
  const mediaById = new Map(available.media.map((item) => [item.libraryVideoId ?? item.id, item]))
  const videos = source.videos.map((item) => {
    if(!item.videoId)throw new Error('Resolva videoName/videoNumber para videoId antes de planejar o projeto.')
    const video = mediaById.get(item.videoId)
    if (!video || video.kind !== 'video') throw new Error('Vídeo não encontrado na Base de Vídeos: ' + item.videoId)
    const startFrame = secondsToFrame(item.startSeconds)
    if (item.presentation?.loadingGif && startFrame < EDITOR_V6_VIDEO_LOADING_FRAMES) {
      warnings.push(`${video.name}: o GIF terá menos de 3 segundos porque o vídeo começa perto do início da timeline.`)
    }
    const requested = item.durationSeconds === undefined ? video.sourceFrames : secondsToFrame(item.durationSeconds)
    const durationFrames = Math.min(video.sourceFrames, requested)
    if (startFrame + durationFrames > 1_000_000) throw new Error('Vídeo fora do limite de frames.')
    return { video, startFrame, durationFrames, ...(item.layout ? { layout: item.layout } : {}), ...(item.presentation ? { presentation: item.presentation } : {}) }
  })
  const sortedVideos = [...videos].sort((a,b) => a.startFrame - b.startFrame)
  for (let index=1;index<sortedVideos.length;index++) {
    if (sortedVideos[index].startFrame < sortedVideos[index-1].startFrame + sortedVideos[index-1].durationFrames) throw new Error('Os vídeos se sobrepõem; o V6 reproduz uma camada de vídeo por vez.')
  }
  const lines = source.lines.map((item) => {
    const actor = resolveCast(item.character)
    const startFrame = secondsToFrame(item.startSeconds)
    const durationFrames = Math.max(1, secondsToFrame(item.durationSeconds))
    if (startFrame + durationFrames > 1_000_000) throw new Error('Uma fala ultrapassa o limite do Editor V6.')
    return { ...item, characterId: actor.characterId, startFrame, durationFrames }
  })
  const minReadingSeconds=(line:ReactImportLine)=>{
    const count=Math.max(...[line.text, line.englishText ?? ''].map((text) => text.trim().split(/\s+/).filter(Boolean).length))
    const minimum=count<=3?2.6:count<=7?3.2:count<=12?3.9:count<=18?4.9:count<=25?6.2:count<=35?7.6:count<=45?9:count<=60?11:1.3+count*.24
    return Math.max(minimum,1.3+count*.24)+(line.kind === 'thought' ? 0.4 : 0)
  }
  lines.forEach((line,index)=>{
    const required=secondsToFrame(minReadingSeconds(line))
    if(line.durationFrames<required)warnings.push('Bloco '+(index+1)+': '+line.durationFrames+' frames, abaixo da leitura recomendada de '+required+' frames.')
  })
  const events: Array<ReactImportBeat & { priority: number; sequence: number }> = initial.map((item,i) => ({ ...item, priority:0,sequence:i }))
  const categoryChanges = new Map<string, Array<{ frame: number; category: string }>>()
  const latestPoseByCharacter = new Map(selectedPose)
  type ExplicitBeat = {
    actor: ReactImportCast
    frame: number
    sequence: number
    pose?: { field: 'poseSlot' | 'poseCategory'; value: number | null | string; index: number }
    expression?: { field: 'expression'; value: string; index: number }
    gaze?: { field: 'gaze'; value: 'left' | 'right'; index: number }
  }
  const explicitBeats = new Map<string, ExplicitBeat>()
  const orderedSourceBeats = source.beats.map((item, index) => ({ item, index }))
    .sort((a, b) => a.item.startSeconds - b.item.startSeconds || a.index - b.index)
  for (const { item, index } of orderedSourceBeats) {
    const actor = resolveCast(item.character)
    if (item.expression && !byId.get(actor.characterId)?.customization.faceAppearance) throw new Error(actor.name + ' não possui rosto configurado para a expressão especificada.')
    if (item.poseCategory !== undefined && item.poseSlot !== undefined)
      throw new Error(`beats[${index}] informa poseCategory e poseSlot ao mesmo tempo para ${actor.name}; use somente um dos campos.`)
    if (item.poseSlot !== undefined && item.poseSlot !== null && !(available.posesByCharacter.get(actor.characterId) ?? []).includes(item.poseSlot))
      throw new Error(`Pose ${item.poseSlot} não encontrada para ${actor.name} em beats[${index}].poseSlot.`)
    const frame = secondsToFrame(item.startSeconds)
    const key = `${actor.characterId}:${frame}`
    const beat = explicitBeats.get(key) ?? { actor, frame, sequence: index }
    const addValue = <T>(
      attribute: string,
      previous: { field: string; index: number; value: T } | undefined,
      field: string,
      value: T,
      sameValue: (left: T, right: T) => boolean
    ) => {
      if (previous && !sameValue(previous.value, value)) {
        throw new Error(`Conflito de ${attribute} no quadro ${frame} para ${actor.name}: beats[${previous.index}].${previous.field} e beats[${index}].${field}. Combine atributos diferentes no mesmo quadro e deixe apenas um valor para cada atributo.`)
      }
      return previous ?? { field, index, value }
    }
    if (item.poseSlot !== undefined || item.poseCategory !== undefined) {
      const field = item.poseCategory !== undefined ? 'poseCategory' : 'poseSlot'
      const value = item.poseCategory !== undefined ? item.poseCategory : item.poseSlot!
      const previous = beat.pose
      const pose = addValue('pose', previous, field, value, (left, right) =>
        typeof left === 'string' && typeof right === 'string'
          ? categoryKey(left) === categoryKey(right)
          : left === right)
      beat.pose = { field: pose.field as 'poseSlot' | 'poseCategory', value: pose.value, index: pose.index }
    }
    if (item.expression !== undefined) {
      const value = resolvedExpression(actor, item.expression)
      beat.expression = addValue('expressão', beat.expression, 'expression', value, (left, right) => left === right) as ExplicitBeat['expression']
    }
    if (item.gaze !== undefined) {
      const value = localGaze(actor, item.gaze)
      beat.gaze = addValue('direção do olhar', beat.gaze, 'gaze', value, (left, right) => left === right) as ExplicitBeat['gaze']
    }
    explicitBeats.set(key, beat)
  }

  for (const { actor, frame, sequence, pose, expression, gaze } of [...explicitBeats.values()]
    .sort((a, b) => a.frame - b.frame || a.sequence - b.sequence)) {
    let slot: number | null | undefined
    if (pose?.field === 'poseSlot') slot = pose.value as number | null
    if (pose?.field === 'poseCategory') {
      const category = pose.value as string
      const options = categoryOptions(actor, category)
      const previous = latestPoseByCharacter.get(actor.characterId)
      const alternatives = options.filter((candidate) => candidate !== previous)
      const pool = alternatives.length ? alternatives : options
      slot = pool[Math.floor(rng() * pool.length)]
      const changes = categoryChanges.get(actor.characterId) ?? []
      changes.push({ frame, category }); categoryChanges.set(actor.characterId, changes)
    }
    if (slot !== undefined) latestPoseByCharacter.set(actor.characterId, slot)
    events.push({
      characterId: actor.characterId,
      startFrame: frame,
      ...(slot !== undefined ? { poseSlot: slot } : {}),
      ...(expression ? { expression: expression.value } : {}),
      ...(gaze ? { gaze: gaze.value } : {}),
      priority: 4,
      sequence
    })
  }
  const estimatedEnd = Math.max(1, ...videos.map((v) => v.startFrame+v.durationFrames), ...lines.map((v) => v.startFrame+v.durationFrames), ...events.map((v) => v.startFrame + 1))
  const durationFrames = Math.max(estimatedEnd, source.durationSeconds !== undefined ? secondsToFrame(source.durationSeconds): estimatedEnd)
  if (durationFrames > 1_000_000) throw new Error('Projeto maior do que 1.000.000 de quadros.')
  // Exactly one actor can be given a new REAL pose at each interval.
  const intervalFrames = source.autoPoseEverySeconds * EDITOR_V6_TIMELINE_FPS
  if (intervalFrames) {
    const poseEventsByCharacter = new Map<string, Array<(typeof events)[number]>>()
    const explicitPoseFrames = new Set<number>()
    for (const event of events) {
      if (event.poseSlot === undefined) continue
      const characterEvents = poseEventsByCharacter.get(event.characterId) ?? []
      characterEvents.push(event)
      poseEventsByCharacter.set(event.characterId, characterEvents)
      explicitPoseFrames.add(event.startFrame)
    }
    for (const characterEvents of poseEventsByCharacter.values()) {
      characterEvents.sort((left, right) => left.startFrame - right.startFrame
        || left.priority - right.priority || left.sequence - right.sequence)
    }
    const poseEventCursors = new Map(cast.map((actor) => [actor.characterId, 0]))
    const categoryEventCursors = new Map(cast.map((actor) => [actor.characterId, 0]))
    const currentPoseByCharacter = new Map<string, number | null>()
    const currentCategoryByCharacter = new Map(cast.map((actor) => [actor.characterId, actor.poseCategory]))
    const optionsCache = new Map<string, readonly number[]>()
    const optionsAt = (actor: ReactImportCast): readonly number[] => {
      const category = currentCategoryByCharacter.get(actor.characterId) ?? actor.poseCategory
      const key = `${actor.characterId}\u0000${category ? categoryKey(category) : ''}`
      let options = optionsCache.get(key)
      if (!options) {
        options = category ? categoryOptions(actor, category) : available.posesByCharacter.get(actor.characterId) ?? []
        optionsCache.set(key, options)
      }
      return options
    }
    for (let frame = intervalFrames; frame < durationFrames; frame += intervalFrames) {
      for (const actor of cast) {
        const characterId = actor.characterId
        const poseEvents = poseEventsByCharacter.get(characterId) ?? []
        let poseCursor = poseEventCursors.get(characterId) ?? 0
        while (poseCursor < poseEvents.length && poseEvents[poseCursor].startFrame <= frame) {
          currentPoseByCharacter.set(characterId, poseEvents[poseCursor].poseSlot!)
          poseCursor++
        }
        poseEventCursors.set(characterId, poseCursor)

        const changes = categoryChanges.get(characterId) ?? []
        let categoryCursor = categoryEventCursors.get(characterId) ?? 0
        while (categoryCursor < changes.length && changes[categoryCursor].frame <= frame) {
          currentCategoryByCharacter.set(characterId, changes[categoryCursor].category)
          categoryCursor++
        }
        categoryEventCursors.set(characterId, categoryCursor)
      }
      if (explicitPoseFrames.has(frame)) continue

      const eligible = cast.filter((actor) => optionsAt(actor).length > 1)
      if (!eligible.length) continue
      const actor = eligible[Math.floor(rng() * eligible.length)]
      const previous = currentPoseByCharacter.get(actor.characterId) ?? selectedPose.get(actor.characterId)
      const choices = optionsAt(actor).filter((slot) => slot !== previous)
      if (!choices.length) continue
      const chosen = choices[Math.floor(rng() * choices.length)]
      selectedPose.set(actor.characterId, chosen)
      currentPoseByCharacter.set(actor.characterId, chosen)
      events.push({ characterId: actor.characterId, startFrame: frame, poseSlot: chosen, priority: 1, sequence: frame })
    }
  }
  // Gaze changes are recomputed at every speech boundary; overlapping speeches
  // cannot accidentally restore a listener before the current speaker finishes.
  if (source.autoListenerGaze) {
    const speechesByCharacter = new Map<string, ReactImportLine[]>()
    for (const line of lines) {
      if (line.kind !== 'speech') continue
      const characterLines = speechesByCharacter.get(line.characterId) ?? []
      characterLines.push(line)
      speechesByCharacter.set(line.characterId, characterLines)
    }
    for(const listener of cast){
      const listenerOffset = listener.x - tvX
      if (listenerOffset === 0) continue
      const eventDeltas = new Map<number, number>()
      for (const speaker of cast) {
        const speakerOffset = speaker.x - tvX
        if (speaker.characterId === listener.characterId
          || speakerOffset * listenerOffset <= 0
          || Math.abs(speakerOffset) <= Math.abs(listenerOffset)) continue
        for (const line of speechesByCharacter.get(speaker.characterId) ?? []) {
          const endFrame = line.startFrame + line.durationFrames
          eventDeltas.set(line.startFrame, (eventDeltas.get(line.startFrame) ?? 0) + 1)
          eventDeltas.set(endFrame, (eventDeltas.get(endFrame) ?? 0) - 1)
        }
      }
      // All speakers on the listener's side and farther from the TV point in
      // the same stage direction. Only whether any speech is active matters;
      // repeatedly rescanning every line at every boundary was quadratic in
      // line count and did not affect the resulting gaze direction.
      const awayGaze = localGaze(listener, listenerOffset < 0 ? 'left' : 'right')
      let activeSpeechCount = 0
      let previous = frontGaze(listener)
      for (const [frame, delta] of [...eventDeltas].sort(([left], [right]) => left - right)) {
        activeSpeechCount += delta
        const looking: 'left' | 'right' = activeSpeechCount > 0 ? awayGaze : frontGaze(listener)
        if(looking!==previous){
          events.push({characterId:listener.characterId,startFrame:frame,gaze:looking,priority:3,sequence:frame})
          previous=looking
        }
      }
    }
  }
  // Collapse simultaneous changes; preserve pose, expression and gaze independently.
  events.sort((a,b)=>a.startFrame-b.startFrame||a.priority-b.priority||a.sequence-b.sequence)
  const merged=new Map<string,ReactImportBeat>()
  for(const event of events){
    const key=event.characterId+':'+event.startFrame
    const prev=merged.get(key)??{characterId:event.characterId,startFrame:event.startFrame}
    merged.set(key,{...prev,...(event.poseSlot!==undefined?{poseSlot:event.poseSlot}:{}),...(event.expression!==undefined?{expression:event.expression}:{}),...(event.gaze!==undefined?{gaze:event.gaze}:{})})
  }
  const intro: ReactImportIntroPart[] = []
  const introPoseByCharacter = new Map<string, number | null>()
  let contentStartFrame = 0
  for (const entry of source.intro ?? []) {
    const startFrame = entry.startSeconds === undefined ? contentStartFrame : secondsToFrame(entry.startSeconds)
    const duration = editorV6IntroDurationFrames(entry)
    contentStartFrame = startFrame + duration
    if (entry.kind === 'black') {
      intro.push({ kind: 'black', text: entry.text, startFrame, durationFrames: duration })
      continue
    }
    const actor = resolveCast(entry.character)
    const base = merged.get(actor.characterId + ':0')!
    let expression = base.expression
    let poseSlot = introPoseByCharacter.has(actor.characterId)
      ? introPoseByCharacter.get(actor.characterId)!
      : base.poseSlot ?? null
    entry.parts.forEach((part, index) => {
      if (part.expression === null) expression = undefined
      if (part.expression) {
        if (!byId.get(actor.characterId)?.customization.faceAppearance) throw new Error(actor.name + ' precisa de uma aparência facial para usar expressões na Intro.')
        expression = resolvedExpression(actor, part.expression)
      }
      const partStart = secondsToFrame(part.startSeconds)
      if (part.poseCategory !== undefined) {
        const options = categoryOptions(actor, part.poseCategory)
        const alternatives = options.filter(candidate => candidate !== poseSlot)
        const choices = alternatives.length ? alternatives : options
        poseSlot = choices[Math.floor(rng() * choices.length)]
      } else if (part.poseSlot !== undefined) {
        if (typeof part.poseSlot === 'number' && !(available.posesByCharacter.get(actor.characterId) ?? []).includes(part.poseSlot)) {
          throw new Error('Pose ' + part.poseSlot + ' não encontrada para ' + actor.name)
        }
        poseSlot = part.poseSlot
      }
      const next = entry.parts[index + 1]
      const partDuration = (next ? secondsToFrame(next.startSeconds) : duration) - partStart
      const words = Math.max(...[part.text, part.englishText].map((value) => value.split(/\s+/).length))
      if (partDuration < secondsToFrame(1.3 + words * 0.24)) warnings.push(`Intro de ${actor.name}, parte ${index + 1}: considere mais tempo para leitura.`)
      intro.push({
        kind: 'character', characterId: actor.characterId, text: part.text, englishText: part.englishText,
        expression, flipX: part.flipX ?? actor.flipX ?? false, poseSlot,
        gaze: part.face?.activeExpressionGaze ?? base.gaze ?? 'right', face: part.face,
        ...(part.portraitLayout ? { portraitLayout: part.portraitLayout } : {}),
        startFrame: startFrame + partStart, durationFrames: partDuration
      })
    })
    introPoseByCharacter.set(actor.characterId, poseSlot)
  }
  const introOnly = intro.length > 0 && !videos.length && !lines.length && !source.beats.length && !source.durationSeconds
  const totalFrames = contentStartFrame + (introOnly ? 0 : durationFrames)
  if (totalFrames > 1_000_000) throw new Error('Intro e conteúdo excedem 1.000.000 de quadros.')
  return {title:source.title,seed:source.seed,backgroundColor:source.backgroundColor,durationFrames:totalFrames,contentStartFrame,intro,cast,videos,lines,beats:[...merged.values()].filter((event)=>event.startFrame<durationFrames),warnings}
}

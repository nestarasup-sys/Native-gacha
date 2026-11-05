/** Portable AI react format. This is intentionally NOT the persisted EditorV6Document. */
import { z } from 'zod'
import type { CustomizerCharacter } from './customizer'
import type { EditorV6MediaAsset } from './editorV6'
import type { VideoLibraryItem } from './mediaLibrary'
import type { BaseVideoDetails } from './baseVideos'

export const EDITOR_V6_REACT_IMPORT_FORMAT = 'NYMI_EDITOR_V6_REACT_V1'
const seconds = z.number().finite().min(0).max(33_333)
const characterRef = z.string().trim().min(1).max(120)
const emotion = z.string().trim().min(1).max(120)
const gaze = z.enum(['left', 'right'])
const pose = z.number().int().min(1).max(999)
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
  autoPoseEverySeconds: z.number().int().min(0).max(3600).default(15),
  autoListenerGaze: z.boolean().default(true),
  cast: z.array(placement.extend({
    character: characterRef,
    poseSlot: pose.nullable().optional(),
    expression: emotion.optional(),
    gaze: gaze.optional()
  })).min(1).max(24),
  videos: z.array(z.object({
    videoId: z.string().uuid().optional(),
    videoName: z.string().trim().min(1).max(255).optional(),
    videoNumber: z.number().int().min(1).max(500).optional(),
    startSeconds: seconds,
    durationSeconds: z.number().finite().gt(0).max(33_333).optional(),
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
    expression: emotion.optional(),
    gaze: gaze.optional()
  })).max(10000).default([]),
  durationSeconds: seconds.optional()
}).strict()

export type EditorV6ReactImport = z.infer<typeof editorV6ReactImportSchema>
export type ReactImportCast = EditorV6ReactImport['cast'][number] & { characterId: string; name: string; modelSlot: number }
export type ReactImportLine = EditorV6ReactImport['lines'][number] & { characterId: string; startFrame: number; durationFrames: number }
export type ReactImportBeat = { characterId: string; startFrame: number; poseSlot?: number | null; expression?: string; gaze?: 'left' | 'right' }
export type EditorV6ReactImportPlan = {
  title: string; seed: number; backgroundColor: string; durationFrames: number
  cast: ReactImportCast[]
  videos: Array<{ video: EditorV6MediaAsset; startFrame: number; durationFrames: number; layout?: EditorV6ReactImport['videos'][number]['layout'] }>
  lines: ReactImportLine[]
  beats: ReactImportBeat[]
  warnings: string[]
}
export type ReactImportSources = {
  characters: readonly CustomizerCharacter[]
  posesByCharacter: ReadonlyMap<string, readonly number[]>
  presetsByModel: ReadonlyMap<number, readonly { id: string; name: string }[]>
  media: readonly EditorV6MediaAsset[]
}
export function parseEditorV6ReactImport(source: unknown): EditorV6ReactImport {
  return editorV6ReactImportSchema.parse(source)
}
export const secondsToFrame = (value: number): number => Math.ceil(value * 30 - 1e-8)
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
    return {videoId:matched[0].id,startSeconds:video.startSeconds,...(video.durationSeconds?{durationSeconds:video.durationSeconds}:{}),...(video.layout?{layout:video.layout}:{})}
  })}
}

const canonical = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('pt-BR')
const random = (seed: number) => {
  let state = seed >>> 0
  return () => { state = (Math.imul(1664525, state) + 1013904223) >>> 0; return state / 4294967296 }
}

export function planEditorV6ReactImport(source: EditorV6ReactImport, available: ReactImportSources): EditorV6ReactImportPlan {
  const warnings: string[] = []
  const byId = new Map(available.characters.map((item) => [item.id, item]))
  const byName = new Map<string, CustomizerCharacter[]>()
  for (const item of available.characters) {
    const key = canonical(item.name)
    byName.set(key, [...(byName.get(key) ?? []), item])
  }
  const resolveCharacter = (value: string): CustomizerCharacter => {
    const direct = byId.get(value)
    if (direct) return direct
    const matches = byName.get(canonical(value)) ?? []
    if (matches.length !== 1) throw new Error(matches.length ? 'Nome de personagem ambíguo: ' + value : 'Personagem não encontrado no Customizador: ' + value)
    return matches[0]
  }
  const rng = random(source.seed)
  const cast: ReactImportCast[] = source.cast.map((item) => {
    const character = resolveCharacter(item.character)
    return { ...item, characterId: character.id, name: character.name, modelSlot: character.customization.modelSlot ?? 1 }
  })
  if (new Set(cast.map((item) => item.characterId)).size !== cast.length) throw new Error('O elenco contém um personagem repetido.')
  const castById = new Map(cast.map((item) => [item.characterId, item]))
  const tvX=source.videos[0]?.layout?.x??0
  const frontGaze=(actor:ReactImportCast):'left'|'right'=>actor.gaze??(actor.x>tvX?'left':'right')
  const resolveCast = (name: string): ReactImportCast => {
    const character = resolveCharacter(name)
    const selected = castById.get(character.id)
    if (!selected) throw new Error('Personagem usado fora do elenco: ' + name)
    return selected
  }
  // One model may offer the same named expression for many actors; resolve per model.
  const resolvedExpression = (actor: ReactImportCast, name: string): string => {
    const presets = available.presetsByModel.get(actor.modelSlot) ?? []
    const found = presets.find((item) => item.id === name)
      ?? presets.filter((item) => canonical(item.name) === canonical(name))[0]
    if (!found) throw new Error('Expressão não encontrada para ' + actor.name + ': ' + name)
    return found.id
  }
  const usedInitialExpressions = new Set<string>()
  const usedInitialPoses = new Set<number>()
  const selectedPose = new Map<string, number | null>()
  const selectedEmotion = new Map<string, string | undefined>()
  const initial: ReactImportBeat[] = cast.map((actor) => {
    const options = [...new Set(available.posesByCharacter.get(actor.characterId) ?? [])].sort((a,b) => a - b)
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
    const requested = item.durationSeconds === undefined ? video.sourceFrames : secondsToFrame(item.durationSeconds)
    const durationFrames = Math.min(video.sourceFrames, requested)
    if (startFrame + durationFrames > 1_000_000) throw new Error('Vídeo fora do limite de frames.')
    return { video, startFrame, durationFrames, ...(item.layout ? { layout: item.layout } : {}) }
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
    const count=line.text.trim().split(/\s+/).filter(Boolean).length
    const minimum=count<=3?2.6:count<=7?3.2:count<=12?3.9:count<=18?4.9:count<=25?6.2:count<=35?7.6:count<=45?9:count<=60?11:1.3+count*.24
    return Math.max(minimum,1.3+count*.24)+(line.kind === 'thought' ? 0.4 : 0)
  }
  lines.forEach((line,index)=>{
    const required=secondsToFrame(minReadingSeconds(line))
    if(line.durationFrames<required)warnings.push('Bloco '+(index+1)+': '+line.durationFrames+' frames, abaixo da leitura recomendada de '+required+' frames.')
  })
  const events: Array<ReactImportBeat & { priority: number; sequence: number }> = initial.map((item,i) => ({ ...item, priority:0,sequence:i }))
  source.beats.forEach((item,i) => {
    const actor = resolveCast(item.character)
    if(item.expression&&!byId.get(actor.characterId)?.customization.faceAppearance)throw new Error(actor.name+' não possui rosto configurado para a expressão especificada.')
    if (item.poseSlot !== undefined && item.poseSlot !== null && !(available.posesByCharacter.get(actor.characterId) ?? []).includes(item.poseSlot)) throw new Error('Pose ' + item.poseSlot + ' não encontrada para ' + actor.name)
    events.push({ characterId:actor.characterId,startFrame:secondsToFrame(item.startSeconds),...(item.poseSlot !== undefined ? {poseSlot:item.poseSlot}:{}),...(item.expression ? {expression:resolvedExpression(actor,item.expression)}:{}),...(item.gaze ? {gaze:item.gaze}:{}),priority:2,sequence:i })
  })
  const estimatedEnd = Math.max(1, ...videos.map((v) => v.startFrame+v.durationFrames), ...lines.map((v) => v.startFrame+v.durationFrames), ...events.map((v) => v.startFrame))
  const durationFrames = Math.max(estimatedEnd, source.durationSeconds !== undefined ? secondsToFrame(source.durationSeconds): estimatedEnd)
  if (durationFrames > 1_000_000) throw new Error('Projeto maior do que 1.000.000 de quadros.')
  // Exactly one actor can be given a new REAL pose at each interval.
  const intervalFrames = source.autoPoseEverySeconds * 30
  if (intervalFrames) for(let frame=intervalFrames;frame<durationFrames;frame+=intervalFrames){
    if(events.some((event)=>event.startFrame===frame&&event.poseSlot!==undefined))continue
    const eligible = cast.filter((actor)=> (available.posesByCharacter.get(actor.characterId)?.length ?? 0)>1 && !events.some((event)=>event.startFrame===frame&&event.characterId===actor.characterId&&event.poseSlot!==undefined))
    if (!eligible.length) break
    const actor = eligible[Math.floor(rng()*eligible.length)]
    const previous=[...events].filter((event)=>event.characterId===actor.characterId&&event.startFrame<=frame&&event.poseSlot!==undefined).sort((a,b)=>b.startFrame-a.startFrame||b.priority-a.priority)[0]?.poseSlot??selectedPose.get(actor.characterId)
    const choices = (available.posesByCharacter.get(actor.characterId) ?? []).filter((slot)=>slot!==previous)
    if (!choices.length) continue
    const chosen = choices[Math.floor(rng()*choices.length)]
    selectedPose.set(actor.characterId,chosen)
    events.push({characterId:actor.characterId,startFrame:frame,poseSlot:chosen,priority:1,sequence:frame})
  }
  // Gaze changes are recomputed at every speech boundary; overlapping speeches
  // cannot accidentally restore a listener before the current speaker finishes.
  if (source.autoListenerGaze) {
    const speeches=[...lines].filter((line)=>line.kind==='speech').sort((a,b)=>a.startFrame-b.startFrame)
    const boundaryFrames=[...new Set(speeches.flatMap((line)=>[line.startFrame,line.startFrame+line.durationFrames]))].sort((a,b)=>a-b)
    for(const listener of cast){
      let previous=frontGaze(listener)
      for(const frame of boundaryFrames){
        const active=speeches.filter((line)=>{
          if(line.characterId===listener.characterId||line.startFrame>frame||frame>=line.startFrame+line.durationFrames)return false
          const speaker=castById.get(line.characterId)!
          const sameSide=(speaker.x-tvX)*(listener.x-tvX)>0
          const listenerInFront=Math.abs(listener.x-tvX)<Math.abs(speaker.x-tvX)
          return sameSide&&listenerInFront
        })
        const speaker=active.at(-1)
        const speakerPosition=speaker?castById.get(speaker.characterId):undefined
        const looking:'left'|'right'=speakerPosition?(speakerPosition.x<listener.x?'left':'right'):frontGaze(listener)
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
  return {title:source.title,seed:source.seed,backgroundColor:source.backgroundColor,durationFrames,cast,videos,lines,beats:[...merged.values()].filter((event)=>event.startFrame<durationFrames),warnings}
}

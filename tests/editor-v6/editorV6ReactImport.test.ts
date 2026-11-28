import { describe, expect, it, vi } from 'vitest'
import type { CustomizerCharacter } from '../../src/shared/customizer'
import type { EditorV6MediaAsset } from '../../src/shared/editorV6'
import { EDITOR_V6_REACT_IMPORT_FORMAT, parseEditorV6ReactImport, planEditorV6ReactImport, preflightEditorV6ReactImport, resolveEditorV6ReactVideos, secondsToFrame } from '../../src/shared/editorV6ReactImport'
import { compileEditorV6ReactImport, prepareEditorV6ReactSources } from '../../src/renderer/src/features/editorV6/editorV6ReactImportCompiler'

const idA='123e4567-e89b-42d3-a456-426614174001'
const idB='123e4567-e89b-42d3-a456-426614174002'
const videoId='123e4567-e89b-42d3-a456-426614174003'
const actors=[
  {id:idA,name:'Chloé',customization:{modelSlot:1,poseSlot:1,faceAppearance:{modelSlot:1}}},
  {id:idB,name:'Luka',customization:{modelSlot:1,poseSlot:1,faceAppearance:{modelSlot:1}}}
] as unknown as CustomizerCharacter[]
const video:EditorV6MediaAsset={id:videoId,libraryVideoId:videoId,name:'TikTok 01',fileName:videoId+'.mp4',kind:'video',mimeType:'video/mp4',sourceFrames:180,hasAudio:true,width:1080,height:1920,sizeBytes:20000}
const sample=()=>parseEditorV6ReactImport({
  format:EDITOR_V6_REACT_IMPORT_FORMAT,title:'React sem reescrita',seed:7,
  cast:[{character:'Chloé',x:-30,y:15},{character:'Luka',x:-10,y:15}],
  videos:[{videoId,startSeconds:0}],durationSeconds:31,
  lines:[
    {character:'Chloé',kind:'speech',text:'Texto exato!\nSegunda linha.',startSeconds:6,durationSeconds:3},
    {character:'Luka',kind:'thought',text:'Isso é segredo.',startSeconds:10,durationSeconds:2}
  ],
  beats:[{character:'Chloé',startSeconds:6,expression:'espantada'},{character:'Chloé',startSeconds:9,expression:'normal'}]
})
const references=()=>({
  characters:actors,
  posesByCharacter:new Map([[idA,[1,2,3]],[idB,[1,2,3]]]),
  presetsByModel:new Map([[1,[{id:'exp-surprise',name:'espantada'},{id:'exp-normal',name:'normal'},{id:'exp-smile',name:'feliz'}]]]),
  media:[video]
})
describe('JSON portátil do Editor V6',()=>{
  it('obtém categorias e seleção atual de poses pelo Fabricador', async () => {
    vi.stubGlobal('window', { desktop: { fabricator: {
      listFabricatorPoseSlots: async () => [{slot:1,sourceModelSlot:1,name:'Pose',category:'Parado',updatedAt:'a'},{slot:2,sourceModelSlot:1,name:'Pose',category:'Sentado',updatedAt:'b'}],
      getFabricatorExportPoseSlots: async () => [2,null,null,null,null],
      listFaceExpressionPresets: async () => []
    } } })
    try {
      const sources=await prepareEditorV6ReactSources(sample(),actors)
      expect(sources.selectedPoses?.get(idA)).toEqual([2])
      expect(sources.poseCategories?.get(idA)?.get(2)).toBe('Sentado')
      expect(sources.poseSlots.get(idA)).toEqual([1,2])
    } finally { vi.unstubAllGlobals() }
  })
  it('verifica vídeos únicos com no máximo três análises simultâneas antes de validar sobreposição', async () => {
    const ids = Array.from({ length: 6 }, () => crypto.randomUUID())
    let active = 0
    let peak = 0
    const linkEditorV6LibraryVideo = vi.fn(async (_projectId: string, id: string) => {
      peak = Math.max(peak, ++active)
      await new Promise((resolve) => setImmediate(resolve))
      active--
      return { ...video, id, libraryVideoId: id, fileName: id + '.mp4' }
    })
    vi.stubGlobal('window', { desktop: { editorV6: { linkEditorV6LibraryVideo } } })
    try {
      const source = { ...sample(), videos: [...ids, ids[0]].map((id) => ({ videoId: id, startSeconds: 0 })) }
      const refs = references()
      const progress: string[] = []
      await expect(compileEditorV6ReactImport(source, {
        characters: refs.characters, poseSlots: refs.posesByCharacter, poseRevisions: new Map(), presets: refs.presetsByModel
      }, (message) => progress.push(message))).rejects.toThrow(/sobrepõem/)
      expect(peak).toBe(3)
      expect(active).toBe(0)
      expect(linkEditorV6LibraryVideo.mock.calls.map(([, id]) => id)).toEqual(ids)
      expect(progress.at(-1)).toBe('Verificando mídia 6/6')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('rejeita erros semânticos do roteiro antes de analisar os arquivos de vídeo', async () => {
    const linkEditorV6LibraryVideo = vi.fn(async () => video)
    vi.stubGlobal('window', { desktop: { editorV6: { linkEditorV6LibraryVideo } } })
    const refs = references()
    const source = { ...sample(), beats: [{ character: 'Chloé', startSeconds: 6, poseSlot: 999 }] }
    try {
      await expect(compileEditorV6ReactImport(source, {
        characters: refs.characters,
        poseSlots: refs.posesByCharacter as Map<string, number[]>,
        poseRevisions: new Map(),
        presets: refs.presetsByModel as Map<number, Array<{ id: string; name: string }>>
      })).rejects.toThrow(/Pose 999 não encontrada/)
      expect(linkEditorV6LibraryVideo).not.toHaveBeenCalled()
      const conflictingExpressions = parseEditorV6ReactImport({ ...sample(), beats: [
        { character: 'Chloé', startSeconds: 6, expression: 'espantada' },
        { character: 'Chloé', startSeconds: 6, expression: 'feliz' }
      ] })
      expect(() => preflightEditorV6ReactImport(conflictingExpressions, {
        characters: refs.characters,
        posesByCharacter: refs.posesByCharacter,
        presetsByModel: refs.presetsByModel
      })).toThrow(/Conflito de expressão/)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('identifica vídeo pelo número ou nome real da Base de Vídeos',()=>{
    const parsed=sample()
    const library=[{id:videoId,name:'Clipe Principal.mp4',mimeType:'video/mp4' as const,extension:'mp4' as const,size:20000,durationFrames:180,createdAt:'2026-01-01T00:00:00.000Z',available:true}]
    const details=[{videoId,videoNumber:7,description:'',timeline:'unspecified' as const}]
    const numbered={...parsed,videos:[{videoNumber:7,startSeconds:0}]}
    expect(resolveEditorV6ReactVideos(numbered,library,details).videos[0].videoId).toBe(videoId)
    const named={...parsed,videos:[{videoName:'Clipe Principal.mp4',startSeconds:0}]}
    expect(resolveEditorV6ReactVideos(named,library,details).videos[0].videoId).toBe(videoId)
    expect(()=>resolveEditorV6ReactVideos({...parsed,videos:[{videoNumber:9,startSeconds:0}]},library,details)).toThrow(/não encontrado/)
  })
  it('preserva a apresentação explícita pela resolução por número e mantém vídeos antigos sem adereços', () => {
    const presentation = { bottomCard: '  Contexto  ', timeCard: 'Future', loadingGif: true }
    const source = parseEditorV6ReactImport({ ...sample(), videos: [{ videoNumber: 7, startSeconds: 8, presentation }] })
    const library = [{ id: videoId, name: video.name, mimeType: 'video/mp4' as const, extension: 'mp4' as const,
      size: 20_000, durationFrames: 180, createdAt: '2026-01-01T00:00:00.000Z', available: true }]
    const resolved = resolveEditorV6ReactVideos(source, library, [{ videoId, videoNumber: 7, description: '', timeline: 'unspecified' }])
    expect(planEditorV6ReactImport(resolved, references()).videos[0]).toMatchObject({
      startFrame: 240, presentation: { ...presentation, bottomCard: 'Contexto' }
    })
    expect(planEditorV6ReactImport(sample(), references()).videos[0].presentation).toBeUndefined()
    expect(() => parseEditorV6ReactImport({ ...sample(), videos: [{ videoId, startSeconds: 3, presentation: { timeCard: 'Passado' } }] })).toThrow()
    expect(() => parseEditorV6ReactImport({ ...sample(), videos: [{ videoId, startSeconds: 3, presentation: { loadingGif: 'assets/loading.gif' } }] })).toThrow()
  })
  it('valida intervalos independentes e rejeita sobreposição ou posições ambíguas', () => {
    const original = sample()
    const bottomCards = [{ startSeconds: 10, endSeconds: 15, text: 'Primeiro' }, { startSeconds: 16, endSeconds: 20, text: 'Segundo' }]
    const presentation = { bottomCards, timeCards: [{ startSeconds: 0, endSeconds: 20, text: 'Past' }] }
    const parsed = parseEditorV6ReactImport({ ...original, videos: [{ videoId, startSeconds: 8, presentation }] })
    expect(planEditorV6ReactImport(parsed, references()).videos[0].presentation).toEqual(presentation)
    expect(() => parseEditorV6ReactImport({ ...original, videos: [{ videoId, startSeconds: 8, presentation: { bottomCards: [...bottomCards, { startSeconds: 14, endSeconds: 17, text: 'Colisão' }] } }] })).toThrow()
    expect(() => parseEditorV6ReactImport({ ...original, videos: [{ videoId, startSeconds: 8, presentation: { bottomCard: 'Fixo', bottomCards } }] })).toThrow()
  })
  it('valida formato, mantém texto original e aplica os defaults',()=>{
    const parsed=sample()
    expect(parsed.autoPoseEverySeconds).toBe(15)
    expect(parsed.autoListenerGaze).toBe(true)
    expect(parsed.lines[0].text).toBe('Texto exato!\nSegunda linha.')
    expect(()=>parseEditorV6ReactImport({...parsed,format:'schema_version: 3'})).toThrow()
  })
  it('preserva a tradução opcional e inclui o último beat na duração',()=>{
    const source=sample()
    const parsed=parseEditorV6ReactImport({...source, durationSeconds: 0, autoPoseEverySeconds: 0,
      lines:[{...source.lines[0], englishText:'Exact text\nwith punctuation!'}],
      beats:[{character:'Luka', startSeconds:40, poseSlot:2}]})
    const plan=planEditorV6ReactImport(parsed,references())
    expect(plan.lines[0].englishText).toBe('Exact text\nwith punctuation!')
    expect(plan.durationFrames).toBe(1201)
    expect(plan.beats.some((beat)=>beat.startFrame===1200 && beat.poseSlot===2)).toBe(true)
    expect(planEditorV6ReactImport(sample(),references()).lines[0].englishText).toBeUndefined()
  })
  it('define escala 121 para o elenco importado mesmo quando o JSON informa outro valor',()=>{
    const source=sample()
    const plan=planEditorV6ReactImport({...source,cast:[{...source.cast[0],scale:85},source.cast[1]]},references())
    expect(plan.cast.map((actor)=>actor.scale)).toEqual([121,121])
  })
  it('usa o frame da primeira fala pós-vídeo sem atraso e permite continuidade depois do MP4',()=>{
    const plan=planEditorV6ReactImport(sample(),references())
    expect(plan.videos[0].durationFrames).toBe(180)
    expect(plan.lines[0].startFrame).toBe(180)
    expect(plan.lines[0].durationFrames).toBe(90)
    expect(plan.durationFrames).toBeGreaterThanOrEqual(360)
  })
  it('usa PT para ouvintes somente quando há fala e restaura ao terminar',()=>{
    const plan=planEditorV6ReactImport(sample(),references())
    const gaze=plan.beats.filter((b)=>b.characterId===idB&&b.gaze!==undefined)
    expect(gaze.some((b)=>b.startFrame===180&&b.gaze==='left')).toBe(true)
    expect(gaze.some((b)=>b.startFrame===270&&b.gaze==='right')).toBe(true)
    expect(gaze.some((b)=>b.startFrame===300&&b.gaze==='left')).toBe(false)
  })
  it('mantém o olhar durante falas sobrepostas do mesmo lado e só restaura após a última terminar',()=>{
    const source=parseEditorV6ReactImport({...sample(),lines:[
      {character:'Chloé',kind:'speech',text:'Primeira fala',startSeconds:1,durationSeconds:4},
      {character:'Chloé',kind:'speech',text:'Fala sobreposta',startSeconds:3,durationSeconds:4}
    ]})
    const gaze=planEditorV6ReactImport(source,references()).beats
      .filter((beat)=>beat.characterId===idB&&beat.gaze!==undefined)
      .map(({startFrame,gaze})=>({startFrame,gaze}))
    expect(gaze).toEqual([{startFrame:0,gaze:'right'},{startFrame:30,gaze:'left'},{startFrame:210,gaze:'right'}])
  })
  it('não vira quem está no lado oposto da TV',()=>{
    const parsed=sample()
    const opposite={...parsed,cast:[parsed.cast[0],{...parsed.cast[1],x:30}]}
    const beats=planEditorV6ReactImport(opposite,references()).beats
    expect(beats.some((beat)=>beat.characterId===idB&&beat.startFrame===180&&beat.gaze==='left')).toBe(false)
  })
  it('espelha o elenco à direita e usa PT apenas para olhar para trás',()=>{
    const source=sample()
    const plan=planEditorV6ReactImport({...source,cast:[{...source.cast[0],x:30},{...source.cast[1],x:10}]},references())
    expect(plan.cast.map((actor)=>actor.flipX)).toEqual([true,true])
    const gaze=plan.beats.filter((beat)=>beat.characterId===idB&&beat.gaze!==undefined)
    expect(gaze.find((beat)=>beat.startFrame===0)?.gaze).toBe('right')
    expect(gaze.find((beat)=>beat.startFrame===180)?.gaze).toBe('left')
    expect(gaze.find((beat)=>beat.startFrame===270)?.gaze).toBe('right')
    const explicit=planEditorV6ReactImport({...source,cast:[{...source.cast[0],x:30,flipX:false},source.cast[1]]},references())
    expect(explicit.cast[0].flipX).toBe(false)
  })
  it('preserva direção manual no mesmo frame de PT automático',()=>{
    const source=sample()
    const beats=planEditorV6ReactImport({...source,beats:[...source.beats,{character:'Luka',startSeconds:6,gaze:'right' as const}]},references()).beats
    const gaze=beats.find((beat)=>beat.characterId===idB&&beat.startFrame===180)
    expect(gaze?.gaze).toBe('right')
  })
  it('escolhe poses iniciais distintas quando disponíveis e só uma troca por intervalo',()=>{
    const plan=planEditorV6ReactImport(sample(),references())
    const initials=plan.beats.filter((b)=>b.startFrame===0)
    expect(new Set(initials.map((item)=>item.poseSlot)).size).toBe(2)
    expect(plan.beats.filter((b)=>b.startFrame===450&&b.poseSlot!==undefined).length).toBe(1)
    expect(plan.beats.every((b)=>b.startFrame>=0&&b.startFrame<plan.durationFrames)).toBe(true)
  })
  it('preserva a sequência reproduzível de poses automáticas e deixa a troca explícita assumir seu intervalo',()=>{
    const base=sample()
    const source=parseEditorV6ReactImport({...base,seed:7,autoPoseEverySeconds:1,autoListenerGaze:false,
      cast:[{character:'Chloé',x:-30,y:15}],videos:[],lines:[],durationSeconds:5,
      beats:[{character:'Chloé',startSeconds:2,poseSlot:2}]})
    const plan=planEditorV6ReactImport(source,references())
    const poses=plan.beats.filter((beat)=>beat.poseSlot!==undefined).map(({startFrame,poseSlot})=>({startFrame,poseSlot}))
    expect(poses).toEqual([{startFrame:0,poseSlot:1},{startFrame:30,poseSlot:3},{startFrame:60,poseSlot:2},
      {startFrame:90,poseSlot:3},{startFrame:120,poseSlot:1}])
    expect(plan.beats.filter((beat)=>beat.startFrame===60&&beat.poseSlot!==undefined)).toHaveLength(1)
  })
  it('usa apenas as variações selecionadas da categoria e muda de categoria no beat',()=>{
    const parsed=sample()
    const source=parseEditorV6ReactImport({...parsed,cast:[{character:'Chloé',x:-30,y:15,poseCategory:'Em pé'}],lines:[],videos:[],durationSeconds:46,beats:[{character:'Chloé',startSeconds:20,poseCategory:'Sentado'}]})
    const refs=references()
    const available={...refs,posesByCharacter:new Map([[idA,[1,2,3,4,5]]]),selectedPosesByCharacter:new Map([[idA,[1,2,3,4]]]),poseCategoriesByCharacter:new Map([[idA,new Map([[1,'Parado'],[2,'Sentado'],[3,'Parado'],[4,'Sentado'],[5,'Sentado']])]])}
    const plan=planEditorV6ReactImport(source,available)
    expect(plan.beats.filter((beat)=>beat.startFrame<600 && beat.poseSlot!==undefined).every((beat)=>[1,3].includes(beat.poseSlot!))).toBe(true)
    expect(plan.beats.filter((beat)=>beat.startFrame>=600 && beat.poseSlot!==undefined).every((beat)=>[2,4].includes(beat.poseSlot!))).toBe(true)
    expect(plan.beats.find((beat)=>beat.startFrame===450)?.poseSlot).not.toBe(plan.beats[0].poseSlot)
    expect(planEditorV6ReactImport(source,available)).toEqual(plan)
    expect(()=>planEditorV6ReactImport({...source,cast:[{...source.cast[0],poseCategory:'Deitado'}]},available)).toThrow(/Nenhuma pose selecionada/)
    expect(()=>planEditorV6ReactImport({...source,cast:[{...source.cast[0],poseSlot:1}]},available)).toThrow(/categorias ou somente slots/)
  })
  it('resolve categorias de pose em cada parte da Intro e mantém poseSlot só no projeto compilado',()=>{
    const source=parseEditorV6ReactImport({...sample(),autoPoseEverySeconds:0,intro:[{
      kind:'character',character:'Chloé',parts:[
        {startSeconds:0,englishText:'Standing.',text:'Em pé.',poseCategory:'Em pé'},
        {startSeconds:4,englishText:'Seated.',text:'Sentada.',poseCategory:'Sentado'}
      ]
    }]})
    const refs=references()
    const available={...refs,posesByCharacter:new Map([[idA,[1,2,3]]]),selectedPosesByCharacter:new Map([[idA,[1,2,3]]]),
      poseCategoriesByCharacter:new Map([[idA,new Map([[1,'Parado'],[2,'Sentado'],[3,'Em pé']])]])}
    const plan=planEditorV6ReactImport(source,available)
    const introPoses=plan.intro.map(part=>part.kind==='character'?part.poseSlot:null)
    expect([1,3]).toContain(introPoses[0])
    expect(introPoses[1]).toBe(2)
    expect(plan.intro.every(part=>part.kind==='character'&&!('poseCategory' in part))).toBe(true)
    expect(()=>parseEditorV6ReactImport({...sample(),intro:[{kind:'character',character:'Chloé',parts:[
      {startSeconds:0,englishText:'Standing.',text:'Em pé.',poseCategory:'Em pé',poseSlot:1}
    ]}]})).toThrow(/poseCategory ou poseSlot/)
    expect(()=>planEditorV6ReactImport(parseEditorV6ReactImport({...sample(),intro:[{kind:'character',character:'Chloé',parts:[
      {startSeconds:0,englishText:'Lying.',text:'Deitada.',poseCategory:'Deitado'}
    ]}]}),available)).toThrow(/Nenhuma pose selecionada/)
  })
  it('reconhece personagens sem acento e rejeita referências ausentes ou repetidas',()=>{
    const parsed=sample()
    expect(planEditorV6ReactImport({...parsed,cast:[{...parsed.cast[0],character:'Chloe'},parsed.cast[1]]},references()).cast[0].characterId).toBe(idA)
    expect(()=>planEditorV6ReactImport({...parsed,cast:[parsed.cast[0],{...parsed.cast[0]}]},references())).toThrow(/repetido/)
    expect(()=>planEditorV6ReactImport({...parsed,videos:[{videoId:'00000000-0000-4000-8000-000000000000',startSeconds:0}]},references())).toThrow(/não encontrado/)
  })
  it('rejeita vídeo simultâneo, pose inexistente e preserva precisão de quadro',()=>{
    const parsed=sample()
    expect(()=>planEditorV6ReactImport({...parsed,videos:[...parsed.videos,{videoId,startSeconds:1}]},references())).toThrow(/sobrepõem/)
    expect(()=>planEditorV6ReactImport({...parsed,beats:[{character:'Luka',startSeconds:2,poseSlot:50}]},references())).toThrow(/Pose/)
    expect(secondsToFrame(1.01)).toBe(31)
  })
  it('combina atributos diferentes no mesmo quadro, deduplica eventos idênticos e aponta conflitos',()=>{
    const source = parseEditorV6ReactImport({ ...sample(), autoPoseEverySeconds: 0, autoListenerGaze: false,
      beats: [
        { character: 'Chloé', startSeconds: 1.99, expression: 'espantada' },
        { character: 'Chloe', startSeconds: 2, gaze: 'left' },
        { character: 'Chloé', startSeconds: 2, gaze: 'left' }
      ]
    })
    const simultaneous = planEditorV6ReactImport(source, references()).beats.filter((beat) => beat.characterId === idA && beat.startFrame === 60)
    expect(simultaneous).toEqual([expect.objectContaining({ expression: 'exp-surprise', gaze: 'left' })])

    const conflicting = parseEditorV6ReactImport({ ...source,
      beats: [
        { character: 'Chloé', startSeconds: 1.99, expression: 'espantada' },
        { character: 'Chloe', startSeconds: 2, expression: 'normal' }
      ]
    })
    expect(() => planEditorV6ReactImport(conflicting, references()))
      .toThrow(/beats\[0\]\.expression e beats\[1\]\.expression/)
  })
  it('deduplica categorias equivalentes no mesmo quadro sem deslocar sorteios posteriores',()=>{
    const base = parseEditorV6ReactImport({ ...sample(), autoListenerGaze: false, durationSeconds: 46,
      cast: [{ character: 'Chloé', x: -30, y: 15, poseCategory: 'Em pé' }], lines: [], videos: [],
      beats: [{ character: 'Chloé', startSeconds: 19.99, poseCategory: 'Sentado' }]
    })
    const repeated = parseEditorV6ReactImport({ ...base, beats: [...base.beats,
      { character: 'Chloe', startSeconds: 20, poseCategory: ' sentado ' }
    ] })
    const available = { ...references(),
      posesByCharacter: new Map([[idA, [1, 2, 3, 4]]]),
      poseCategoriesByCharacter: new Map([[idA, new Map([[1, 'Em pé'], [2, 'Sentado'], [3, 'Em pé'], [4, 'Sentado']])]])
    }
    expect(planEditorV6ReactImport(repeated, available)).toEqual(planEditorV6ReactImport(base, available))
  })
  it('avisa quando beats explícitos do mesmo personagem geram estados de menos de oito quadros',()=>{
    const source = parseEditorV6ReactImport({ ...sample(), autoListenerGaze: false, autoPoseEverySeconds: 0,
      beats: [
        { character: 'Chloé', startSeconds: 2, expression: 'espantada' },
        { character: 'Chloé', startSeconds: 2.1, expression: 'normal' }
      ]
    })
    const plan = planEditorV6ReactImport(source, references())
    expect(plan.beats.filter((beat) => beat.characterId === idA).map((beat) => beat.startFrame)).toContain(63)
    expect(plan.warnings).toEqual(expect.arrayContaining([expect.stringMatching(/Chloé: estados separados por 3 quadro\(s\)/)]))
  })
})

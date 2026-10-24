import type { CustomizerCharacter, CustomizerFaceAppearance, FaceComponentPartId } from '../../../../shared/customizer'
import type { StudioElement, StudioFaceMode } from '../../../../shared/studio'
import { videoCharacterElementSize } from '../../../../shared/videoStageGeometry'
import type { EvaluatedCharacter, VideoSceneLayer } from '../../../../shared/videoSceneIR'
import { GPU_FACE_PASSES, prepareSavedCharacterRenderer, type GachaFacePass } from '../../characters/characterRenderer'
import type { GachaGpuLayer } from './gachaGpuStage'

type ElementLayer = Extract<VideoSceneLayer, { type: 'element' }>
type Rectangle = Readonly<{ x: number; y: number; width: number; height: number }>
type CompiledPart = Readonly<{ source: HTMLCanvasElement; crop: Rectangle; fullWidth: number; fullHeight: number }>
type CatalogRig = Awaited<ReturnType<typeof prepareSavedCharacterRenderer>>
type RigEntry = { promise: Promise<CatalogRig | null>; rig?: CatalogRig | null }
type FaceEntry = { key: string; state: 'queued' | 'ready' | 'failed'; part?: CompiledPart | null }

/** Read opaque pixels at compilation only, never on every playback frame.
 * Cropping releases transparent texture storage without recoding any PNG. */
export function cropCatalogPart(source: HTMLCanvasElement): CompiledPart | null {
  const { width, height } = source
  if (!width || !height) return null
  let left=width,top=height,right=-1,bottom=-1
  try {
    const context=source.getContext('2d',{willReadFrequently:true})
    if (!context) throw new Error('Contexto de recorte indisponível.')
    const data=context.getImageData(0,0,width,height).data
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      if(data[(y*width+x)*4+3]<=8)continue
      if(x<left)left=x
      if(y<top)top=y
      if(x>right)right=x
      if(y>bottom)bottom=y
    }
    if(right<left||bottom<top)return null
  } catch {
    // SecurityError/taint: leave entire original artwork, never invent crop.
    return { source, crop:{x:0,y:0,width,height},fullWidth:width,fullHeight:height }
  }
  const rect={x:left,y:top,width:right-left+1,height:bottom-top+1}
  if(rect.x===0&&rect.y===0&&rect.width===width&&rect.height===height)
    return {source,crop:rect,fullWidth:width,fullHeight:height}
  const cropped=document.createElement('canvas')
  cropped.width=rect.width;cropped.height=rect.height
  const dest=cropped.getContext('2d')
  if(!dest)throw new Error('Falha na textura recortada do catálogo Gacha.')
  dest.drawImage(source,rect.x,rect.y,rect.width,rect.height,0,0,rect.width,rect.height)
  return {source:cropped,crop:rect,fullWidth:width,fullHeight:height}
}

/** Same painter-space geometry for every independent part, including actor
 * flip and rotation. A left pupil moves without moving its right counterpart. */
export function placeCatalogPart(
  part: CompiledPart, actor: StudioElement
): GachaGpuLayer['element'] {
  const w=videoCharacterElementSize(actor)
  const {crop,fullWidth,fullHeight}=part
  const sx=crop.width/fullWidth,sy=crop.height/fullHeight
  const offX=((crop.x+crop.width/2)/fullWidth-.5)*w.width*(actor.flipX?-1:1)
  const offY=((crop.y+crop.height/2)/fullHeight-.5)*w.height
  const angle=actor.rotation*Math.PI/180
  return {
    x:actor.x+offX*Math.cos(angle)-offY*Math.sin(angle)*1080/1920,
    y:actor.y+offX*Math.sin(angle)*1920/1080+offY*Math.cos(angle),
    width:w.width*sx,height:w.height*sy,
    rotation:actor.rotation,flipX:actor.flipX
  }
}

/** A fine-grained recipe ensures a PT pupil change never invalidates the
 * opposite eye or the prepared body/wardrobe/forehair textures. */
export function catalogFaceRecipe(
  pass: GachaFacePass,
  appearance: CustomizerFaceAppearance | undefined,
  element: StudioElement,
  mode: StudioFaceMode
): string {
  const components=appearance?.components
  const overrides=element.faceTransforms
  if(pass==='pupil-left'||pass==='pupil-right') {
    const side=pass.endsWith('left')?'left':'right'
    const eye=`eye-${side}` as FaceComponentPartId,pupil=`pupil-${side}` as FaceComponentPartId
    return JSON.stringify([pass,mode==='blink',components?.[pupil],components?.[eye],
      overrides?.[`expression-component:${pupil}`],overrides?.[`expression-component:${eye}`],
      appearance?.partColors?.[eye as 'eye-left' | 'eye-right']])
  }
  if(pass==='eye-left'||pass==='eye-right') {
    const side=pass.endsWith('left')?'left':'right'
    return JSON.stringify([pass,mode,components?.[pass],overrides?.[`expression-component:${pass}`],
      side==='left'?appearance?.eyeLeftCatalogId:appearance?.eyeRightCatalogId,
      appearance?.eyeCatalogId,appearance?.eyeState,appearance?.partColors?.[pass]])
  }
  if(pass==='brow-left'||pass==='brow-right')
    return JSON.stringify([pass,appearance?.eyebrows,components?.[pass],
      overrides?.[`expression-component:${pass}`],appearance?.partColors?.[pass]])
  if(pass==='details')return JSON.stringify([pass,appearance?.faceDetails,appearance?.facePalettes,
    appearance?.facePaletteManualRoles])
  if(pass==='extras')return JSON.stringify([pass,appearance?.headExtras])
  if(pass==='effects')return JSON.stringify([pass,element.activeExpressionEffects,
    appearance?.expressionIndex,overrides])
  return JSON.stringify([pass,mode,appearance?.eyeCatalogId,appearance?.eyeLeftCatalogId,
    appearance?.eyeRightCatalogId,appearance?.eyebrowCatalogId,
    appearance?.eyebrowLeftCatalogId,appearance?.eyebrowRightCatalogId,
    appearance?.mouthClosedCatalogId,appearance?.mouthOpenCatalogId,
    appearance?.noseCatalogId,appearance?.noseIndex,appearance?.expressionIndex,
    appearance?.eyeState,appearance?.mouthOpen,appearance?.eyebrows,
    appearance?.transforms,appearance?.partColors,appearance?.components,
    appearance?.noseOpacity,appearance?.noseSkinTone,overrides])
}

function modeAtFrame(actor: EvaluatedCharacter, element: StudioElement): StudioFaceMode {
  if(actor.automaticBlink)return 'blink'
  if(actor.automaticMouth)return actor.automaticMouth.mode
  return element.activeFaceMode??'idle'
}

/**
 * Experimental catalog-to-GPU bridge. The original StudioDocument v1 stays
 * unchanged. Rig preparation and independent face passes run asynchronously
 * and never gate Play: unavailable, old or incomplete catalog states fall back
 * to the exact saved PNG. Only completed recipes enter GPU submission.
 */
export class CatalogGpuCompiler {
  private readonly rigs=new Map<string,RigEntry>()
  private readonly faces=new Map<string,FaceEntry>()
  private readonly queue: Array<() => Promise<void>>=[]
  private inFlight=0
  private disposed=false
  private readonly catalog: Promise<ReadonlyMap<string,CustomizerCharacter>>

  constructor(private readonly ready: () => void) {
    this.catalog=window.desktop.listCustomizerCharacters()
      .then(chars=>new Map(chars.map(c=>[c.id,c])))
      .catch(()=>new Map<string,CustomizerCharacter>())
  }

  private runQueue():void {
    while(!this.disposed&&this.inFlight<2&&this.queue.length) {
      const next=this.queue.shift()!
      ++this.inFlight
      void next().catch(()=>undefined).finally(()=>{
        --this.inFlight
        if(!this.disposed){this.ready();this.runQueue()}
      })
    }
  }

  private rigFor(id:string,pose:number|null|undefined):CatalogRig|null {
    const key=id+':'+String(pose)
    const cached=this.rigs.get(key)
    if(cached)return cached.rig??null
    const entry:RigEntry={promise:this.catalog.then(async characters=>{
      const character=characters.get(id)
      if(!character)return null
      // Local pose selection does not change the saved Customizer character.
      const selected={...character,customization:{...character.customization,poseSlot:pose??character.customization.poseSlot}}
      return prepareSavedCharacterRenderer(selected)
    })}
    this.rigs.set(key,entry)
    void entry.promise.then(rig=>{entry.rig=rig;if(!this.disposed)this.ready()},
      ()=>{entry.rig=null;if(!this.disposed)this.ready()})
    return null
  }

  private faceFor(
    key:string,rig:CatalogRig,pass:GachaFacePass,
    appearance:CustomizerFaceAppearance|undefined,
    element:StudioElement,mode:StudioFaceMode
  ):CompiledPart|null|undefined {
    let entry=this.faces.get(key)
    if(entry) {
      this.faces.delete(key);this.faces.set(key,entry)
      return entry.state==='ready'?entry.part:undefined
    }
    entry={key,state:'queued'}
    this.faces.set(key,entry)
    while(this.faces.size>96)this.faces.delete(this.faces.keys().next().value!)
    const target=entry
    this.queue.push(async()=>{
      try {
        const source=await rig.renderGpuFacePass(pass,appearance,element.faceTransforms,
          element.activeExpressionEffects,mode)
        const cropped=cropCatalogPart(source)
        if(!this.disposed&&this.faces.get(key)===target){target.part=cropped;target.state='ready'}
      }catch {
        if(!this.disposed&&this.faces.get(key)===target)target.state='failed'
      }
    })
    this.runQueue()
    return undefined
  }

  /** Returns null unless a complete, consistent frame of real catalog parts
   * is ready. The caller must keep displaying saved PNGs during compilation. */
  sprites(layer:ElementLayer,actor:EvaluatedCharacter|undefined):GachaGpuLayer[]|null {
    if(this.disposed||layer.kind!=='character'||actor?.transition||!actor?.authoredState)return null
    const element=actor.authoredState.element
    const characterId=element.characterId
    if(!characterId)return null
    const pose=element.poseSlot
    const rig=this.rigFor(characterId,pose)
    if(!rig)return null
    const appearance=element.faceAppearance
    const mode=modeAtFrame(actor,element)
    const sourceParts:Array<{id:string;part:CompiledPart}>=[]
    const staticLayers=rig.gpuStaticLayers
    const base=staticLayers.behindFace
    sourceParts.push({id:'rig-behind-face',part:{
      source:base,crop:{x:0,y:0,width:base.width,height:base.height},fullWidth:base.width,fullHeight:base.height
    }})
    // A matching source revision is mandatory; otherwise keep the PNG instead
    // of presenting a stale or wrong model.
    for(const pass of GPU_FACE_PASSES){
      const recipe=catalogFaceRecipe(pass,appearance,element,mode)
      const key=characterId+':'+String(pose)+':'+pass+':'+recipe
      const part=this.faceFor(key,rig,pass,appearance,element,mode)
      if(part===undefined)return null
      if(part)sourceParts.push({id:'face:'+pass,part})
    }
    if(staticLayers.inFrontOfFace) {
      const front=staticLayers.inFrontOfFace
      sourceParts.push({id:'rig-front',part:{
        source:front,crop:{x:0,y:0,width:front.width,height:front.height},
        fullWidth:front.width,fullHeight:front.height
      }})
    }
    return sourceParts.map(({id,part})=>({
      textureId:'catalog:'+layer.element.id+':'+id,
      source:part.source,
      element:placeCatalogPart(part,layer.element)
    }))
  }

  dispose():void {
    this.disposed=true
    this.queue.length=0
    this.faces.clear()
    this.rigs.clear()
  }
}

import type { FabricatorPose, FabricatorProject, ModelPart, WardrobeSet } from '../../../../../shared/fabricator'
import { selectOriginalModelSource } from '../../../../../shared/fabricatorModelViews'
import { normalizeLayerOrder } from '../models/rig'
import { mapWardrobeComponentToPose, wardrobePosePadding } from '../../../../../shared/wardrobePose'

type Props = { model: FabricatorProject; outfit: WardrobeSet; pose: FabricatorPose }
type DisplayBone = Pick<ModelPart,'x' | 'y' | 'width' | 'height'> & { rotation?: number }
const size = (width: number, height: number) => {
  const scale = Math.min(210 / Math.max(1,width), 160 / Math.max(1,height))
  return {scale,width:width*scale,height:height*scale}
}

/** Both panels use the SAME source frames and shared pose matrix as Customizer. */
export function WardrobeComparisonPreview({model,outfit,pose}:Props) {
  const original=selectOriginalModelSource(model)
  const left=size(original.width,original.height),right=size(pose.width,pose.height)
  const order=normalizeLayerOrder(model.parts,model.layerOrder)
  const poseOrder=normalizeLayerOrder(pose.parts,pose.layerOrder)
  const boneMap=new Map(model.parts.map(part=>[part.id,part]))
  const targetMap=new Map(pose.parts.map(part=>[part.id,part]))
  const stride=outfit.components.length+2
  const baseStyle = (part:DisplayBone,scale:number,zIndex:number)=>({
    position:'absolute' as const,left:part.x*scale,top:part.y*scale,
    width:part.width*scale,height:part.height*scale,zIndex,
    transform:`rotate(${part.rotation ?? 0}deg)`,pointerEvents:'none' as const
  })
  return <section className="wardrobe-comparison" aria-label="Comparação entre original desmontado e pose">
    <header><strong>Conferência lado a lado</strong><small>Prévia informativa · não muda o encaixe salvo</small></header>
    <div style={{display:'flex',gap:12,flexWrap:'wrap',justifyContent:'center'}}>
      <div><small>Original desmontado</small>
        <div style={{position:'relative',width:left.width,height:left.height,background:'var(--preview-background, #ddd)',overflow:'hidden'}}>
          {original.parts.map(part=><img key={part.id} src={part.dataUrl} alt="" draggable={false}
            style={baseStyle(part,left.scale,2+Math.max(0,order.indexOf(part.id))*stride)}/>)}
          {outfit.components.map((piece,index)=><img key={piece.id} src={piece.dataUrl} alt="" draggable={false}
            style={{position:'absolute',left:piece.x*left.scale,top:piece.y*left.scale,
              width:piece.width*left.scale,height:piece.height*left.scale,
              transform:`rotate(${piece.rotation}deg)`,
              zIndex:3+Math.max(0,order.indexOf(piece.attachedPartId))*stride+index,
              pointerEvents:'none'}}/>)}
        </div>
      </div>
      <div><small>{pose.name} · Pose DEV</small>
        <div style={{position:'relative',width:right.width,height:right.height,background:'var(--preview-background, #ddd)',overflow:'hidden'}}>
          {pose.parts.filter(part=>!(pose.hiddenPartIds??[]).includes(part.id)).map(part=><img key={part.id}
            src={part.dataUrl} alt="" draggable={false}
            style={baseStyle(part,right.scale,2+Math.max(0,poseOrder.indexOf(part.id))*stride)}/>)}
          {outfit.components.map((piece,index)=>{
            if(piece.glue?.mode==='loose')return null
            const sourceBone=boneMap.get(piece.attachedPartId),targetBone=targetMap.get(piece.attachedPartId)
            if(!sourceBone || !targetBone)return null
            const {kneeOverlap,edgePadding}=wardrobePosePadding(piece,outfit.components)
            const projected=mapWardrobeComponentToPose(piece,sourceBone,targetBone,kneeOverlap,edgePadding)
            const zIndex=3+Math.max(0,poseOrder.indexOf(piece.attachedPartId))*stride+index
            return <div key={piece.id} style={{position:'absolute',left:projected.origin.x*right.scale,
              top:projected.origin.y*right.scale,width:0,height:0,zIndex,transformOrigin:'0 0',
              transform:projected.matrix,pointerEvents:'none'}}>
              <img src={piece.dataUrl} alt="" draggable={false}
                style={{position:'absolute',left:projected.localLeft*right.scale,
                  top:projected.localTop*right.scale,width:projected.renderWidth*right.scale,
                  height:projected.renderHeight*right.scale,
                  transform:`rotate(${projected.localRotation}deg)`}}/>
            </div>
          })}
        </div>
      </div>
    </div>
    <small className="wardrobe-note">O Customizador usa a mesma projeção relativa. Verifique visualmente costuras, articulações e camadas antes de publicar.</small>
  </section>
}

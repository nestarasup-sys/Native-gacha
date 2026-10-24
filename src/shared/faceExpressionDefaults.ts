import type { FaceCatalogItem, FaceComponentAsset, FaceExpressionSelections, FaceExpressionTransforms, FaceTransform } from './fabricator'

const identity=():FaceTransform=>({x:0,y:0,scaleX:1,scaleY:1,rotation:0})
/** The untouched expression for a NEW set is exactly the Olhos DEV persisted
 * calibration. No legacy expression offset, gaze enforcement or implicit
 * model-relative adjustment is allowed here.
 */
export function faceExpressionDefaults(
  selection:FaceExpressionSelections,
  components:Record<string,FaceComponentAsset>,
  catalogs:Record<string,FaceCatalogItem>
):FaceExpressionTransforms {
  const transforms:FaceExpressionTransforms={
    eyeLeft:identity(),eyeRight:identity(),pupilLeft:identity(),pupilRight:identity(),
    browLeft:identity(),browRight:identity(),nose:identity(),mouth:identity()
  }
  for(const side of ['left','right'] as const){
    const suffix=side==='left'?'Left':'Right'
    const eyeId=selection.eyes[side],pupilId=selection.pupils[side],browId=selection.eyebrows[side]
    if(eyeId && components[eyeId]?.kind==='eye')transforms[`eye${suffix}`]={...components[eyeId].defaultTransform}
    if(pupilId && components[pupilId]?.kind==='pupil')transforms[`pupil${suffix}`]={...components[pupilId].defaultTransform}
    if(browId && components[browId]?.kind==='eyebrow')transforms[`brow${suffix}`]={...components[browId].defaultTransform}
  }
  if(selection.nose){
    const nose=catalogs[selection.nose.catalogId]?.transforms.nose
    if(nose)transforms.nose={...nose}
  }
  if(selection.mouth){
    const mouth=catalogs[selection.mouth.catalogId]?.transforms.mouth
    if(mouth)transforms.mouth={...mouth}
  }
  return transforms
}

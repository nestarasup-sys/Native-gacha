import type { FaceComponentAssetSummary } from './fabricator'

export function isRightFaceAsset(asset: FaceComponentAssetSummary): boolean {
  return asset.rightSidePositioned === true || / · (?:Olho|Olho aberto|Olho fechado|Pupila|Sobrancelha) direit[oa]$/i.test(asset.name)
}

/** Olhos DEV selection identity is local to the user's editor.
 * Using the same key when constructing a NEW Presets DEV set does not modify
 * previously saved expressions or copy their transform deltas.
 */
export const FACE_COMPONENT_SELECTION_STORAGE_KEY='gacha-nymi:face-dev-component-selections'
export const LEGACY_PUPIL_SELECTION_STORAGE_KEY='gacha-nymi:face-dev-pupil-selections'
/** An older Olhos DEV may only have stored pupil side IDs. Read it as a
 * non-destructive fallback; current selections always override it. */
export function savedLegacyPupilParts(raw:string|null,modelSlot:number):SavedFaceSelectionParts {
  if(!raw)return {}
  try{
    const value:unknown=JSON.parse(raw)
    if(!value || typeof value!=='object' || Array.isArray(value))return {}
    const record=(value as Record<string,unknown>)[String(modelSlot)]
    if(!record || typeof record!=='object' || Array.isArray(record))return {}
    const old=record as {left?:unknown;right?:unknown}
    return {
      ...(typeof old.left==='string' ? {'pupil-left':old.left} : {}),
      ...(typeof old.right==='string' ? {'pupil-right':old.right} : {})
    }
  }catch{return {}}
}

export type SavedFaceSelectionParts = Partial<Record<
  'eye-left'|'eye-right'|'pupil-left'|'pupil-right'|'brow-left'|'brow-right',string>>

export function savedFaceLibraryParts(raw: string | null, modelSlot: number): SavedFaceSelectionParts {
  if(!raw)return {}
  try{
    const parsed:unknown=JSON.parse(raw)
    if(!parsed || typeof parsed!=='object' || Array.isArray(parsed))return {}
    const record=(parsed as Record<string,unknown>)[String(modelSlot)]
    if(!record || typeof record!=='object' || Array.isArray(record))return {}
    const parts=(record as {parts?:unknown}).parts
    if(!parts || typeof parts!=='object' || Array.isArray(parts))return {}
    const result:SavedFaceSelectionParts={}
    for(const key of ['eye-left','eye-right','pupil-left','pupil-right','brow-left','brow-right'] as const){
      const id=(parts as Record<string,unknown>)[key]
      if(typeof id==='string' && id.length>0)result[key]=id
    }
    return result
  }catch{return {}}
}
export function pickFaceLibraryBase(
  kind: 'eye'|'pupil'|'eyebrow',side:'left'|'right',preferred:SavedFaceSelectionParts,
  available: readonly FaceComponentAssetSummary[],
  pairedWith?: FaceComponentAssetSummary | null
): FaceComponentAssetSummary | undefined {
  const group=kind==='eyebrow'?'brow':kind
  const preferredId=preferred[`${group}-${side}` as keyof SavedFaceSelectionParts]
  const exact=available.find(item=>item.id===preferredId && item.kind===kind)
  if(exact)return exact
  if(side==='right' && pairedWith){
    const baseName=(name:string)=>String(name ?? '').replace(/\\s*[·-]\\s*(?:Olho(?: aberto| fechado)?|Pupila|Sobrancelha)\\s*(?:esquerd[oa]|direit[oa])$/i,'').trim()
    // Never silently take the first unrelated RIGHT asset. Without an exact
    // saved right selection, prefer the actual pair of the selected left asset.
    const paired=available.find(item=>item.id!==pairedWith.id && item.kind===kind &&
      (item.rightSidePositioned===true || /direit[oa]$/i.test(item.name)) &&
      (Boolean(pairedWith.pairId && item.pairId===pairedWith.pairId) ||
        Boolean(item.name && pairedWith.name && baseName(item.name) && baseName(item.name)===baseName(pairedWith.name))))
    return paired
  }
  return available.find(item=>item.kind===kind && (side==='right' ? item.rightSidePositioned===true : item.rightSidePositioned!==true))
}

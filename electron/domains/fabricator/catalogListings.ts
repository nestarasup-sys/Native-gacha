/** Read-side catalog services for Fabricador faces and hair styles.
 * Legacy hair remains visible as a fallback until the user saves or deletes
 * catalog content. The source workspace and older migrated assets stay intact.
 * File adapter retains existing DomainFileSystem / SQLite behavior.
 */
import { join } from 'node:path'
import type { FaceSetSave, FaceSetSummary, HairStyle, HairStyleSave, HairStyleSummary, HairWorkspace } from '../../../src/shared/fabricator.ts'

type Files = {
  readdir(folder:string,options:{withFileTypes:true}):Promise<Array<{name:string;isDirectory():boolean}>>
  readFile(path:string,encoding:'utf8'):Promise<string>
}
type Deps = {
  files: Files
  validSlot:(slot:number)=>boolean
  faceModelPath:(slot:number)=>string
  hairModelPath:(slot:number)=>string
  validFace:(slot:number, face:FaceSetSave)=>boolean
  validHair:(slot:number, hair:HairStyleSave)=>boolean
  recover:(folder:string, images:string)=>Promise<void>
  readLegacyHair:(slot:number)=>Promise<HairWorkspace|null>
  readLegacyHairCatalogState?:(slot:number)=>Promise<'active'|'dismissed'|null>
}
const missing=(e:unknown)=>(e as NodeJS.ErrnoException)?.code==='ENOENT'
export function legacyHairStyle(slot:number,legacy:HairWorkspace|null):HairStyle|null {
  if(!legacy || !legacy.front && !legacy.back && !legacy.fringe)return null
  const updatedAt=legacy.updatedAt || '1970-01-01T00:00:00.000Z'
  return {schemaVersion:1,id:'legacy-workspace',modelSlot:slot,name:'Cabelo 01',
    front:legacy.front,back:legacy.back,fringe:legacy.fringe,
    transforms:structuredClone(legacy.transforms),createdAt:updatedAt,updatedAt}
}
export function createFabricatorCatalogListings(deps:Deps) {
  async function listFaces(modelSlot:number):Promise<FaceSetSummary[]> {
    if(!deps.validSlot(modelSlot))throw Error('Modelo inválido.')
    let entries:Array<{name:string;isDirectory():boolean}>
    try { entries=await deps.files.readdir(deps.faceModelPath(modelSlot),{withFileTypes:true}) }
    catch(reason){if(missing(reason))return [];throw reason}
    const sets:FaceSetSummary[]=[]
    for(const entry of entries) {
      if(!entry.isDirectory() || !/^set-[a-zA-Z0-9_-]{1,80}$/.test(entry.name))continue
      const folder=join(deps.faceModelPath(modelSlot),entry.name)
      // A damaged journal is never ignored or erased. Do not silently
      // pretend the catalog has been recovered when the journal failed.
      await deps.recover(folder,join(folder,'images'))
      try {
        const face=JSON.parse(await deps.files.readFile(join(folder,'face.json'),'utf8')) as FaceSetSave
        if(deps.validFace(modelSlot,face) && face.id===entry.name.slice(4))
          sets.push({id:face.id,modelSlot,name:face.name,updatedAt:face.updatedAt,pieceCount:face.pieces.length})
      }catch(reason){if(!missing(reason) && !(reason instanceof SyntaxError))throw reason}
    }
    return sets.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))
  }

  async function listHair(modelSlot:number):Promise<HairStyleSummary[]> {
    if(!deps.validSlot(modelSlot))throw Error('Modelo inválido.')
    const stylesFolder=join(deps.hairModelPath(modelSlot),'styles')
    let entries:Awaited<ReturnType<Files['readdir']>>
    try { entries=await deps.files.readdir(stylesFolder,{withFileTypes:true}) }
    catch(reason){if(missing(reason))entries=[];else throw reason}
    const styles:HairStyleSummary[]=[]
    for(const entry of entries) {
      if(!entry.isDirectory() || !/^style-[a-zA-Z0-9_-]{1,80}$/.test(entry.name))continue
      const folder=join(stylesFolder,entry.name)
      await deps.recover(folder,join(folder,'images'))
      try {
        const style=JSON.parse(await deps.files.readFile(join(folder,'hair-style.json'),'utf8')) as HairStyleSave
        if(deps.validHair(modelSlot,style) && style.id===entry.name.slice(6)) styles.push(style)
      }catch(reason){if(!missing(reason) && !(reason instanceof SyntaxError))throw reason}
    }
    const catalogStyles=styles.filter(item=>item.id!=='legacy-workspace')
    const legacyStyle=styles.find(item=>item.id==='legacy-workspace')
    const legacyCatalogState=await deps.readLegacyHairCatalogState?.(modelSlot) ?? null
    if(catalogStyles.length===0 && legacyCatalogState===null) {
      // Preserve an older, physically migrated legacy style when it exists.
      if(legacyStyle) return [legacyStyle]

      // A migration marker means an older build already handled (or the user
      // deleted) the virtual style, so do not recreate it from the workspace.
      let migrated=false
      try { await deps.files.readFile(join(deps.hairModelPath(modelSlot),'hair-style-migration-v1'),'utf8');migrated=true }
      catch(reason){if(!missing(reason))throw reason}
      if(!migrated) {
        const legacy=legacyHairStyle(modelSlot,await deps.readLegacyHair(modelSlot))
        if(legacy) catalogStyles.push(legacy)
      }
    }
    return catalogStyles.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))
  }
  return {listFaces,listHair}
}

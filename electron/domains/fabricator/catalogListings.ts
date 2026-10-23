/** Read-side catalog services for Fabricador faces and hair styles.
 * No implicit legacy-hair migration: older workspaces are exposed virtually
 * until the user explicitly chooses to save a modern hair style.
 * File adapter retains existing DomainFileSystem / SQLite behavior.
 */
import { join } from 'node:path'
import type * as nodeFs from 'node:fs/promises'
import type { FaceSetSave, FaceSetSummary, HairStyle, HairStyleSave, HairStyleSummary, HairWorkspace } from '../../../src/shared/fabricator.ts'

type Files = Pick<typeof nodeFs,'readdir' | 'readFile'>
type Deps = {
  files: Files
  validSlot:(slot:number)=>boolean
  faceModelPath:(slot:number)=>string
  hairModelPath:(slot:number)=>string
  validFace:(slot:number, face:FaceSetSave)=>boolean
  validHair:(slot:number, hair:HairStyleSave)=>boolean
  recover:(folder:string, images:string)=>Promise<void>
  readLegacyHair:(slot:number)=>Promise<HairWorkspace|null>
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
    let entries:Awaited<ReturnType<Files['readdir']>>
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
    catch(reason){if(missing(reason))entries=[] as unknown as typeof entries;else throw reason}
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
    // Before this fix a LIST call silently copied a full legacy workspace,
    // wrote a new PNG library, and created hair-style-migration-v1. That made
    // read-only browsing mutate personal assets. Keep this as a virtual style
    // while its source workspace continues to exist.
    if(!styles.some(item=>item.id==='legacy-workspace')) {
      const legacy=legacyHairStyle(modelSlot,await deps.readLegacyHair(modelSlot))
      if(legacy) styles.push(legacy)
    }
    return styles.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))
  }
  return {listFaces,listHair}
}

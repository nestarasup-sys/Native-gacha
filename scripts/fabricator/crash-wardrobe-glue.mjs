/** Synthetic-only subprocess: exits during the first PNG write, AFTER journal commit. */
import * as fs from 'node:fs/promises'
import { join } from 'node:path'
import { runCatalogImageTransaction } from '../../electron/domains/fabricator/catalogImageTransaction.ts'

const folder=process.argv[2]
if(!folder || !folder.includes('native-glue-crash-'))throw Error('Crash test may only touch its isolated temporary fixture')
const images=[{id:'right',bytes:Buffer.from('NEW_RIGHT')},{id:'left',bytes:Buffer.from('NEW_LEFT')}]
const manifest={schemaVersion:1,id:'glue',modelSlot:1,components:[
  {id:'right',glue:{version:1,mode:'fixed'},binding:{boneId:'arm-right'}},
  {id:'left',glue:{version:1,mode:'fixed'},binding:{boneId:'arm-left'}}
]}
await runCatalogImageTransaction({
  files:fs,folder,imageFolder:join(folder,'parts'),manifestName:'wardrobe.json',
  manifest,images,writeImage:async (path,bytes)=>{
    await fs.writeFile(path,bytes)
    process.exit(94)
  },
  promoteManifest:async()=>fs.writeFile(join(folder,'wardrobe.json'),JSON.stringify(manifest))
})
throw Error('Crash injection was not reached')

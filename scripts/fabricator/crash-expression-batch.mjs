/** Isolated child process used only by the expression transaction crash test. */
import * as fs from 'node:fs/promises'
import { join } from 'node:path'
import { createExpressionBatchTransaction } from '../../electron/domains/fabricator/expressionBatchTransaction.ts'

const root=process.argv[2]
if(!root || !root.includes('native-expression-crash-'))throw Error('Crash fixture must be an isolated temporary directory.')
const modelFolder=slot=>join(root,`model-${slot}`)
const presetPath=(slot,id)=>join(modelFolder(slot),`preset-${id}.json`)
let renames=0
const faulty={...fs,rename:async(source,target)=>{
  await fs.rename(source,target)
  if(String(source).endsWith('.batch-next.tmp') && ++renames===6)process.exit(96)
}}
const transaction=createExpressionBatchTransaction({
  files:faulty,modelFolder,presetPath,
  validModelSlot:slot=>slot===1,
  validPreset:(slot,preset)=>preset.modelSlot===slot && preset.schemaVersion===1
})
const presets=Array.from({length:21},(_,i)=>({
  schemaVersion:1,modelSlot:1,id:`p${i}`,name:`Expressão ${i}`,
  collectionId:'standard',expressionIndex:i,selections:{},transforms:{},
  noseOpacity:1,updatedAt:'new'
}))
await transaction.save(1,presets)
throw Error('Simulated crash was not reached.')

#!/usr/bin/env node
'use strict'
/** Read-only public repository audit for G-V5 source import.
 * Cannot certify copyright or the provenance of an unavailable original ZIP.
 * Never checks out, unpacks, repairs, deletes, stages or pushes any files.
 */
const { execFileSync } = require('node:child_process')
const { createReadStream } = require('node:fs')
const { createHash } = require('node:crypto')
const { basename } = require('node:path')
const { pathToFileURL } = require('node:url')

const ORIGINAL_ZIP = 'G-V5-evolucao-estrutural-2026-10-22.zip'
const ORIGINAL_SHA256 = 'e0c0f8f5c8013b9866b45ac395fa59a58c59046a3727bfa6ec16c215e1cfffcd'
const required = [
  'package.json','package-lock.json','tsconfig.json',
  'electron/main.ts','electron/preload.ts','src/shared/fabricator.ts',
  'src/shared/customizer.ts','src/shared/studio.ts',
  'src/renderer/src/features/fabricator/FabricatorPage.tsx',
  'src/renderer/src/features/customizer/CustomizerPage.tsx',
  'src/renderer/src/features/studio/StudioPage.tsx',
  'tests/fabricator-customizer-studio-continuity.test.mjs'
]
const forbidden = [
  /(^|\/)node_modules\//i,
  /(^|\/)(?:app-data|userData|profile|profiles|personal|backups|backup)\//i,
  /(^|\/)\.env(?:\.|$)/i,
  /(?:^|\/)(?:\.npmrc|id_rsa|id_ed25519|credentials\.json|service-account\.json|\.DS_Store)$/i,
  /\.(?:sqlite|sqlite-shm|sqlite-wal|db|db-wal|db-shm|p12|pfx|pem|key)$/i,
  /(?:^|\/)G-V5-evolucao-estrutural-2026-10-22\.zip$/i
]
function assessTrackedPaths(paths) {
  const tracked = new Set(paths.map(p => p.replace(/\\/g,'/')))
  const missing = required.filter(p=>!tracked.has(p))
  const unsafe = [...tracked].filter(p=>forbidden.some(pattern=>pattern.test(p))).sort()
  return {sourceFiles:tracked.size,missing,unsafe,passed:missing.length===0 && unsafe.length===0}
}
function trackedPaths(cwd=process.cwd()) {
  const out=execFileSync('git',['ls-files','-z'],{cwd,encoding:'buffer'})
  return out.toString('utf8').split('\0').filter(Boolean)
}
async function hashZip(zip) {
  const hash=createHash('sha256')
  for await (const chunk of createReadStream(zip))hash.update(chunk)
  return hash.digest('hex')
}
async function audit({cwd=process.cwd(),zip=null}={}) {
  const tracked=assessTrackedPaths(trackedPaths(cwd))
  const zipCheck=zip ? {
    provided:true,name:basename(zip),
    sha256:await hashZip(zip)
  } : {provided:false}
  if (zipCheck.provided) {
    zipCheck.expectedSha256=ORIGINAL_SHA256
    zipCheck.matchesOriginal=zipCheck.sha256===ORIGINAL_SHA256
    zipCheck.originalNameMatches=zipCheck.name===ORIGINAL_ZIP
  }
  return {kind:'gv5-readonly-import-audit',tracked,originalZip:zipCheck,
    originalZipNotAvailable:!zipCheck.provided,
    // Missing ZIP is a REVIEW BLOCKER, never silently reported as verified.
    passed:tracked.passed && (!zipCheck.provided || zipCheck.matchesOriginal && zipCheck.originalNameMatches),
    fullyVerified:tracked.passed && zipCheck.provided && zipCheck.matchesOriginal && zipCheck.originalNameMatches}
}
if(require.main===module){
  audit({zip:process.argv[2]||null}).then(report=>{
    console.log(JSON.stringify(report,null,2))
    if(!report.passed)process.exitCode=1
  }).catch(error=>{console.error(error.message);process.exitCode=1})
}
module.exports={ORIGINAL_ZIP,ORIGINAL_SHA256,required,assessTrackedPaths,trackedPaths,hashZip,audit}

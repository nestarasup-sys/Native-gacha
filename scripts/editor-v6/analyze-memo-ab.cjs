const fs = require('node:fs/promises')
const path = require('node:path')
const sharp = require('sharp')

const root = path.resolve(__dirname, '../..')
const inputRoot = path.join(root, 'out', 'editor-v6-stress', 'ab-memo')
const outputRoot = path.join(root, 'docs', 'editor-v6', 'benchmarks')
const labels = ['A1', 'B1', 'B2', 'A2', 'A3', 'B3']

function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))] : null
}

function summarize(values) {
  const sorted = [...values].sort((a, b) => a - b)
  return { median:+percentile(sorted, .5).toFixed(3), min:+sorted[0].toFixed(3), max:+sorted.at(-1).toFixed(3), rounds:sorted.length }
}

async function loadRun(label) {
  const variant = label[0] === 'A' ? 'memo-on' : 'memo-off'
  const file = path.join(inputRoot, `heavy-${variant}-${label}.json`)
  const report = JSON.parse(await fs.readFile(file, 'utf8'))
  const m = report.measurements?.[0]
  if (!m || m.key !== 'heavy' || m.elapsedMs < 29_000 || m.memoizationEnabled !== (variant === 'memo-on')) throw new Error(`Rodada ${label} inválida/incompleta.`)
  const page = m.react?.find((item) => item.route === '/editor-v6')
  const surface = m.react?.find((item) => item.route === '/editor-v6/surface')
  const scene = m.react?.find((item) => item.route === '/editor-v6/scene')
  const timeline = m.react?.find((item) => item.route === '/editor-v6/timeline')
  const frameGaps = m.rafIntervals.map((item) => item.durationMs)
  return {
    label, memoization:variant === 'memo-on' ? 'on' : 'off', elapsedMs:m.elapsedMs,
    rafMs:{p50:m.p50FrameMs,p95:m.p95FrameMs,p99:m.p99FrameMs,max:m.worstFrameMs},
    rafIntervalsOver33ms:frameGaps.filter((ms)=>ms>33.34).length,
    rafIntervalsOver50ms:frameGaps.filter((ms)=>ms>50).length,
    rafIntervalsOver66_7ms:frameGaps.filter((ms)=>ms>66.7).length,
    pageCommits:page?.commits??null,pageCommitCumulativeMs:+(page?.commitSamples??[]).reduce((sum,item)=>sum+item.actualDuration,0).toFixed(3),
    pageCommitP95Ms:page?.p95CommitMs??null,pageCommitWorstMs:page?.worstCommitMs??null,
    surfaceCommits:surface?.commits??null,surfaceCommitCumulativeMs:+(surface?.commitSamples??[]).reduce((sum,item)=>sum+item.actualDuration,0).toFixed(3),surfaceCommitP95Ms:surface?.p95CommitMs??null,surfaceCommitWorstMs:surface?.worstCommitMs??null,
    sceneCommitCumulativeMs:+(scene?.commitSamples??[]).reduce((sum,item)=>sum+item.actualDuration,0).toFixed(3),
    timelineCommitCumulativeMs:+(timeline?.commitSamples??[]).reduce((sum,item)=>sum+item.actualDuration,0).toFixed(3),
    longTasks:page?.longTasks??0,longTaskMs:page?.longTaskMs??0,
    logicalFrames:page?.playback?.logicalFrameUpdates??null,logicalSkippedFrames:page?.playback?.logicalFrameGaps?.reduce((sum,item)=>sum+item.skipped,0)??null,
    heapPeakMB:+(m.jsHeapPeakBytes/1024/1024).toFixed(2),
    motionWindowReached:(m.motionNamesObserved?.length??0)===4,motionNames:m.motionNamesObserved?.length??0,pageErrors:m.pageErrors.length,
    sceneScreenshotPath:m.sceneScreenshotPath,
    runtime:{userAgent:m.runtimeConfig?.userAgent,hardwareConcurrency:m.runtimeConfig?.hardwareConcurrency,deviceMemory:m.runtimeConfig?.deviceMemory,viewport:m.runtimeConfig?.viewport,screen:m.runtimeConfig?.screen}
  }
}

async function compareImages(leftPath, rightPath) {
  const left = await sharp(leftPath).ensureAlpha().raw().toBuffer({ resolveWithObject:true })
  const right = await sharp(rightPath).ensureAlpha().raw().toBuffer({ resolveWithObject:true })
  if (left.info.width !== right.info.width || left.info.height !== right.info.height) return { equalDimensions:false, left:{width:left.info.width,height:left.info.height},right:{width:right.info.width,height:right.info.height},differentPixelChannels:null,meanAbsoluteChannelError:null }
  let differentPixelChannels = 0, sum = 0
  for (let i=0;i<left.data.length;i++) { const delta=Math.abs(left.data[i]-right.data[i]);sum+=delta;if(delta!==0)differentPixelChannels++ }
  return { equalDimensions:true,width:left.info.width,height:left.info.height,differentPixelChannels,meanAbsoluteChannelError:+(sum/left.data.length).toFixed(6) }
}

async function main() {
  const runs = []
  for (const label of labels) runs.push(await loadRun(label))
  const pairs=[]
  for (let i=1;i<=3;i++) {
    const on=runs.find((run)=>run.label===`A${i}`),off=runs.find((run)=>run.label===`B${i}`)
    const visual=await compareImages(on.sceneScreenshotPath,off.sceneScreenshotPath)
    pairs.push({pair:i,memoOn:on.label,memoOff:off.label,scenePixelComparison:visual})
  }
  const groups={memoOn:runs.filter((run)=>run.memoization==='on'),memoOff:runs.filter((run)=>run.memoization==='off')}
  const fields=['rafMs.p95','rafMs.p99','rafMs.max','rafIntervalsOver33ms','rafIntervalsOver50ms','rafIntervalsOver66_7ms','pageCommits','pageCommitCumulativeMs','surfaceCommits','surfaceCommitCumulativeMs','surfaceCommitWorstMs','longTasks','longTaskMs','logicalSkippedFrames','heapPeakMB']
  const value=(run,key)=>key.split('.').reduce((item,part)=>item?.[part],run)
  const summary={}
  for(const variant of Object.keys(groups)) {
    summary[variant]={rounds:groups[variant].length,metrics:{}}
    for(const field of fields)summary[variant].metrics[field]=summarize(groups[variant].map((run)=>value(run,field)))
  }
  const publicRuns=runs.map(({sceneScreenshotPath,...run})=>run)
  let host=null
  try { host=JSON.parse(await fs.readFile(path.join(inputRoot,'environment.json'),'utf8')) } catch {}
  const result={schemaVersion:1,date:'2026-10-26',scenario:'heavy',durationPerRoundMs:30000,warmupMs:2000,tracingDuringBenchmark:false,variants:{memoOn:'SceneLayer memo comparator active',memoOff:'same build; memo comparator returns false to force renders'},order:labels.map((label)=>runs.find((run)=>run.label===label).memoization),environment:{...runs[0].runtime,host},rounds:publicRuns,pairs,summary,interpretation:'Compare medians and ranges. Three rounds are small-sample exploratory evidence; differences overlapping ranges are not established improvements. The disabled variant uses the same binary and adds comparator dispatch, so it approximates the pre-memo rendering behavior rather than reconstructing the exact older commit.'}
  await fs.mkdir(outputRoot,{recursive:true})
  await fs.writeFile(path.join(outputRoot,'AB_MEMO_2026-10-26.json'),JSON.stringify(result,null,2),'utf8')
  const table=fields.map((field)=>`| ${field} | ${summary.memoOn.metrics[field].median} (${summary.memoOn.metrics[field].min}–${summary.memoOn.metrics[field].max}) | ${summary.memoOff.metrics[field].median} (${summary.memoOff.metrics[field].min}–${summary.memoOff.metrics[field].max}) |`).join('\n')
  const visual=pairs.map((pair)=>`| ${pair.pair} | ${pair.scenePixelComparison.equalDimensions ? `${pair.scenePixelComparison.width}×${pair.scenePixelComparison.height}` : 'different dimensions'} | ${pair.scenePixelComparison.differentPixelChannels} | ${pair.scenePixelComparison.meanAbsoluteChannelError} |`).join('\n')
  const markdown=`# A/B da memoização do Editor V6\n\nData: 26/10/2026 · cenário pesado · três rodadas de 30 s por variante · aquecimento prévio de 2 s · sem tracing CDP durante medição. As variantes foram intercaladas A1/B1/B2/A2/A3/B3.\n\nA variante desligada usa o mesmo build e força o comparator do React a sempre solicitar nova renderização das camadas. É aproximação reprodutível do comportamento anterior à memoização; mede ainda o custo mínimo de chamar esse comparator.\n\n| Métrica | Memo ligada: mediana (mín–máx) | Memo desligada: mediana (mín–máx) |\n| --- | ---: | ---: |\n${table}\n\n## Correção visual\n\n| Par | Dimensão da cena | Canais de pixel diferentes | Erro absoluto médio |\n| --- | --- | ---: | ---: |\n${visual}\n\nTrês pares compararam a captura da cena na mesma configuração. O resultado pixel a pixel mostra se desligar a memoização alterou a imagem; não mede apresentação física do compositor. Consulte o JSON para os valores individuais, ambiente e intervalo de cada rodada. As amostras são poucas: diferenças cujas faixas se sobrepõem não demonstram ganho.\n`
  await fs.writeFile(path.join(outputRoot,'AB_MEMO_2026-10-26.md'),markdown,'utf8')
  console.log(`A/B concluído: ${runs.length} rodadas; comparação visual ${pairs.map((pair)=>pair.scenePixelComparison.differentPixelChannels).join(', ')} canais diferentes; JSON e Markdown em docs/editor-v6/benchmarks.`)
}

main().catch((error)=>{console.error(error);process.exitCode=1})

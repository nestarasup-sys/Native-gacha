/**
 * Validate the integrity of the synthetic lab output. This is deliberately
 * independent of the Windows runner PowerShell summary formatting.
 */
const fs = require('node:fs')
const path = require('node:path')
const root = path.resolve(process.argv[2] || 'out/zona-guerra-lab')
const rounds = Number(process.argv[3] || process.env.LAB_ROUNDS || 3)
const expected = ['motion', 'r37-pixel', 'r36-paint', 'motion-service', 'overlay-parity']
const problems = []
const summaryPath = path.join(root, 'summary.json')
let summary
try {
  summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8').replace(/^\uFEFF/, ''))
} catch (error) {
  console.error('Missing or unreadable summary.json:', error.message)
  process.exit(1)
}
if (!Array.isArray(summary)) problems.push('summary is not an array')
else {
  for (let round = 1; round <= rounds; round++) {
    for (const check of expected) {
      const entries = summary.filter(x => x.round === round && x.check === check)
      if (entries.length !== 1) problems.push(`round ${round} / ${check}: expected one entry, got ${entries.length}`)
      for (const entry of entries) {
        if (!Number.isFinite(entry.seconds) || entry.seconds < 0) problems.push(`invalid duration: ${check}`)
        if (entry.exitCode !== 0) problems.push(`failed check: round ${round} / ${check} (exit ${entry.exitCode})`)
      }
    }
    const folder = path.join(root, 'round-' + round)
    const r37 = path.join(folder, 'editor-v6-r37-pixel', 'result.json')
    const r36 = path.join(folder, 'editor-v6-r36-paint', 'result.json')
    try {
      const value = JSON.parse(fs.readFileSync(r37, 'utf8'))
      if (value.frames !== 309 || value.exportReady !== false || value.passed !== true || value.scope !== 'plain-parts-only' ||
        value.layered?.passed !== true || value.layered?.frames !== 30 ||
        value.layered?.decodedSources !== 5 || value.layered?.scope !== 'precomposed-layers-only' ||
        value.layered?.exportReady !== false) {
        problems.push(`R37: incomplete or misleading result in round ${round}`)
      }
      for (const capture of ['first.png', 'last.png']) {
        if (!fs.existsSync(path.join(path.dirname(r37), capture))) problems.push(`R37: missing ${capture} in round ${round}`)
      }
    } catch (error) { problems.push(`R37: missing report in round ${round}: ${error.message}`) }
    try {
      const value = JSON.parse(fs.readFileSync(r36, 'utf8'))
      // R36 is an experimental negative-control probe: validating its output
      // is mandatory, but exact equality is NOT expected or production-safe.
      if (value.frames !== 7 || value.productionEnabled !== false ||
        value.experimental !== true || value.resultKind !== 'research-only' ||
        value.productionParityProven !== false ||
        !Number.isSafeInteger(value.exactMatches) || !Number.isSafeInteger(value.mismatches) ||
        value.exactMatches + value.mismatches !== 7 || typeof value.strictParityPassed !== 'boolean' ||
        !Array.isArray(value.results) || value.results.length !== 7 ||
        value.results.some((item, i) => item.token !== i + 1 || typeof item.tokenAtPaint !== 'string' ||
          typeof item.byteEqual !== 'boolean' || !Number.isFinite(item.paintMs) ||
          !Number.isFinite(item.captureMs) || item.width <= 0 || item.height <= 0 ||
          (item.paintBitmapToken !== null && !Number.isSafeInteger(item.paintBitmapToken)) ||
          (item.captureBitmapToken !== null && !Number.isSafeInteger(item.captureBitmapToken)) ||
          (item.differentScenePixels !== null && (!Number.isSafeInteger(item.differentScenePixels) ||
            item.differentScenePixels < 0 || item.differentScenePixels > item.scenePixels)) ||
          item.scenePixels !== 256 * 256 ||
          (item.byteEqual !== (item.differentScenePixels === 0))) ||
        (value.strictParityPassed && (value.mismatches !== 0 || value.results.some(x =>
          x.tokenAtPaint !== String(x.token) || x.paintBitmapToken !== x.token ||
          x.captureBitmapToken !== x.token)))) {
        problems.push(`R36: incomplete or contradictory research report in round ${round}`)
      }
    } catch (error) { problems.push(`R36: missing report in round ${round}: ${error.message}`) }
  }
  if (summary.length !== rounds * expected.length) problems.push('unexpected summary count')
}
const report = { passed: problems.length === 0, rounds, checksPerRound: expected.length, problems,
  r36ResearchOnly: true, r36ParityProven: false, productionParityProven: false, real309FrameBenchmarkProven: false }
fs.writeFileSync(path.join(root, 'verification.json'), JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
if (problems.length) process.exitCode = 1

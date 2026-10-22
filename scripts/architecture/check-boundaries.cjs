#!/usr/bin/env node
'use strict'
/** AST gate de dependências: impede novas ligações entre funcionalidades do renderer. */
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const root = path.resolve(__dirname, '../..')
const baselineFile = path.join(__dirname, 'boundaries-baseline.json')
const sourceRoots = ['electron', 'src/shared', 'src/renderer/src']

function listSources(folder) {
  if (!fs.existsSync(folder)) return []
  return fs.readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const candidate = path.join(folder, entry.name)
    return entry.isDirectory() ? listSources(candidate) : /\.(tsx?|mts|cts)$/.test(entry.name) && !/\.d\.(?:ts|mts|cts)$/.test(entry.name) ? [candidate] : []
  })
}
function normalized(file) { return path.relative(root, file).split(path.sep).join('/') }
function domain(file) {
  const match = /^src\/renderer\/src\/features\/([^/]+)\//.exec(file)
  return match ? match[1] : null
}
function isRuntimeImport(node) {
  if (ts.isImportDeclaration(node)) {
    if (node.importClause?.isTypeOnly) return false
    const clause = node.importClause
    if (clause && !clause.name && clause.namedBindings && ts.isNamedImports(clause.namedBindings)
      && clause.namedBindings.elements.length > 0 && clause.namedBindings.elements.every((element) => element.isTypeOnly)) return false
    return true
  }
  if (ts.isExportDeclaration(node)) return !node.isTypeOnly
  return ts.isCallExpression(node)
    && node.arguments.length > 0
    && (node.expression.kind === ts.SyntaxKind.ImportKeyword
      || ts.isIdentifier(node.expression) && node.expression.text === 'require')
}
function importsIn(file) {
  const text = fs.readFileSync(file, 'utf8')
  const tree = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const found = []
  const visit = (node) => {
    if (isRuntimeImport(node)) {
      const candidate = (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) ? node.moduleSpecifier : node.arguments[0]
      if (candidate && ts.isStringLiteral(candidate)) found.push({ target: candidate.text, line: tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1 })
    }
    ts.forEachChild(node, visit)
  }
  visit(tree)
  return found
}
function scan() {
  const cross = {}
  const hard = []
  const edges = []
  for (const file of sourceRoots.flatMap((part) => listSources(path.join(root, part)))) {
    const from = normalized(file)
    for (const item of importsIn(file)) {
      const dep = item.target
      const resolved = dep.startsWith('.') ? normalized(path.resolve(path.dirname(file), dep)) : dep
      const fromFeature = domain(from)
      const toFeature = domain(resolved)
      const edge = { from, to: resolved, line: item.line }
      if (fromFeature && toFeature && fromFeature !== toFeature) {
        const key = `${fromFeature} -> ${toFeature}`
        cross[key] = (cross[key] ?? 0) + 1
        edges.push({ ...edge, key })
      }
      if (from.startsWith('src/shared/') && (resolved.startsWith('electron/') || resolved.startsWith('src/renderer/'))) hard.push({ ...edge, reason: 'shared depende de infraestrutura/interface' })
      if (from.startsWith('src/renderer/') && (resolved.startsWith('electron/') || dep.startsWith('node:') || /^(fs|path|crypto|child_process|os|electron)(\/|$)/.test(dep))) hard.push({ ...edge, reason: 'renderer importa capacidade nativa' })
      if (from.startsWith('electron/domains/') && resolved.startsWith('src/renderer/')) hard.push({ ...edge, reason: 'domínio do backend importa interface' })
    }
  }
  return { cross: Object.fromEntries(Object.entries(cross).sort()), hard, edges }
}
const result = scan()
const wantBaseline = process.argv.includes('--write-baseline')
const baseline = wantBaseline ? null : JSON.parse(fs.readFileSync(baselineFile, 'utf8'))
if (wantBaseline) {
  fs.writeFileSync(baselineFile, `${JSON.stringify({ schemaVersion: 1, description: 'Teto temporário para acoplamentos legados; reduzir, jamais aumentar.', crossFeatureRuntimeImports: result.cross }, null, 2)}\n`)
  console.log(`Baseline gravada: ${Object.values(result.cross).reduce((a, b) => a + b, 0)} imports entre features, ${result.hard.length} violações estritas.`)
} else {
  const additions = Object.entries(result.cross).filter(([key, count]) => count > (baseline.crossFeatureRuntimeImports[key] ?? 0))
  console.log(`Verificação: ${Object.values(result.cross).reduce((a, b) => a + b, 0)} imports runtime entre features, ${result.hard.length} violações estritas.`)
  for (const [key, count] of Object.entries(result.cross)) console.log(`  ${key}: ${count} / teto ${baseline.crossFeatureRuntimeImports[key] ?? 0}`)
  for (const [key, count] of additions) console.error(`NOVO ACOPLAMENTO: ${key} = ${count}; teto = ${baseline.crossFeatureRuntimeImports[key] ?? 0}`)
  for (const item of result.hard) console.error(`FRONTEIRA PROIBIDA: ${item.from}:${item.line} -> ${item.to} (${item.reason})`)
  if (additions.length || result.hard.length) process.exitCode = 1
  else console.log('PASS: nenhuma nova dependência entre features e nenhuma fronteira proibida.')
}

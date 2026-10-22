#!/usr/bin/env node
'use strict'
/** Detecta imports locais quebrados sem iniciar Electron ou acessar userData.
 * Importações de pacotes externos são resolvidas no build (npm ci).
 */
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const root = path.resolve(__dirname, '../..')
const roots = ['electron', 'src/shared', 'src/renderer/src']
const suffixes = ['', '.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs', '.json', '.png', '.jpg', '.jpeg', '.webp', '.svg', '.css', '.wasm']
const indices = ['index.ts', 'index.tsx', 'index.mjs', 'index.js', 'index.json']
function sources(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name)
    return entry.isDirectory() ? sources(file) : /\.(?:tsx?|mts|cts)$/.test(entry.name) && !/\.d\.(?:ts|mts|cts)$/.test(entry.name) ? [file] : []
  })
}
function relativeImports(file) {
  const code = fs.readFileSync(file, 'utf8')
  const tree = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const results = []
  const visit = (node) => {
    let argument = null
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) argument = node.moduleSpecifier
    if (ts.isCallExpression(node) && node.arguments.length &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword || ts.isIdentifier(node.expression) && node.expression.text === 'require')) argument = node.arguments[0]
    if (argument && ts.isStringLiteral(argument) && argument.text.startsWith('.')) {
      const relativePath = argument.text.split('?')[0].split('#')[0]
      const target = path.resolve(path.dirname(file), relativePath)
      const found = suffixes.some(suffix => fs.existsSync(target + suffix) && fs.statSync(target + suffix).isFile())
        || indices.some(index => fs.existsSync(path.join(target, index)))
      if (!found) results.push({ file: path.relative(root, file), line: tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1, import: argument.text })
    }
    ts.forEachChild(node, visit)
  }
  visit(tree)
  return results
}
const broken = roots.flatMap(part => sources(path.join(root, part))).flatMap(relativeImports)
for (const item of broken) console.error(`IMPORT AUSENTE: ${item.file}:${item.line} -> ${item.import}`)
console.log(`Resolução de imports locais: ${broken.length} referências ausentes.`)
if (broken.length) process.exitCode = 1

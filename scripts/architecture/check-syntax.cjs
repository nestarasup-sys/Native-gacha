#!/usr/bin/env node
'use strict'
/** Validação sintática de TS/TSX sem executar a aplicação ou acessar dados pessoais. */
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const root = path.resolve(__dirname, '../..')
function sources(folder) {
  return fs.readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const filename = path.join(folder, entry.name)
    return entry.isDirectory() ? sources(filename) : /\.(tsx?|mts|cts)$/.test(entry.name) && !/\.d\.(?:ts|cts|mts)$/.test(entry.name) ? [filename] : []
  })
}
let failures = 0
const files = ['electron', 'src/shared', 'src/renderer/src'].flatMap((dir) => sources(path.join(root, dir)))
files.push(path.join(root, 'electron.vite.config.ts'))
for (const file of files) {
  const tree = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  for (const diagnostic of tree.parseDiagnostics) {
    const location = tree.getLineAndCharacterOfPosition(diagnostic.start ?? 0)
    console.error(`${path.relative(root, file)}:${location.line + 1}:${location.character + 1} ${ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')}`)
    failures += 1
  }
}
console.log(`Sintaxe: ${files.length} arquivos TS/TSX inspecionados; ${failures} erros.`)
if (failures) process.exitCode = 1

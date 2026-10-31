'use strict';
// Detect broken relative Markdown links without installing dependencies.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const files = [];
const failures = [];
function scan(relative) {
  const absolute = path.join(root, relative);
  if (!fs.existsSync(absolute)) return;
  const stat = fs.lstatSync(absolute);
  if (stat.isSymbolicLink()) return;
  if (stat.isFile()) {
    if (relative.endsWith('.md')) files.push(relative);
    return;
  }
  if (!stat.isDirectory()) return;
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    if (entry.isFile() || entry.isDirectory()) scan(path.posix.join(relative, entry.name));
  }
}
function validate(file, line, raw) {
  let dest = raw.trim().replace(/^<|>$/g, '');
  if (!dest || dest.startsWith('#') || dest.startsWith('//') || /^[a-z][a-z0-9+.-]*:/i.test(dest)) return;
  dest = dest.split(/[?#]/, 1)[0];
  if (!dest) return;
  try { dest = decodeURIComponent(dest); }
  catch { failures.push(file + ':' + line + ': URL malformada: ' + raw); return; }
  const absolute = dest.startsWith('/')
    ? path.resolve(root, '.' + dest)
    : path.resolve(root, path.dirname(file), dest);
  const relative = path.relative(root, absolute);
  if (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) {
    failures.push(file + ':' + line + ': caminho fora do repositório: ' + raw);
  } else if (!fs.existsSync(absolute)) {
    failures.push(file + ':' + line + ': link inexistente: ' + raw);
  }
}
for (const start of ['README.md', 'AGENTS.md', 'docs', '.ai']) scan(start);
for (const file of files) {
  const lines = fs.readFileSync(path.join(root, file), 'utf8').split(/\r?\n/);
  let fence = null;
  let minimum = 0;
  lines.forEach((line, index) => {
    const delimiter = line.match(/^\s{0,3}(\x60{3,}|~{3,})/);
    if (delimiter) {
      const char = delimiter[1][0];
      if (!fence) { fence = char; minimum = delimiter[1].length; }
      else if (char === fence && delimiter[1].length >= minimum) { fence = null; minimum = 0; }
      return;
    }
    if (fence) return;
    const prose = line.replace(/\x60[^\x60]*\x60/g, '');
    for (const link of prose.matchAll(/!?\[[^\]]*\]\(\s*(<[^>]+>|[^\s)]+)(?:\s+["'][^"']*["'])?\s*\)/g)) {
      validate(file, index + 1, link[1]);
    }
    const reference = prose.match(/^\s{0,3}\[[^\]]+\]:\s*(<[^>]+>|\S+)/);
    if (reference) validate(file, index + 1, reference[1]);
  });
}
if (failures.length) {
  for (const failure of failures) console.error(failure);
  console.error('Falha: ' + failures.length + ' link(s) interno(s) inválido(s).');
  process.exitCode = 1;
} else {
  console.log('OK: ' + files.length + ' arquivos Markdown verificados.');
}

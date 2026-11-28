const { execFileSync } = require('node:child_process')
const { extname } = require('node:path')
const prettier = require('prettier')

const supportedExtensions = new Set([
  '.cjs',
  '.css',
  '.html',
  '.js',
  '.json',
  '.md',
  '.mjs',
  '.ts',
  '.tsx',
  '.yaml',
  '.yml'
])
const trackedChanges = execFileSync('git', ['diff', '--name-only', '--diff-filter=ACMRT'], { encoding: 'utf8' })
const newFiles = execFileSync('git', ['ls-files', '--others', '--exclude-standard'], { encoding: 'utf8' })
const files = [...new Set(`${trackedChanges}\n${newFiles}`.split(/\r?\n/))].filter(
  (file) => file && supportedExtensions.has(extname(file))
)

if (!files.length) {
  process.stdout.write('Nenhum arquivo alterado compatível com Prettier.\n')
  process.exit(0)
}

execFileSync(process.execPath, [require.resolve('prettier/bin/prettier.cjs'), '--write', ...files], {
  stdio: 'inherit'
})

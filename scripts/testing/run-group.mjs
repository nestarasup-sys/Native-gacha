import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const groupName = process.argv[2]
if (!groupName) throw new Error('Informe o grupo de testes. Exemplo: node scripts/testing/run-group.mjs refactor')

const groupsPath = process.argv[3]
  ? resolve(process.argv[3])
  : new URL('../../tests/groups.json', import.meta.url)
const groups = JSON.parse(await readFile(groupsPath, 'utf8'))
const commands = groups[groupName]
if (!Array.isArray(commands) || commands.some(command => typeof command !== 'string' || !command.trim())) {
  throw new Error(`Grupo de testes ausente ou inválido: ${groupName}`)
}

for (const [index, command] of commands.entries()) {
  console.log(`\n[${groupName} ${index + 1}/${commands.length}] ${command}`)
  const child = spawn(command, { shell: true, stdio: 'inherit', windowsHide: true })
  const exitCode = await new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('close', resolve)
  })
  if (exitCode !== 0) {
    const failureCode = typeof exitCode === 'number' ? exitCode : 1
    console.error(`\n[${groupName}] FALHOU (código ${failureCode}): ${command}`)
    process.exit(failureCode)
  }
}

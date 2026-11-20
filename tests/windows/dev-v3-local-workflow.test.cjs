'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync, spawnSync } = require('node:child_process')
const { expectedFingerprint, dependencyState } = require('../../scripts/windows/ensure-dev-deps.cjs')

const ROOT = path.resolve(__dirname, '..', '..')
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8')

test('Dev-v3 Windows entrypoints never select Dev-V2 or run legacy predev automatically', () => {
  const open = read('ABRIR_DESENVOLVIMENTO.bat')
  const update = read('ATUALIZAR_DESENVOLVIMENTO.bat')
  const publisher = read('PUBLICAR_NO_GITHUB.ps1')
  const updater = read('scripts/windows/atualizar-dev-v3.ps1')
  assert.match(open, /"Dev-v3"/)
  assert.match(open, /ensure-dev-deps\.cjs/)
  assert.match(open, /electron-vite\.cmd" dev/)
  assert.doesNotMatch(open, /git switch/i)
  assert.doesNotMatch(open, /call npm run dev|call npm install/i)
  assert.match(update, /atualizar-dev-v3\.ps1/)
  assert.match(updater, /--ff-only/)
  assert.match(updater, /--porcelain --untracked-files=normal/)
  assert.match(updater, /remote\.origin\.url/)
  assert.doesNotMatch(updater, /GitChecked -Arguments @\('(reset|clean|rebase|push|stash)'/)
  assert.doesNotMatch(publisher, /& git|git push|Copy-Item/)
})

test('node_modules fingerprint invalidates after lockfile or ABI change; no npm is executed by this test', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'native-gacha-deps-test-'))
  try {
    fs.writeFileSync(path.join(root, 'package-lock.json'), '{"lockfileVersion":3}')
    const state = dependencyState(root)
    assert.equal(state.needsInstall, true)
    const deps = [
      'electron/dist/electron.exe',
      '.bin/electron-vite.cmd',
      'sharp/package.json'
    ]
    for (const dep of deps) {
      const target = path.join(root, 'node_modules', dep)
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.writeFileSync(target, 'synthetic')
    }
    fs.mkdirSync(path.dirname(state.marker), { recursive: true })
    fs.writeFileSync(state.marker, JSON.stringify({ fingerprint: state.fingerprint }))
    assert.equal(dependencyState(root).needsInstall, false)
    assert.equal(dependencyState(root, { node: 'different-node-abi' }).needsInstall, true)
    fs.writeFileSync(path.join(root, 'package-lock.json'), '{"lockfileVersion":3,"updated":true}')
    assert.equal(dependencyState(root).needsInstall, true)
    assert.notEqual(state.fingerprint, expectedFingerprint('{"lockfileVersion":3,"updated":true}'))
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', windowsHide: true }).trim()
}
function fixture() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'native-gacha-local-git-'))
  const seed = path.join(home, 'seed')
  const remote = path.join(home, 'local-remote.git')
  const clone = path.join(home, 'old-clone')
  fs.mkdirSync(seed)
  git(home, 'init', '--initial-branch=Dev-V2', seed)
  git(seed, 'config', 'user.name', 'Synthetic Test')
  git(seed, 'config', 'user.email', 'synthetic@example.invalid')
  fs.writeFileSync(path.join(seed, '.gitignore'), 'app-data/\nnode_modules/\n')
  fs.writeFileSync(path.join(seed, 'app.txt'), 'old commit\n')
  git(seed, 'add', '.')
  git(seed, 'commit', '-m', 'old local version')
  const oldSha = git(seed, 'rev-parse', 'HEAD')
  git(seed, 'switch', '-c', 'Dev-v3')
  fs.writeFileSync(path.join(seed, 'engine.txt'), 'new engine code\n')
  git(seed, 'add', '.')
  git(seed, 'commit', '-m', 'remote Dev-v3')
  const remoteSha = git(seed, 'rev-parse', 'HEAD')
  git(home, 'clone', '--bare', seed, remote)
  git(home, 'clone', '--branch', 'Dev-V2', remote, clone)
  const url = 'https://github.com/nestarasup-sys/Native-gacha.git'
  git(clone, 'remote', 'set-url', 'origin', url)
  // Real Git rewrites the transport only, keeping remote.origin.url exact.
  // No external network is used in this integration test.
  git(clone, 'config', 'url.' + remote.replaceAll('\\', '/') + '.insteadOf', url)
  fs.mkdirSync(path.join(clone, 'app-data'))
  fs.writeFileSync(path.join(clone, 'app-data', 'private-project.txt'), 'never mutate')
  return { home, seed, remote, clone, oldSha, remoteSha }
}
function update(root) {
  return spawnSync('powershell.exe', [
    '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-File', path.join(ROOT, 'scripts', 'windows', 'atualizar-dev-v3.ps1'),
    '-RepositoryRoot', root
  ], { encoding: 'utf8', windowsHide: true, timeout: 60000 })
}

test.skipIf(process.platform !== 'win32')('old clone switches to Dev-v3 by real fast-forward, preserving Dev-V2 and private data', () => {
  const f = fixture()
  try {
    const result = update(f.clone)
    assert.equal(result.status, 0, [result.stdout, result.stderr].join('\n'))
    assert.equal(git(f.clone, 'branch', '--show-current'), 'Dev-v3')
    assert.equal(git(f.clone, 'rev-parse', 'HEAD'), f.remoteSha)
    assert.equal(git(f.clone, 'rev-parse', 'Dev-V2'), f.oldSha)
    assert.equal(fs.readFileSync(path.join(f.clone, 'app-data', 'private-project.txt'), 'utf8'), 'never mutate')
    assert.equal(fs.readFileSync(path.join(f.clone, 'engine.txt'), 'utf8'), 'new engine code\n')
    // A modified tracked file must stop updates without discarding edits.
    fs.writeFileSync(path.join(f.clone, 'engine.txt'), 'my local changes')
    const rejected = update(f.clone)
    assert.notEqual(rejected.status, 0)
    assert.equal(fs.readFileSync(path.join(f.clone, 'engine.txt'), 'utf8'), 'my local changes')
    assert.equal(git(f.clone, 'rev-parse', 'HEAD'), f.remoteSha)
  } finally {
    fs.rmSync(f.home, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
  }
});

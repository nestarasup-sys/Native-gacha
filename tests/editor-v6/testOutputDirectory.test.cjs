const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { resolveEditorV6TestOutputDirectory } = require('../../scripts/editor-v6/testOutputDirectory.cjs')

test('outputs de performance e exportação usam a pasta out padrão quando não há override', () => {
  assert.equal(resolveEditorV6TestOutputDirectory('C:/app', {}), path.resolve('C:/app/out'))
})

test('override de teste redireciona todos os artefatos sem alterar a pasta padrão', () => {
  const temporaryOutput = path.resolve('synthetic-editor-v6-output')
  assert.equal(resolveEditorV6TestOutputDirectory('C:/app', {
    NATIVE_GACHA_TEST_OUTPUT_DIR: temporaryOutput
  }), temporaryOutput)
})

test('harnesses de exportação respeitam a saída isolada e limpam apenas fixtures próprios', () => {
  const fs = require('node:fs')
  for (const script of ['scripts/editor-v6/check-export.cjs', 'scripts/editor-v6/check-hair-motion-export.cjs', 'scripts/editor-v6/check-face-export.cjs']) {
    const source = fs.readFileSync(script, 'utf8')
    assert.match(source, /resolveEditorV6TestOutputDirectory\(root\)/, `${script} deve respeitar NATIVE_GACHA_TEST_OUTPUT_DIR`)
    assert.match(source, /fixtureDirectory:\s*basename\(folder\)/, `${script} deve registrar apenas o nome da pasta temporária`)
    assert.doesNotMatch(source, /fixtureDirectory:\s*folder\b/, `${script} não deve publicar o caminho temporário privado`)
    assert.match(source, /removeEditorV6TemporaryFixture\(folder, 'editor-v6-[^']+'\)/, `${script} deve remover somente o fixture temporário próprio após preservar os resultados`)
    assert.ok(source.lastIndexOf('await copyFile') < source.indexOf('await removeEditorV6TemporaryFixture'), `${script} deve copiar os artefatos antes de remover o fixture`)
  }
})

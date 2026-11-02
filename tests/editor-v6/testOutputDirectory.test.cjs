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

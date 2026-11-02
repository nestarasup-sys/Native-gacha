const path = require('node:path')

function resolveEditorV6TestOutputDirectory(root, environment = process.env) {
  const configuredDirectory = environment.NATIVE_GACHA_TEST_OUTPUT_DIR
  return configuredDirectory
    ? path.resolve(configuredDirectory)
    : path.resolve(root, 'out')
}

module.exports = { resolveEditorV6TestOutputDirectory }

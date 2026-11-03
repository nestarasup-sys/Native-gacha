const { existsSync } = require('node:fs')
const { join, resolve } = require('node:path')

function resolveEditorV6TestVideoToolsDirectory(root) {
  const configured = process.env.EDITOR_V6_TEST_VIDEO_TOOLS_DIR
  const directory = resolve(configured || join(root, 'resources', 'video-tools'))
  for (const executable of ['ffmpeg.exe', 'ffprobe.exe']) {
    if (!existsSync(join(directory, executable))) {
      throw Error(`A ferramenta sintética de exportação está ausente: ${executable}.`)
    }
  }
  return directory
}

module.exports = { resolveEditorV6TestVideoToolsDirectory }

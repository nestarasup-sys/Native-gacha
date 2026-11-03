const assert = require('node:assert/strict')
const { mkdtemp, mkdir, writeFile, rm } = require('node:fs/promises')
const { join } = require('node:path')
const { tmpdir } = require('node:os')
const { test } = require('node:test')
const { resolveEditorV6TestVideoToolsDirectory } = require('../../scripts/editor-v6/testVideoTools.cjs')

async function makeToolsDirectory(parent, name = 'video-tools') {
  const directory = join(parent, name)
  await mkdir(directory, { recursive: true })
  await writeFile(join(directory, 'ffmpeg.exe'), Buffer.from([1]))
  await writeFile(join(directory, 'ffprobe.exe'), Buffer.from([1]))
  return directory
}

test('uses the installed app tools by default without requiring a CI override', async () => {
  const root = await mkdtemp(join(tmpdir(), 'editor-v6-tool-path-default-'))
  const previous = process.env.EDITOR_V6_TEST_VIDEO_TOOLS_DIR
  delete process.env.EDITOR_V6_TEST_VIDEO_TOOLS_DIR
  try {
    const expected = await makeToolsDirectory(join(root, 'resources'), 'video-tools')
    assert.equal(resolveEditorV6TestVideoToolsDirectory(root), expected)
  } finally {
    if (previous === undefined) delete process.env.EDITOR_V6_TEST_VIDEO_TOOLS_DIR
    else process.env.EDITOR_V6_TEST_VIDEO_TOOLS_DIR = previous
    await rm(root, { recursive: true, force: true })
  }
})

test('uses an isolated verified tool directory when CI or a local test provides one', async () => {
  const root = await mkdtemp(join(tmpdir(), 'editor-v6-tool-path-override-'))
  const previous = process.env.EDITOR_V6_TEST_VIDEO_TOOLS_DIR
  try {
    const expected = await makeToolsDirectory(root, 'verified-tools')
    process.env.EDITOR_V6_TEST_VIDEO_TOOLS_DIR = expected
    assert.equal(resolveEditorV6TestVideoToolsDirectory(root), expected)
  } finally {
    if (previous === undefined) delete process.env.EDITOR_V6_TEST_VIDEO_TOOLS_DIR
    else process.env.EDITOR_V6_TEST_VIDEO_TOOLS_DIR = previous
    await rm(root, { recursive: true, force: true })
  }
})

test('rejects incomplete tool folders instead of silently falling back', async () => {
  const root = await mkdtemp(join(tmpdir(), 'editor-v6-tool-path-incomplete-'))
  const previous = process.env.EDITOR_V6_TEST_VIDEO_TOOLS_DIR
  try {
    const directory = join(root, 'incomplete-tools')
    await mkdir(directory)
    await writeFile(join(directory, 'ffmpeg.exe'), Buffer.from([1]))
    process.env.EDITOR_V6_TEST_VIDEO_TOOLS_DIR = directory
    assert.throws(() => resolveEditorV6TestVideoToolsDirectory(root), /ffprobe\.exe/)
  } finally {
    if (previous === undefined) delete process.env.EDITOR_V6_TEST_VIDEO_TOOLS_DIR
    else process.env.EDITOR_V6_TEST_VIDEO_TOOLS_DIR = previous
    await rm(root, { recursive: true, force: true })
  }
})

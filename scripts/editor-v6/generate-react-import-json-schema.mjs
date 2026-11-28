import { readFile, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { EDITOR_V6_REACT_IMPORT_FORMAT, editorV6ReactImportSchema } from '../../src/shared/editorV6ReactImport.ts'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const outputPath = path.join(root, 'docs/editor-v6/schema/NYMI_EDITOR_V6_REACT_V1.schema.json')

function buildSchema() {
  const schema = z.toJSONSchema(editorV6ReactImportSchema, { io: 'input', unrepresentable: 'any' })
  schema.$id = 'NYMI_EDITOR_V6_REACT_V1.schema.json'
  schema.title = 'Native Gacha Editor V6 react import'
  schema.description = 'Generated from the Editor V6 Zod import contract. This schema covers JSON structure and representable field constraints; some custom-validated subtrees are necessarily unconstrained here. Importer validation remains authoritative for those subtrees, frame quantization, catalogue references, cross-field refinements and semantic timing.'

  const videoItem = schema.properties.videos.items
  videoItem.allOf = [...(videoItem.allOf ?? []), {
    oneOf: [
      { required: ['videoId'], not: { anyOf: [{ required: ['videoName'] }, { required: ['videoNumber'] }] } },
      { required: ['videoName'], not: { anyOf: [{ required: ['videoId'] }, { required: ['videoNumber'] }] } },
      { required: ['videoNumber'], not: { anyOf: [{ required: ['videoId'] }, { required: ['videoName'] }] } }
    ]
  }]

  const presentation = schema.properties.videos.items.properties.presentation
  presentation.allOf = [...(presentation.allOf ?? []),
    { not: { required: ['bottomCard', 'bottomCards'] } },
    { not: { required: ['timeCard', 'timeCards'] } },
    { not: { required: ['cards'], anyOf: [
      { required: ['bottomCard'] }, { required: ['bottomCards'] },
      { required: ['timeCard'] }, { required: ['timeCards'] }
    ] } }
  ]

  schema['x-editor-v6-runtime-invariants'] = [
    'The importer resolves character names/UUIDs, video-library references, pose categories and expression presets against the installed catalogs.',
    'Video IDs, names and numbers are mutually exclusive; every video must specify exactly one locator.',
    'A cast member, beat or character part in the Intro cannot specify poseSlot and poseCategory together.',
    'Beats for the same character and quantized frame combine different attributes, deduplicate identical values, and reject conflicting values with beat field paths.',
    'Card intervals are quantized at 30 fps; component intervals must fit their card, occupy at least one frame, and must not overlap within each legacy schedule.',
    'Intro blocks must be chronological and non-overlapping after frame quantization; each character part must fit its presentation interval.',
    'Intro face snapshots use custom face-appearance, transform and expression-effect validators that JSON Schema cannot fully express; validate them through the application importer.',
    'The planner checks cross-item references, timeline bounds and resource availability. A JSON Schema validator does not replace importer validation.'
  ]

  return schema
}

const expected = `${JSON.stringify(buildSchema(), null, 2)}\n`
if (process.argv.includes('--check')) {
  const actual = await readFile(outputPath, 'utf8').catch(() => '')
  if (actual !== expected) {
    console.error(`JSON Schema desatualizado: execute npm run editor-v6:react-schema para regenerar ${path.relative(root, outputPath)}.`)
    process.exitCode = 1
  } else {
    console.log('JSON Schema do importador está sincronizado com o contrato Zod.')
  }
} else {
  await mkdir(path.dirname(outputPath), { recursive: true })
  await writeFile(outputPath, expected, 'utf8')
  console.log(`Schema gravado: ${path.relative(root, outputPath)}`)
}

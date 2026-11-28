import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { editorV6ReactImportSchema, EDITOR_V6_REACT_IMPORT_FORMAT } from '../../src/shared/editorV6ReactImport'

const schemaPath = resolve(process.cwd(), 'docs/editor-v6/schema/NYMI_EDITOR_V6_REACT_V1.schema.json')
const guidePath = resolve(process.cwd(), 'docs/editor-v6/GUIA_V15_2_NATIVE_GACHA_EDITOR_V6_JSON_REACT.md')

describe('contrato JSON portátil do importador V6', () => {
  it('mantém o exemplo integrado do guia válido no parser real', () => {
    const guide = readFileSync(guidePath, 'utf8')
    const example = [...guide.matchAll(/```json\s*([\s\S]*?)```/g)]
      .find(([block]) => block.includes(`"format": "${EDITOR_V6_REACT_IMPORT_FORMAT}"`))
    expect(example, 'exemplo JSON integrado não encontrado no guia técnico').not.toBeNull()
    expect(() => editorV6ReactImportSchema.parse(JSON.parse(example![1]))).not.toThrow()
  })

  it('publica os limites estruturais e documenta os refinamentos sem representação nativa', () => {
    const schema = JSON.parse(readFileSync(schemaPath, 'utf8'))
    expect(schema.properties.format.const).toBe(EDITOR_V6_REACT_IMPORT_FORMAT)
    expect(schema.additionalProperties).toBe(false)
    expect(schema.properties.videos.items.allOf.some((rule: { oneOf?: unknown[] }) => rule.oneOf?.length === 3)).toBe(true)
    expect(schema.properties.videos.items.properties.presentation.allOf).toHaveLength(3)
    expect(schema['x-editor-v6-runtime-invariants']).toContain(
      'The importer resolves character names/UUIDs, video-library references, pose categories and expression presets against the installed catalogs.'
    )
    expect(schema['x-editor-v6-runtime-invariants']).toContain(
      'A cast member, beat or character part in the Intro cannot specify poseSlot and poseCategory together.'
    )
    expect(schema['x-editor-v6-runtime-invariants']).toContain(
      'Beats for the same character and quantized frame combine different attributes, deduplicate identical values, and reject conflicting values with beat field paths.'
    )
    expect(schema['x-editor-v6-runtime-invariants']).toContain(
      'Intro face snapshots use custom face-appearance, transform and expression-effect validators that JSON Schema cannot fully express; validate them through the application importer.'
    )
  })
})

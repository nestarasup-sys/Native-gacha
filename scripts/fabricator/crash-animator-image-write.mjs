import { resolve, relative, isAbsolute, join } from 'node:path'
import { tmpdir } from 'node:os'
import * as fs from 'node:fs/promises'
import { createAnimatorPersistence } from '../../electron/domains/fabricator/animatorPersistence.ts'

const folder = resolve(process.argv[2] ?? '')
const scope = process.argv[3] ?? 'animation'
const crashPhase = process.argv[4] ?? 'image'
const manifestName = scope === 'draft' ? 'draft.json' : 'animation.json'
const relativeToTemp = relative(resolve(tmpdir()), folder)
if (!relativeToTemp.includes('native-gacha-pose-animator-') || relativeToTemp.startsWith('..') || isAbsolute(relativeToTemp)) {
  throw new Error('O teste de interrupção aceita somente a pasta temporária sintética do Animator.')
}
if (!['animation', 'draft'].includes(scope) || !['image', 'manifest'].includes(crashPhase)) throw new Error('Alvo de interrupção sintética inválido.')

const animation = {
  schemaVersion: 1,
  slot: 1,
  name: 'Crash test',
  sourceModelSlot: 1,
  sourceModelName: 'Modelo sintético',
  sourceModelUpdatedAt: '2026-10-22T12:00:00Z',
  sourceModelPartCount: 1,
  width: 200,
  height: 240,
  parts: [{ id: 'head', name: 'Cabeça', x: 12, y: 8, width: 30, height: 40, rotation: 0 }],
  joints: [],
  layerOrder: ['head'],
  hiddenPartIds: [],
  frames: [{
    id: 'frame-1',
    durationMs: 100,
    transforms: { head: { x: 12, y: 8, rotation: 0 } },
    joints: [],
    thumbnailDataUrl: 'data:image/png;base64,UE5HREFUQQ=='
  }],
  interpolation: 'smooth',
  loopMode: 'loop',
  speed: 1,
  thumbnailDataUrl: 'data:image/png;base64,UE5HREFUQQ==',
  updatedAt: '2026-10-29T12:00:00Z'
}

const persistence = createAnimatorPersistence({
  animatorSlotPath: (modelSlot, slot) => modelSlot === 1 && slot === 1 ? folder : join(folder, 'unexpected'),
  animatorDraftPath: () => scope === 'draft' ? folder : join(folder, 'draft'),
  isValidModelSlot: slot => slot === 1,
  isValidPoseSlot: slot => slot === 1,
  dataUrlBuffer: url => Buffer.from(url.split(',')[1], 'base64'),
  writeAssetImageSource: async (path, bytes) => {
    if (!path.endsWith('head.png')) throw new Error('O teste esperava escrever somente o PNG da cabeça.')
    await fs.writeFile(path, crashPhase === 'image' ? Buffer.from('PROCESS_CRASH_NEW_IMAGE') : bytes)
    if (crashPhase === 'image') process.exit(94)
  },
  readAssetImage: path => fs.readFile(path),
  files: crashPhase === 'manifest' ? new Proxy(fs, {
    get(target, property, receiver) {
      const operation = Reflect.get(target, property, receiver)
      if (property === 'rename') return async (source, destination) => {
        await target.rename(source, destination)
        if (String(source).endsWith(`${manifestName}.tmp`) && String(destination).endsWith(manifestName)) process.exit(96)
      }
      return typeof operation === 'function' ? (...args) => operation.apply(target, args) : operation
    }
  }) : fs
})

const assets = [{ id: 'head', dataUrl: 'data:image/png;base64,UE5HREFUQQ==' }]
if (scope === 'draft') {
  await persistence.writeAnimatorDraft(1, {
    editingSlot: null,
    animation: { ...animation, slot: undefined },
    currentTransforms: { head: { x: 12, y: 8, rotation: 0 } },
    currentJoints: [],
    selectedFrameId: 'frame-1',
    dirtyFrame: false,
    updatedAt: animation.updatedAt
  }, assets)
} else {
  await persistence.writeAnimatorAnimation(1, 1, animation, assets)
}
process.exit(95)

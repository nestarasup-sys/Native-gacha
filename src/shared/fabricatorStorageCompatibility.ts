/** Gate não destrutivo de compatibilidade do Fabricador.
 * Não migra nem regrava documentos; dados desconhecidos ficam preservados.
 */
export type FabricatorStorageKind =
  | 'model' | 'pose' | 'animator' | 'wardrobe' | 'hair' | 'hair-style'
  | 'face' | 'face-catalog' | 'face-component' | 'expression'

export type FabricatorStorageCompatibility =
  | { compatible: true; version: 1; legacy: boolean }
  | { compatible: false; reason: string }

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function list(value: unknown, limit: number): boolean {
  return Array.isArray(value) && value.length <= limit
}
export function inspectFabricatorStorage(
  kind: FabricatorStorageKind,
  document: unknown
): FabricatorStorageCompatibility {
  if (!object(document)) return {compatible:false,reason:'Documento não é objeto.'}
  if (document.schemaVersion !== 1) {
    return {compatible:false,reason:'Versão de esquema não suportada.'}
  }
  const legacy = (kind === 'model' && (document.layerOrder === undefined || document.hiddenPartIds === undefined))
    || (kind === 'wardrobe' && document.edition === undefined)
    || (kind === 'hair-style' && document.category === undefined)
    || (kind === 'expression' && document.collectionId === undefined)
  const incompatible = (reason: string): FabricatorStorageCompatibility => ({compatible:false,reason})
  switch (kind) {
    case 'model':
      if (!list(document.parts,500) || !list(document.joints,500)) return incompatible('Geometria do modelo inválida.')
      break
    case 'pose':
      if (!list(document.parts,500) || !list(document.joints,500)) return incompatible('Pose inválida.')
      break
    case 'animator':
      if (!list(document.parts,500) || !list(document.frames,10000)) return incompatible('Animação inválida.')
      break
    case 'wardrobe':
      if (document.edition !== undefined && document.edition !== 1 && document.edition !== 2)
        return incompatible('Edição de roupas desconhecida.')
      if (!list(document.components,100)) return incompatible('Peças de roupa inválidas.')
      break
    case 'hair': case 'hair-style':
      if (!object(document.transforms)) return incompatible('Transformações do cabelo inválidas.')
      break
    case 'face':
      if (!object(document.sheets) || !list(document.pieces,500)) return incompatible('Rosto inválido.')
      break
    case 'face-catalog':
      if (!object(document.sheet) || !list(document.pieces,100)) return incompatible('Catálogo facial inválido.')
      break
    case 'face-component':
      if (!object(document.defaultTransform)) return incompatible('Peça facial inválida.')
      break
    case 'expression':
      if (!object(document.selections) || !object(document.transforms)) return incompatible('Expressão inválida.')
      break
  }
  return {compatible:true,version:1,legacy:Boolean(legacy)}
}

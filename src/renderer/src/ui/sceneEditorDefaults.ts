export type SceneTextElementKind = 'narrator' | 'speech' | 'thought'

export const sceneEditorTools = [
  { id: 'background', label: 'Fundo', icon: 'frame' },
  { id: 'objects', label: 'Objetos', icon: 'sparkles' }
] as const

export function sceneCatalogColor(number: number): string {
  return `hsl(${(number * 137.508) % 360} 45% 78%)`
}

export function createSceneTextElement(kind: SceneTextElementKind, zIndex: number) {
  return {
    id: crypto.randomUUID(),
    kind,
    text: kind === 'narrator' ? 'Texto do narrador' : 'Digite aqui',
    x: 0,
    y: 0,
    width: kind === 'narrator' ? 32 : 28,
    height: kind === 'narrator' ? 12 : 16,
    rotation: 0,
    zIndex
  }
}

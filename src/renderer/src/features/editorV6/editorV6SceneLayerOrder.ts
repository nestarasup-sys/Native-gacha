import type { EditorV6SceneElement } from '../../../../shared/editorV6'

/** Keep authored element order while guaranteeing dialogue balloons render above every scene layer. */
export function editorV6ElementsWithBalloonsOnTop(elements: readonly EditorV6SceneElement[]): EditorV6SceneElement[] {
  const regular: EditorV6SceneElement[] = []
  const balloons: EditorV6SceneElement[] = []
  for (const element of elements) {
    if (element.kind === 'speech' || element.kind === 'thought') balloons.push(element)
    else regular.push(element)
  }
  return [...regular, ...balloons]
}

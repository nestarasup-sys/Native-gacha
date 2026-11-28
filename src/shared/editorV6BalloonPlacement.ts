import type { EditorV6Element } from './editorV6'

/** Anchor above the actor's face; final clipping to the canvas is shared by preview and export. */
export function editorV6DefaultBalloonPlacement(actor: EditorV6Element, balloonHeight: number) {
  const characterHeight = actor.height * (actor.characterScale ?? 100) / 100 * (actor.characterHeightScale ?? 100) / 100
  return { x: actor.x, y: actor.y - characterHeight * 0.38 - balloonHeight / 2 - 2 }
}

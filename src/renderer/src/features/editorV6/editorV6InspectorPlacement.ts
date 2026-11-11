export type EditorV6HorizontalBounds = { left: number; right: number }

export function getEditorV6InspectorSide(
  bounds: EditorV6HorizontalBounds | null,
  inspectorWidth: number
): 'left' | 'right' {
  if (bounds?.right !== undefined && bounds.right > 100 - inspectorWidth) return 'left'
  if (bounds?.left !== undefined && bounds.left < inspectorWidth) return 'right'
  return 'right'
}

/** Estado compartilhado de inspector dos EditorV6s, separado do documento de cena.
 * Os hooks mantêm os defaults e a ordem do componente original.
 */
import { useRef, useState } from 'react'
import type { FaceExpressionCollection, FaceExpressionPresetSummary } from '../../../../shared/fabricator'
import type { SceneFaceCategory } from '../../characters/sceneFaceSelection'

export function useEditorV6InspectorState() {
  const [inspectorTab, setInspectorTab] = useState<'editor' | 'custom'>('editor')
  const [inspectorCustomView, setInspectorCustomView] = useState<'face' | 'presets'>('face')
  const characterInspectorViewRef = useRef<{ tab: 'editor' | 'custom'; customView: 'face' | 'presets' }>({ tab: 'editor', customView: 'face' })
  const [editorV6PresetCategory, setEditorV6PresetCategory] = useState<'pose' | 'expression'>('expression')
  const [editorV6ExpressionCollections, setEditorV6ExpressionCollections] = useState<FaceExpressionCollection[]>([])
  const [editorV6ExpressionPresets, setEditorV6ExpressionPresets] = useState<FaceExpressionPresetSummary[]>([])
  const [sceneExpressionPresetVersions, setSceneExpressionPresetVersions] = useState<Record<string, string>>({})
  const [editorV6ExpressionCollectionMenuOpen, setEditorV6ExpressionCollectionMenuOpen] = useState(false)
  const [editorV6ExpressionLoading, setEditorV6ExpressionLoading] = useState(false)
  const [editorV6ExpressionBusy, setEditorV6ExpressionBusy] = useState(false)
  const [inspectorOpen, setInspectorOpen] = useState(true)
  const [editorV6FaceCategory, setEditorV6FaceCategory] = useState<SceneFaceCategory>('eyes')
  const [editorV6FaceBusy, setEditorV6FaceBusy] = useState(false)

  return {
    inspectorTab,
    setInspectorTab,
    inspectorCustomView,
    setInspectorCustomView,
    editorV6PresetCategory,
    setEditorV6PresetCategory,
    editorV6ExpressionCollections,
    setEditorV6ExpressionCollections,
    editorV6ExpressionPresets,
    setEditorV6ExpressionPresets,
    sceneExpressionPresetVersions,
    setSceneExpressionPresetVersions,
    editorV6ExpressionCollectionMenuOpen,
    setEditorV6ExpressionCollectionMenuOpen,
    editorV6ExpressionLoading,
    setEditorV6ExpressionLoading,
    editorV6ExpressionBusy,
    setEditorV6ExpressionBusy,
    inspectorOpen,
    setInspectorOpen,
    editorV6FaceCategory,
    setEditorV6FaceCategory,
    editorV6FaceBusy,
    setEditorV6FaceBusy,
    characterInspectorViewRef
  }
}

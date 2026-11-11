import { useRef, useState } from 'react'
import { createEditorV6ProjectCreationCommands, type EditorV6ProjectCreationDependencies } from './editorV6ProjectCreation'
import { runEditorV6ProjectCreationOnce } from './editorV6ProjectCreationGuard'

/** Owns the create-in-progress state and project creation/duplication actions. */
export function useEditorV6ProjectCreation(dependencies: EditorV6ProjectCreationDependencies) {
  const [creatingProject, setCreatingProject] = useState(false)
  const creatingProjectRef = useRef(false)
  const commands = createEditorV6ProjectCreationCommands(dependencies)

  const createStudio = () => runEditorV6ProjectCreationOnce(
    creatingProjectRef,
    setCreatingProject,
    commands.createStudio
  )

  return {
    creatingProject,
    createStudio,
    duplicateStudio: commands.duplicateStudio
  }
}

import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { EditorV6Document } from '../../../../shared/editorV6'
import {
  recordEditorV6History,
  redoEditorV6History,
  undoEditorV6History,
  type EditorV6History
} from '../../../../shared/editorV6History'

const emptyHistory = (): EditorV6History => ({ undo: [], redo: [] })

type EditorV6HistoryStore = {
  projects: EditorV6Document[]
  histories: Record<string, EditorV6History>
  setProjects: (projects: EditorV6Document[] | ((current: EditorV6Document[]) => EditorV6Document[])) => void
  clear: (projectId: string) => void
  record: (projectId: string, document: EditorV6Document) => EditorV6History
  undo: (projectId: string, document: EditorV6Document) => EditorV6Document | null
  redo: (projectId: string, document: EditorV6Document) => EditorV6Document | null
}

/** Editor V6-only project and history state. Immer preserves immutable snapshots. */
export const useEditorV6Store = create<EditorV6HistoryStore>()(immer((set, get) => ({
  projects: [],
  histories: {},
  setProjects: (projects) => set((state) => {
    state.projects = typeof projects === 'function' ? projects(state.projects) : projects
  }),
  clear: (projectId) => set((state) => { delete state.histories[projectId] }),
  record: (projectId, document) => {
    const next = recordEditorV6History(get().histories[projectId] ?? emptyHistory(), document)
    set((state) => { state.histories[projectId] = next })
    return next
  },
  undo: (projectId, document) => {
    const result = undoEditorV6History(get().histories[projectId] ?? emptyHistory(), document)
    if (result) set((state) => { state.histories[projectId] = result.history })
    return result?.document ?? null
  },
  redo: (projectId, document) => {
    const result = redoEditorV6History(get().histories[projectId] ?? emptyHistory(), document)
    if (result) set((state) => { state.histories[projectId] = result.history })
    return result?.document ?? null
  }
})))

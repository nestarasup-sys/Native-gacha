import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { editorV6ProjectSummary, type EditorV6Document, type EditorV6ProjectSummary } from '../../../../shared/editorV6'
import {
  recordEditorV6History,
  redoEditorV6History,
  undoEditorV6History,
  type EditorV6History
} from '../../../../shared/editorV6History'

const emptyHistory = (): EditorV6History => ({ undo: [], redo: [] })

type EditorV6HistoryStore = {
  projects: EditorV6ProjectSummary[]
  activeProject: EditorV6Document | null
  histories: Record<string, EditorV6History>
  setProjects: (projects: EditorV6ProjectSummary[] | ((current: EditorV6ProjectSummary[]) => EditorV6ProjectSummary[])) => void
  setActiveProject: (project: EditorV6Document | null) => void
  updateActiveProject: (update: (project: EditorV6Document) => EditorV6Document) => void
  upsertSummary: (summary: EditorV6ProjectSummary) => void
  removeSummary: (projectId: string) => void
  clear: (projectId: string) => void
  record: (projectId: string, document: EditorV6Document) => EditorV6History
  undo: (projectId: string, document: EditorV6Document) => EditorV6Document | null
  redo: (projectId: string, document: EditorV6Document) => EditorV6Document | null
}

/** Editor V6-only project and history state. Immer preserves immutable snapshots. */
export const useEditorV6Store = create<EditorV6HistoryStore>()(immer((set, get) => ({
  projects: [],
  activeProject: null,
  histories: {},
  setProjects: (projects) => set((state) => {
    state.projects = typeof projects === 'function' ? projects(state.projects) : projects
  }),
  setActiveProject: (project) => set((state) => {
    state.activeProject = project
    if (!project) return
    const summary = editorV6ProjectSummary(project)
    const index = state.projects.findIndex((item) => item.id === summary.id)
    if (index < 0) state.projects.push(summary)
    else state.projects[index] = summary
  }),
  updateActiveProject: (update) => set((state) => {
    if (!state.activeProject) return
    state.activeProject = update(state.activeProject)
    const summary = editorV6ProjectSummary(state.activeProject)
    const index = state.projects.findIndex((item) => item.id === summary.id)
    if (index < 0) state.projects.push(summary)
    else state.projects[index] = summary
  }),
  upsertSummary: (summary) => set((state) => {
    const index = state.projects.findIndex((item) => item.id === summary.id)
    if (index < 0) state.projects.push(summary)
    else state.projects[index] = summary
  }),
  removeSummary: (projectId) => set((state) => {
    state.projects = state.projects.filter((item) => item.id !== projectId)
    if (state.activeProject?.id === projectId) state.activeProject = null
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

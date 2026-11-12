import type { CustomizerCharacter } from '../../../../shared/customizer'
import type { EditorV6Document, EditorV6ProjectSummary } from '../../../../shared/editorV6'
import { Icon } from '../../ui/components/Icon'
import { EditorV6ReactImportDialog } from './EditorV6ReactImportDialog'

type Props = {
  folder: string
  loading: boolean
  creatingProject: boolean
  projects: EditorV6ProjectSummary[]
  selectedProjectId: string | null
  error: string | null
  importOpen: boolean
  characters: CustomizerCharacter[]
  charactersReady: boolean
  onCreateProject: () => Promise<void>
  onOpenImport: () => void
  onCloseImport: () => void
  onSaveImportedProject: (project: EditorV6Document) => Promise<void>
  onImportCompleted: (project: EditorV6Document) => void
  onOpenProject: (projectId: string) => void
  onDuplicateProject: (project: EditorV6ProjectSummary) => void
  onDeleteProject: (project: EditorV6ProjectSummary) => void
}

/** Project-library screen; loading, persistence and navigation remain owned by EditorV6Page. */
export function EditorV6ProjectBrowser({
  folder,
  loading,
  creatingProject,
  projects,
  selectedProjectId,
  error,
  importOpen,
  characters,
  charactersReady,
  onCreateProject,
  onOpenImport,
  onCloseImport,
  onSaveImportedProject,
  onImportCompleted,
  onOpenProject,
  onDuplicateProject,
  onDeleteProject
}: Props) {
  return (
    <main className="studio-page v6-project-browser" aria-label="Editor V6">
      <header className="studio-page-header"><h1>EDITOR V6</h1>{folder && <small>Dados locais: {folder}</small>}</header>
      <div className="studio-toolbar" aria-label="Ações do Editor V6">
        <button className="studio-action studio-action-primary" onClick={() => void onCreateProject()} disabled={loading || creatingProject} type="button"><Icon name="plus" />{creatingProject ? 'Criando…' : 'Criar'}</button>
        <button className="studio-action" onClick={onOpenImport} disabled={loading || !charactersReady} type="button"><Icon name="download" />Importar JSON</button>
      </div>
      {importOpen && <EditorV6ReactImportDialog characters={characters} onClose={onCloseImport} onSave={onSaveImportedProject} onImported={onImportCompleted} />}
      {error && <p className="studio-error-message" role="alert">{error}</p>}
      {loading ? <section className="studio-empty-state"><strong>Carregando projetos…</strong></section> : projects.length ? (
        <section className="studio-grid" aria-label="Projetos do Editor V6">
          {projects.map((project) => <article className={`studio-card${selectedProjectId === project.id ? ' selected' : ''}`} key={project.id}>
            <header className="studio-card-heading"><button className="studio-card-open" onClick={() => onOpenProject(project.id)} aria-label={`Abrir ${project.title}`} type="button">{project.title}</button><div className="studio-card-actions"><button className="studio-card-action" onClick={() => onDuplicateProject(project)} aria-label={`Duplicar ${project.title}`} title={`Duplicar ${project.title}`} type="button"><span className="studio-duplicate-icon" aria-hidden="true">▢</span></button><button className="studio-card-action danger" onClick={() => onDeleteProject(project)} aria-label={`Excluir ${project.title}`} title={`Excluir ${project.title}`} type="button"><Icon name="trash" /></button></div></header>
            <button className="studio-cover" style={{ backgroundColor: project.color, ...(project.thumbnailDataUrl ? { backgroundImage: `url(${project.thumbnailDataUrl})` } : {}) }} onClick={() => onOpenProject(project.id)} aria-label={`Abrir ${project.title}`} type="button" />
          </article>)}
        </section>
      ) : <section className="studio-empty-state"><span><Icon name="camera" /></span><strong>Nenhum projeto criado</strong><small>Crie um projeto para começar.</small></section>}
    </main>
  )
}

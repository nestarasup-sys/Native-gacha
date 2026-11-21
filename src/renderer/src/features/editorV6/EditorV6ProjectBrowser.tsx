import type { EditorV6Document, EditorV6ProjectSummary } from '../../../../shared/editorV6'
import { Icon } from '../../ui/components/Icon'
import { lazy, Suspense, useState } from 'react'

const EditorV6ReactImportDialog = lazy(async () => ({
  default: (await import('./EditorV6ReactImportDialog')).EditorV6ReactImportDialog
}))

type Props = {
  folder: string
  loading: boolean
  creatingProject: boolean
  projects: EditorV6ProjectSummary[]
  selectedProjectId: string | null
  error: string | null
  importOpen: boolean
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
  onCreateProject,
  onOpenImport,
  onCloseImport,
  onSaveImportedProject,
  onImportCompleted,
  onOpenProject,
  onDuplicateProject,
  onDeleteProject
}: Props) {
  const [jsonBusy, setJsonBusy] = useState(false)
  const [jsonError, setJsonError] = useState('')
  const [jsonStatus, setJsonStatus] = useState('')
  const exportJson = async (id: string) => {
    setJsonBusy(true); setJsonError(''); setJsonStatus('')
    try { const result = await window.desktop.editorV6.exportEditorV6ProjectJson(id); if (result) setJsonStatus(result.warnings.length ? `JSON salvo. Alguns dados não são suportados pelo formato e podem mudar na importação:\n${result.warnings.join('\n')}` : 'JSON do projeto exportado.') }
    catch (reason) { setJsonError(reason instanceof Error ? reason.message : String(reason)) }
    finally { setJsonBusy(false) }
  }
  return (
    <main className="studio-page v6-project-browser" aria-label="Editor V6">
      <header className="studio-page-header"><h1>EDITOR V6</h1>{folder && <small>Dados locais: {folder}</small>}</header>
      <div className="studio-toolbar" aria-label="Ações do Editor V6">
        <button className="studio-action studio-action-primary" onClick={() => void onCreateProject()} disabled={loading || creatingProject} type="button"><Icon name="plus" />{creatingProject ? 'Criando…' : 'Criar'}</button>
        <button className="studio-action" onClick={onOpenImport} type="button"><Icon name="download" />Importar JSON</button>
      </div>
      {importOpen && <Suspense fallback={<p role="status">Carregando importador…</p>}><EditorV6ReactImportDialog onClose={onCloseImport} onSave={onSaveImportedProject} onImported={onImportCompleted} /></Suspense>}
      {error && <p className="studio-error-message" role="alert">{error}</p>}
      {jsonError && <p className="studio-error-message" role="alert">{jsonError}</p>}
      {jsonStatus && <p role="status" style={{ whiteSpace: 'pre-line' }}>{jsonStatus}</p>}
      {loading ? <section className="studio-empty-state"><strong>Carregando projetos…</strong></section> : projects.length ? (
        <section className="studio-grid" aria-label="Projetos do Editor V6">
          {projects.map((project) => <article className={`studio-card${selectedProjectId === project.id ? ' selected' : ''}`} key={project.id}>
            <header className="studio-card-heading"><button className="studio-card-open" onClick={() => onOpenProject(project.id)} aria-label={`Abrir ${project.title}`} type="button">{project.title}</button><div className="studio-card-actions"><button className="studio-card-action" disabled={jsonBusy} onClick={() => void exportJson(project.id)} aria-label={`Exportar ${project.title} em JSON`} title="Exportar projeto em JSON" type="button"><Icon name="download" /></button><button className="studio-card-action" onClick={() => onDuplicateProject(project)} aria-label={`Duplicar ${project.title}`} title={`Duplicar ${project.title}`} type="button"><span className="studio-duplicate-icon" aria-hidden="true">▢</span></button><button className="studio-card-action danger" onClick={() => onDeleteProject(project)} aria-label={`Excluir ${project.title}`} title={`Excluir ${project.title}`} type="button"><Icon name="trash" /></button></div></header>
            <button className="studio-cover" style={{ backgroundColor: project.color, ...(project.thumbnailDataUrl ? { backgroundImage: `url(${project.thumbnailDataUrl})` } : {}) }} onClick={() => onOpenProject(project.id)} aria-label={`Abrir ${project.title}`} type="button" />
          </article>)}
        </section>
      ) : <section className="studio-empty-state"><span><Icon name="camera" /></span><strong>Nenhum projeto criado</strong><small>Crie um projeto para começar.</small></section>}
    </main>
  )
}

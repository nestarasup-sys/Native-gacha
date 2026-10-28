/** Consulta projetos do Editor V6 que apontam para um vídeo da biblioteca compartilhada. */
import type { EditorV6ProjectSummary } from '../../../src/shared/editorV6'

type Project = Pick<EditorV6ProjectSummary, 'id' | 'title'>
type ProjectManifest = { media?: Array<{ libraryVideoId?: unknown }> }

/** Reúne os vínculos salvos em manifesto ou documento sem carregar os assets. */
export function collectEditorV6VideoReferenceIds(value: unknown): Set<string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return new Set()
  const media = (value as ProjectManifest).media
  if (!Array.isArray(media)) return new Set()
  return new Set(media.flatMap((item) => item && typeof item.libraryVideoId === 'string' ? [item.libraryVideoId] : []))
}

export function createEditorV6VideoReferenceLookup(deps: {
  listProjects: () => Promise<Project[]>
  readManifest: (projectId: string) => Promise<string>
}) {
  return async (videoId: string): Promise<string | null> => {
    for (const project of await deps.listProjects()) {
      const manifest = JSON.parse(await deps.readManifest(project.id)) as ProjectManifest
      if (collectEditorV6VideoReferenceIds(manifest).has(videoId)) {
        return `Este vídeo está vinculado pelo ID ao projeto “${project.title}” do Editor V6. Remova a faixa do projeto antes de excluir o vídeo da Base.`
      }
    }
    return null
  }
}

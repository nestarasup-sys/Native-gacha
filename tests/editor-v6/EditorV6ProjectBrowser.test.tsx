import { createElement, type ComponentProps } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { EditorV6ProjectSummary } from '../../src/shared/editorV6'
import { EditorV6ProjectBrowser } from '../../src/renderer/src/features/editorV6/EditorV6ProjectBrowser'

const project: EditorV6ProjectSummary = {
  id: 'project-1',
  title: 'Projeto de teste',
  color: '#d7b5cd',
  createdAt: '2026-11-10T12:00:00.000Z',
  updatedAt: '2026-11-10T12:00:00.000Z',
  thumbnailDataUrl: undefined
}

function renderBrowser(overrides: Partial<ComponentProps<typeof EditorV6ProjectBrowser>> = {}) {
  return renderToStaticMarkup(createElement(EditorV6ProjectBrowser, {
    folder: 'C:/EditorV6',
    loading: false,
    creatingProject: false,
    projects: [],
    selectedProjectId: null,
    error: null,
    importOpen: false,
    characters: [],
    charactersReady: true,
    onCreateProject: async () => {},
    onOpenFolder: async () => {},
    onOpenImport: vi.fn(),
    onCloseImport: vi.fn(),
    onSaveImportedProject: async () => {},
    onImportCompleted: vi.fn(),
    onOpenProject: vi.fn(),
    onDuplicateProject: vi.fn(),
    onDeleteProject: vi.fn(),
    ...overrides
  }))
}

describe('biblioteca de projetos do Editor V6', () => {
  it('mostra carregamento sem apresentar a tela vazia antes da resposta', () => {
    const html = renderBrowser({ loading: true })

    expect(html).toContain('Carregando projetos…')
    expect(html).not.toContain('Nenhum projeto criado')
  })

  it('mantém as ações de criar e importar na coleção vazia', () => {
    const html = renderBrowser()

    expect(html).toContain('Dados locais: C:/EditorV6')
    expect(html).toContain('Nenhum projeto criado')
    expect(html).toContain('Criar')
    expect(html).toContain('Importar JSON')
    expect(html).toContain('Ir à pasta')
  })

  it('renderiza o diálogo de importação quando a página o solicita', () => {
    const html = renderBrowser({ importOpen: true })

    expect(html).toContain('role="status">Carregando importador…</p>')
    expect(html).toContain('Importar JSON')
  })

  it('apresenta o projeto selecionado com ações acessíveis de abrir, duplicar e excluir', () => {
    const html = renderBrowser({ projects: [project], selectedProjectId: project.id })

    expect(html).toContain('class="studio-card selected"')
    expect(html).toContain('aria-label="Abrir Projeto de teste"')
    expect(html).toContain('aria-label="Duplicar Projeto de teste"')
    expect(html).toContain('aria-label="Excluir Projeto de teste"')
    expect(html).toContain('background-color:#d7b5cd')
  })

  it('mostra o diagnóstico de um projeto indisponível e bloqueia ações que podem alterá-lo', () => {
    const unavailable = { ...project, id: '163b33b4-4b4b-4e45-a840-045944922630', title: 'Projeto indisponível · 163b33b4', unavailableReason: 'O manifesto tem identificador incompatível.' }
    const html = renderBrowser({ projects: [project, unavailable] })

    expect(html).toContain('class="studio-card unavailable"')
    expect(html).toContain('role="status">ID 163b33b4-4b4b-4e45-a840-045944922630: O manifesto tem identificador incompatível.</p>')
    expect(html).toMatch(/class="studio-card-open" disabled="" aria-label="Projeto indisponível · 163b33b4: indisponível"/)
    expect(html).toMatch(/class="studio-card-action danger" disabled="" aria-label="Excluir Projeto indisponível · 163b33b4"/)
  })
})

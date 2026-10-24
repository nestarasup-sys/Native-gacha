# Native Gacha — G-V5

Aplicativo desktop de criação de personagens, customização e composição de cenas, feito com **Electron + React + TypeScript**. Este repositório registra uma **refatoração incremental** do aplicativo que já funciona, preservando formatos de arquivos e contratos IPC.

> **Estado atual: em reorganização arquitetural.** O **Video Studio está em reconstrução ativa** na branch `Main-desenvolvimento`, ainda sem validação completa de reprodução e exportação pesadas no Windows. **Não execute com bibliotecas pessoais sem backup.**

## Fluxo principal do produto

```text
Fabricador DEV ── bibliotecas (poses, peças, cabelo, rosto, modelos) ──► Customizador
                                                                          │
                                                                          ▼
                                                          Personagem com ajustes individuais
                                                                          │
                                                                          ▼
                                                                    Studio principal
```

O **Fabricador DEV** é o autor das bibliotecas. O **Customizador** seleciona e ajusta componentes por personagem. O **Studio** consome os personagens resultantes. Os módulos não devem editar o acervo de origem do outro módulo.

## Ambiente

- **Node.js 22.22.0 ou superior** (veja `.nvmrc` / `package.json`; exigência de `react-router@8.4.0`).
- npm (a versão e o lockfile precisam permanecer consistentes).
- Windows recomendado para validação completa do desktop e integração nativa.

```bash
npm ci
npm run audit:architecture
npm run test:refactor
npm run typecheck
npm run build
npm run dev
```

> Algumas dependências são nativas e `postinstall` instala Electron; o setup completo deve ser executado no ambiente de desenvolvimento. Os testes de arquitetura e refatoração podem ser executados sem iniciar o desktop.

## Branch oficial e atalhos de desenvolvimento (Windows)

A branch de trabalho do Native Gacha é **`Main-desenvolvimento`** (respeite maiúsculas/minúsculas). As mudanças do Video Studio e os testes de regressão são feitas nessa branch; `main` não é atualizada automaticamente.

- **`ATUALIZAR_DESENVOLVIMENTO.bat`**: verifica o clone `origin`, recusa alterações locais não salvas, faz fetch da branch oficial, seleciona `Main-desenvolvimento`, configura o upstream e faz `git pull --ff-only`. Não executa `reset --hard`, `clean` ou rebase.
- **`ABRIR_DESENVOLVIMENTO.bat`**: inicia o Electron no Windows sem chamar o `predev` que migra dados do perfil G-V5 legado.

**Primeira atualização em clones antigos:** se o BAT *já presente no computador* ainda cita `feature/model-source-editor`, o usuário precisa primeiro trocar para a branch nova pelo Git ou copiar a versão atualizada do BAT do GitHub. O script antigo não muda sozinho antes de ser atualizado. Com a pasta limpa:

```bash
git fetch origin Main-desenvolvimento
git switch --track -c Main-desenvolvimento origin/Main-desenvolvimento
```

Se a branch local `Main-desenvolvimento` já existir, use `git switch Main-desenvolvimento` no lugar do segundo comando, seguido de `git pull --ff-only origin Main-desenvolvimento`.

Para validar a reconstrução atual do Video Studio: `npm run test:video:next`, `npm run test:export:synthetic`, `npm run typecheck` e `npm run build`. Testes sintéticos e build verde **não** substituem validação visual e teste real de estresse de 180 s.

## Estrutura existente (sem mudança agressiva de diretórios)

- `electron/`: processo principal, preload seguro, serviços de arquivos e SQLite.
- `src/renderer/src/features/`: interfaces e fluxos dos módulos.
- `src/shared/`: regras compartilhadas sem dependência de páginas do React.
- `tests/`: contratos, migrações e testes de regressão.
- `scripts/architecture/`: auditorias de sintaxe, resolução de imports e limites de dependências.
- `docs/architecture/`: decisões e evidências das duas primeiras rodadas de refatoração.

A estrutura final deve evoluir **por domínio** e não por movimentação massiva de pastas. Preserve os caminhos antigos por reexports temporários quando necessário.

## Documentação útil

- [ADR 001 — Electron modular](docs/architecture/ADR-001-modular-electron.md)
- [ADR 002 — fluxo de personagens](docs/architecture/ADR-002-fluxo-personagens.md)
- [Relatório da evolução 22/10/2026](docs/architecture/RELATORIO_EVOLUCAO_2026-10-22.md)
- [Plano de trabalho e GitHub](docs/architecture/PLANO_GITHUB_E_PROXIMOS_PASSOS.md)
- [README histórico, com referências legadas](docs/architecture/README_LEGADO_2026-10-22.md)

## Segurança e publicação

O repositório GitHub é **público**. Não versionar projetos pessoais, personagens privados, perfis reais, chaves, tokens, vídeos privados nem bases SQLite de trabalho. A CI opera apenas com testes/fixtures sintéticas. Para mudanças estruturais, use branches curtas e pull requests com auditorias aprovadas.

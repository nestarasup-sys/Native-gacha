# Native Gacha — G-V5

Aplicativo desktop de criação de personagens, customização e composição de cenas, feito com **Electron + React + TypeScript**. Este repositório registra uma **refatoração incremental** do aplicativo que já funciona, preservando formatos de arquivos e contratos IPC.

> **Estado atual: em reorganização arquitetural.** O build e a execução Electron no Windows ainda precisam de validação com dependências completas. **Não execute com bibliotecas pessoais sem backup.** O **Video Studio está congelado**, fora do escopo de novas mudanças.

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

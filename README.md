# Native Gacha — G-V5

Aplicativo desktop de criação de personagens, customização e composição de cenas, feito com **Electron + React + TypeScript**. Este repositório registra uma **refatoração incremental** do aplicativo que já funciona, preservando formatos de arquivos e contratos IPC.

> **Dev-v3:** branch experimental para reconstruir a engine de exportação do **Editor V6**. O editor continua sendo a interface de autoria; a nova engine é um laboratório offline e não substituiu o exportador completo. Use o [plano da Engine V6](docs/editor-v6/engine-v3/README.md) para acompanhar os gates.

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
# Para iniciar no Windows, use ABRIR_DESENVOLVIMENTO.bat.
# Evite npm run dev: predev executa a migracao historica do perfil.
```

> Algumas dependências são nativas e `postinstall` instala Electron; o setup completo deve ser executado no ambiente de desenvolvimento. Os testes de arquitetura e refatoração podem ser executados sem iniciar o desktop.

## Clone local e atalhos da Dev-v3 (Windows)

**Para trabalhar na nova engine do Editor V6, a branch é `Dev-v3`** (não `Dev-V2`,
`Main-desenvolvimento` ou `main`). As branches antigas continuam preservadas.

- [Guia de primeira atualização de clone antigo](docs/editor-v6/engine-v3/CLONE-LOCAL-DEV-V3.md):
  inclui comandos de bootstrap; o BAT antigo não consegue se atualizar sozinho.
- **`ATUALIZAR_DESENVOLVIMENTO.bat`**: com a pasta Git limpa, busca `origin/Dev-v3`,
  seleciona a branch e aplica só fast-forward. Nunca usa reset, clean, stash, rebase ou push.
- **`ABRIR_DESENVOLVIMENTO.bat`**: exige que a branch já seja `Dev-v3`, verifica
  Node e dependências e abre o Electron sem executar o `predev` de migração de dados G-V5.
- **`PUBLICAR_NO_GITHUB.ps1`**: fluxo antigo de importação para `main` desativado.
  Não serve para trazer atualizações do GitHub ao computador.

**Clone novo diretamente da branch desejada:**

```powershell
git clone --branch Dev-v3 --single-branch https://github.com/nestarasup-sys/Native-gacha.git Native-gacha-Dev-v3
cd .\Native-gacha-Dev-v3
```

Abra `ABRIR_DESENVOLVIMENTO.bat`. Se estiver copiando uma pasta local antiga em vez
de clonar do GitHub, siga primeiro o guia de bootstrap. Em qualquer cenário,
**preserve `app-data/` e não use comandos Git destrutivos.**

### Dependências e dados

O atalho de abertura sincroniza `node_modules` com `package-lock.json`
quando necessário (`npm ci`). O script não apaga projetos nem executa
`npm run dev`; este último tem um `predev` histórico que prepara/migra
perfil local. O desenvolvimento usa `electron-vite dev` diretamente.
`resources/video-tools/` e `app-data/` são ignorados pelo Git.

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
- [Engine V6 / Dev-v3 — plano atual](docs/editor-v6/engine-v3/README.md)
- [Editor V6 — pesquisas e benchmarks históricos](docs/editor-v6/atual/README.md)
- [Arquivo histórico do Editor V6](docs/lixo/editor-v6/README.md)
- [README histórico, com referências legadas](docs/architecture/README_LEGADO_2026-10-22.md)

## Branch experimental de renderização (Zona de Guerra)

A branch experimental **`Dev-v3`** é o ambiente atual de construção da engine offline do Editor V6. A `Dev-V2` permanece como referência histórica, sem receber automaticamente as alterações. Consulte o [plano](docs/editor-v6/engine-v3/README.md) e o [estado de execução](docs/editor-v6/engine-v3/ESTADO.md). O laboratório Windows usa fixtures sintéticas; não equivale ao benchmark do MP4 completo no computador do usuário.

## Segurança e publicação

O repositório GitHub é **público**. Não versionar projetos pessoais, personagens privados, perfis reais, chaves, tokens, vídeos privados nem bases SQLite de trabalho. A CI opera apenas com testes/fixtures sintéticas. Para mudanças estruturais, use branches curtas e pull requests com auditorias aprovadas.

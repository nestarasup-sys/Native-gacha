# Programa de Refatoração Geral do Native-gacha

Este documento acompanha a execução das Fases 1–6 e complementa a baseline da [Auditoria da Fase 0](./AUDITORIA_REFATORACAO_GERAL_V1_FASE_0.md). As decisões de arquitetura e os resultados das verificações ficam centralizados aqui para evitar relatórios paralelos.

## Regras de execução

- Branch exclusiva: `Dev-V2`. Trabalho local; sem push, PR, merge, rebase, troca de branch ou reset destrutivo.
- Preservar os dados existentes e manter estáveis `window.desktop`, canais IPC, IDs, formatos persistidos e propriedade dos dados por domínio.
- Usar fixtures sintéticas para testes de armazenamento e recuperação.
- Fazer commits locais pequenos, após verificações pertinentes, e atualizar este documento a cada fatia concluída.
- A Fase 0 é a baseline concluída. Fases amplas só serão marcadas como concluídas quando os contratos, verificações e revisão do diff estiverem fechados.

## Estado inicial confirmado

- Branch: `Dev-V2`.
- Commit-base inspecionado: `f416a02a7f9bd73a96282edf57fb00d57aaef83b`.
- Árvore de trabalho estava limpa antes da execução. A referência remota estava sincronizada.
- `npm run audit:architecture`: aprovado, sem imports locais ausentes ou violações de fronteira.
- `npm run typecheck`: falhava em `electron/main.ts:959–960`, por chamar `WebContents.getProcessMemoryInfo`, que não existe no contrato instalado do Electron.
- `npm run test:refactor` na baseline: 617 testes, 611 aprovados e 6 falhas existentes, descritas em “Falhas preexistentes”.
- Node local: `24.18.0`; workflows existentes fixam `22.22.0`. Não atualizar frameworks nem runtime como parte desta execução.

## Progresso por fase

| Fase | Escopo | Estado | Evidência/pendências |
| --- | --- | --- | --- |
| 0 | Auditoria e baseline arquitetural | Concluída antes deste programa | [Relatório da Fase 0](./AUDITORIA_REFATORACAO_GERAL_V1_FASE_0.md). |
| 1 | Electron, IPC, persistência, backups, filas e gates | Em andamento | Corrigida a amostragem de memória do renderer. Ainda mapear as semânticas das filas, gates de CI para `Dev-V2` e extrações seguras do composition root. |
| 2 | Núcleo compartilhado de personagens | Não iniciada | Mapear consumidores e contratos de preview/export antes de extrair regras. |
| 3 | Fabricador e Customizador | Não iniciada | Preservar catálogo-fonte, instâncias e overrides; cobrir ciclo completo de edição. |
| 4 | Studio, Editor V6 e fluxos de vídeo | Não iniciada | Manter engines distintas, paridade de exportação e caminhos legados de dados. |
| 5 | Roteiros, Base de Vídeos, Opções, componentes e CSS | Não iniciada | Preservar propriedade da biblioteca de mídia e bloqueio de referências. |
| 6 | Performance, CI e consolidação | Não iniciada | Medir antes/depois; remover legado somente após comprovar ausência de consumidores. |

## Fatias implementadas

### Diagnóstico de memória do renderer

- **Causa:** o Main chamava `event.sender.getProcessMemoryInfo()`, ausente do tipo/runtime suportado em `WebContents` nesta versão do Electron.
- **Mudança:** usa `app.getAppMetrics()`, seleciona a métrica cujo PID corresponde a `event.sender.getOSProcessId()` e converte os campos documentados em KB para bytes uma única vez. Campo ausente, PID não encontrado ou memória indisponível resulta em `null`. `rendererSharedBytes` continua `null`, pois `MemoryInfo` não o fornece.
- **Contrato preservado:** `RuntimeDiagnosticsSnapshot`, nomes de campo e canal IPC permanecem iguais. A validação de sender do registrador de diagnósticos continua sendo executada antes da coleta.
- **Arquivos:** `electron/application/rendererMemorySnapshot.ts`, `electron/main.ts`, `tests/application/renderer-memory-snapshot.test.mjs`, script `test:refactor` em `package.json`.
- **Commit local:** `697dee891e787c02fce129375c421fee9dc97291` (`fix: map renderer diagnostics from app metrics`).
- **Verificações:** o teste focado passou (4/4); `npm run typecheck` passou; `npm run audit:architecture` passou (563 arquivos TS/TSX, sem violações); `git diff --check` passou. `npm run test:refactor` executou 621 testes: 615 passaram e as mesmas 6 falhas preexistentes permaneceram.

## Falhas preexistentes

As falhas abaixo já estavam na baseline de `f416a02` antes da primeira alteração desta execução. Não foram mascaradas ou removidas:

1. `fabricator-customizer-studio-continuity.test.mjs`: importação do par espelhado de sobrancelhas espera contagem `2`, recebe `0`.
2. Mesmo arquivo: importação de atlas ocular espera `{'eye-left':'eye-left'}`, recebe `{}`.
3. Mesmo arquivo: importação de detalhe facial lança `TypeError` ao acessar `id` de valor indefinido.
4. `renderizador deve usar um pivô por peça...`: expectativa estrutural antiga por `layer.push({ group, ...item })` não corresponde à implementação atual.
5. `a página delega deformação ao hook...`: expectativa por `hasDirtyWarpImage(component.id)` não corresponde à implementação atual.

O Node test runner conta também a suíte agregadora que contém as três primeiras falhas; por isso reporta seis falhas no total: cinco casos com asserções que falham e o grupo agregado. As falhas 1–3 pertencem ao fluxo Fabricador/Customizador e serão investigadas na Fase 3; as falhas 4–5 serão verificadas ao mapear geometria compartilhada e seu consumidor Fabricador, nas Fases 2–3. Nenhuma correção deve enfraquecer esses contratos de teste sem evidência.

## Decisões e riscos abertos

- A extração de `electron/main.ts` precisa preservar ordem de bootstrap, injeção de dependências, autorização IPC, flush de escrita e recuperação no encerramento.
- As filas de persistência não serão fundidas só por semelhança de sintaxe. Antes, documentar e testar se propagam falha para flush, permitem gravações seguintes após falha e serializam por chave/slot.
- `Fabricador` continua proprietário do catálogo-fonte; `Customizador` da instância e personalizações do personagem; `Studio` do documento/cena; `Editor V6` do projeto/timeline. Consumidores se ligam por IDs explícitos.
- Os caminhos legados `video-studio.media` e `video-studio.backgrounds` permanecem protegidos enquanto houver consumidores de dados. Não restaurar a UI/rota antiga.
- Nenhuma alteração de schema, migração, exclusão de assets ou formato salvo foi incluída nesta fatia.

## Registro de commits

| Commit | Fatia | Estado |
| --- | --- | --- |
| `697dee891e787c02fce129375c421fee9dc97291` | Diagnóstico de memória do renderer e testes | Local em `Dev-V2`; sem publicação. |


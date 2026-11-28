# Rodada 1.6 — limpeza do workspace

## Resultado

- Editor V7 removido do produto: rota, navegação, preload/IPC, inicialização e encerramento do export, CSS, métricas de rota, scripts e testes.
- Código e documentação próprios do V7 foram movidos para `pasta do lixo/Editor V7/`. A pasta é ignorada pelo Git e serve como arquivo local reversível.
- Prompts encerrados das rodadas 1.4 e 1.5 foram arquivados. Relatórios, medições e dados associados ao V6 permanecem ativos.
- Auditoria IPC/preload substituída foi arquivada porque contava canais e domínios que deixaram de existir.
- Cinco diretórios vazios e sem referência foram guardados em `pasta do lixo/Estrutura vazia/`. Também arquivei `out/round13-worktree-head/`, que só continha um junction `node_modules` para a instalação ativa e não tinha referências.

- Runs do Editor V6 que estavam em `D:\editor-v6-stress-runs-Dev-V2` foram recuperados em `out/editor-v6-stress/runs/`; 443 arquivos foram copiados e conferidos por SHA-256 antes da troca do diretório parcial. As séries combinada e de qualidade da rodada 1.5 conferem com os hashes publicados no relatório. `runs-local-backup-2026-11-24` foi mantida como backup; a pasta parcial anterior foi arquivada no lixo.
- Snapshots das worktrees NUT e round15, patches locais, fontes não rastreadas e saídas foram arquivados em `pasta do lixo/Disco D/importacao-editor-v6-2026-11-24/`. O código NUT local estava experimental e não foi aplicado ao produto. Os diretórios D foram desregistrados do Git; restam somente junctions `node_modules` apontando à instalação ativa, preservados porque o Windows bloqueou a remoção do diretório por política de segurança.

## Evidência e limites da limpeza

- A rota performance continua cobrindo as áreas ativas; o teste de contrato foi ajustado para refletir isso.
- `out/editor-v6-stress/dumps/` ocupa cerca de 48,7 GiB. Mantive os dumps porque relatórios ativos referenciam seus hashes e os descrevem como evidência de benchmark. `out/round13-worktree-cc9d02b0/` também permanece porque o checkpoint da rodada 1.3 aponta para resultados nele. Mover esses arquivos quebraria os caminhos de proveniência.
- `out/main`, `out/preload`, `out/renderer`, `out/native`, `node_modules`, `resources/video-tools`, `app-data`, `HTMLS PESSOAIS` e worktrees registrados foram preservados: são build/dependências, ferramentas, estado local/pessoal ou trabalho ativo. Não inspecionei conteúdo pessoal.
- No início da rodada havia 73 commits locais à frente de `origin/Dev-V2`; com o commit 1.6 são 74. A maioria registra trabalho pedido do V6. Após `git gc` normal, o Git reporta 23,69 MiB em dois packs, sem objetos soltos, expirados ou lixo. Antes eram 27,76 MiB entre compactados e soltos. Reescrever o histórico não é uma limpeza segura nem relevante para o espaço ocupado.
- `pasta do lixo/` é local e ignorada. O arquivamento não reduz espaço em disco; libera a árvore ativa e mantém reversibilidade. Para recuperar espaço real seria necessário apagar dados ou mover o arquivo para outra unidade, ações fora do pedido atual.

## Verificações

- `npm run typecheck`: passou.
- `npm run audit:architecture`: passou (890 arquivos TS/TSX; sem importações locais ausentes ou violações de fronteira).
- Teste focado `tests/route-performance-model.test.mjs`: 2/2 passaram.
- `npx electron-vite build`: passou para main, preload e renderer. O build C++ do renderer nativo não foi repetido, pois não houve alteração no código nativo.
- `git diff --cached --check`: passou após preparar o commit.

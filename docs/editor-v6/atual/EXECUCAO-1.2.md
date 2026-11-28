# Execução 1.2 — auditoria e medição

## Preflight — Fase 0 (21/11/2026)

- Raiz: `C:\TRABALHO 2\OUTROS\GACHA EM C++`; branch `Dev-V2`; commit recebido `cc9d02b04ad50c542ebf432d8f1738e43bb0e06d`.
- Estado recebido limpo. Leia-me mestre, execução 1.1, testes 1.1 e análise externa consultados antes de editar.
- Linha de base: `npm run typecheck` passou; `npm run audit:architecture` passou (891 TS/TSX, zero violações); suíte V6 passou (186 arquivos, 890 testes, 1 ignorado); `npm run test:refactor` passou (50 comandos).
- Gate 0: aprovado.

## Fase 1 — auditoria de `cc9d02b0` (21/11/2026)

- **Cobertura do grupo:** extraí da versão anterior do `package.json` e comparei nomes de testes. 126 antes e 126 agora; ausentes: nenhum; extras: nenhum. Comparação de arquivos individuais, não só de contagem.
- **Quatro contratos de teste:** `base-videos-architecture` atualiza os nomes padrão e inclui o canal/API novos; `renderer-pending-persistence` acompanha operações movidas aos comandos de mídia da timeline e ao controller de export; `studio-cast-panel` acompanha o modal que agora compõe o painel compartilhado; `studio-concurrent-assets` acompanha a normalização de recorte que passou a ser dona da concorrência e a nova assinatura do catálogo. Classificação: realocação/renomeação legítima; nenhuma asserção removida ou enfraquecida. Há verificações adicionais do canal, API e operações.
- **Runner:** aceita arquivo de grupos opcional para fixture, para no primeiro código diferente de zero, exibe explicitamente índice e comando que falhou e propaga o exit code. Fixture temporária `node -e "process.exit(7)"`: saída `FALHOU (código 7)` e runner retornou 7. Arquivo de fixture removido.
- **Constantes:** busca em módulos do V6 encontrou somente `-ar 48000` no mux final. Troquei pela constante `EDITOR_V6_AUDIO_SAMPLE_RATE`. Nova busca por `/30`, `*30`, `1600` e `48000` não encontrou ocorrências nos diretórios V6.
- **Busca binária:** testes agora cobrem lista vazia, singleton, duplicatas, alvo antes do primeiro, correspondência, intervalo entre chaves e alvo depois do último para limites inferior e superior.
- **Verificações após correção:** testes focados passaram (2); `npm run typecheck`, `npm run audit:architecture` e `git diff --check` passaram.
- **Controle/candidato de export:** não aplicável nesta fase de auditoria, sem alteração do caminho do export.
- **Decisão:** aprovado; nenhum teste perdido nem contrato afrouxado. Runner e literal de áudio corrigidos. Commit registrado após a revisão desta fase.

## Fase 2 — medições e gates

### 2A — quadros do corte `[0, 6000)`

Controle: projeto autorizado em cópia verificada, 6.000 quadros, 1080p/30, 4 workers CPU, 10 partes (600 quadros), preset de cabelo 2. No total, 1.654 capturas renderizadas e 4.346 quadros reutilizados; 6.000 gravações ao pipe.

| Trecho                    | Corridas | Corridas repetidas | Quadros repetidos/elegíveis | Média / mediana / máx. | Bytes brutos |          Evitáveis | Fundo estático / primeiro plano mudou |
| ------------------------- | -------: | -----------------: | --------------------------: | ---------------------: | -----------: | -----------------: | ------------------------------------: |
| Sem vídeo (600 quadros)   |      169 |                 92 |                         431 |          3,55 / 2 / 36 |     4,977 GB |  3,575 GB (71,83%) |                                     0 |
| Com vídeo (5.400 quadros) |    1.485 |                708 |                       3.915 |          3,64 / 1 / 54 |    89,580 GB | 64,945 GB (72,50%) |                                 1.476 |
| Total                     |    1.654 |                800 |                       4.346 |                      — |    94,557 GB | 68,520 GB (72,46%) |                                 1.476 |

“Evitáveis” significa um bitmap por corrida, mantendo o último; não é uma economia implementada nem medida em MP4.

### 2B — espera de parede e CPU

- União de intervalos monotônicos dos 10 workers: bloqueio total do pipe 79,155 s; bloqueio em gravações repetidas 69,453 s. Workers se sobrepõem; usei união global, não a soma dos intervalos.
- Clique→MP4 validado: 172,725 s. A união dos bloqueios repetidos equivale a 40,21% desse tempo e 58,03% dos 119,704 s da fase de renderização. O limiar definido era 8%.
- CPU por amostra de parede, somando processos com o mesmo papel: FFmpeg média/p50/pico 457,2/492,1/815,9%; renderer de export 70,2/35,7/462,4%; processo principal 78,2/92,6/142,7%. CPU acima de 100% representa múltiplos núcleos.
- Uma tentativa anterior falhou em “write UNKNOWN” no quadro 2.756; retentativa sem captura de hashes passou. Causa não confirmada, portanto não atribuo a falha à opção de hashes. A limpeza passou.

### 2C — perfil da interface

- Perfil em fixture grande sintética: 752 blocos / 4 personagens para reprodução e 284 blocos para edição/arraste. Sessenta segundos de playback: 60 Hz de callbacks RAF, ~30 atualizações de cena/s, p95 RAF 16,7 ms, sem lacunas de frame.
- Callbacks do Profiler por 60 s: `/editor-v6/page` 3.611; cena 3.603; timeline 1.811; superfície 1.803; áudio 1.803. Áudio e timeline assinam o relógio e usam a mudança de frame; não os classifico como desnecessários.
- Seek/duplicação sintética na timeline completou em 819 ms, com duplicação (7→8 blocos), pausa/retomada e seek válidos. O harness não editou pose e fundo pela interface.
- Arraste sintético no palco: 30,079 s, 548 movimentos. Antes da memoização, callback do profiler do trilho: 534 notificações, duração média 1,05 ms; depois, 554 notificações e duração média 0,02 ms. A contagem do callback inclui commits descendentes; duração do trabalho caiu ~98% com conteúdo do trilho estável.
- Duas tentativas do harness falharam antes de medir por seletores DOM antigos; foram corrigidos para inspetor e personagens atuais. Apenas a execução final entra nos números.

### 2D — índices WeakMap

- Adicionado contador que só existe quando o teste instala o hook; a produção não acumula contadores.
- Quatro edições sintéticas: mover bloco, atualizar pose, editar fundo e adicionar clipe. Índices de fundos e vídeos reconstruíram 4 vezes cada (uma por identidade de timeline), sem exceder N=4. Base de personagem não foi acionada porque o fixture não tinha balão vinculado; índice de movimento não foi exercitado.
- Regressão em `tests/editor-v6/editorV6Scene.test.ts`.

### 2E — controle repetido

- Cópia de projeto autorizado: 10.254 arquivos, 4.701.797.716 bytes; manifesto/SHA-256 verificados antes e depois.
- Três exports válidos de 200 s: 169,370 s; 169,435 s; 170,353 s. Mediana **169,435 s**, mínimo **169,370 s**, variação 0,58%. 6.000 quadros, nove emendas, H.264/AAC, validação e limpeza passaram.
- Diagnóstico completo usou instrumentação opt-in em árvore de trabalho suja; os três controles são o baseline limpo. Nenhuma mudança do pipeline foi promovida.

### Gate 2

- **Fase 3 liberada para laboratório:** 72,46% de bytes evitáveis e 40,21% do tempo total bloqueado em gravações repetidas excedem os limites.
- **Fase 5 liberada de forma limitada:** arraste mostrou trabalho evitável no trilho; duração caiu ~98% após estabilizar callbacks e memorizar o componente. A contagem pura do callback Profiler não representa renderizações do componente.
- **Fase 5 de índices não liberada:** hipótese “≤ N” não foi refutada.

## Fase 3 — laboratório de timestamps

- Teste sintético NUT com três quadros BGRA distintos e PTS em 0, 1 e 4 s; `fps=30` recuperou 121 quadros e as três cores nas posições esperadas. Após registrar o resultado, os três arquivos temporários foram removidos de `out/`.
- Isso prova a etapa FFmpeg/NUT, mas não implementa escritor NUT Node no caminho atual nem compara captura/MP4/AAC, 6.000 quadros, emendas, cancelamento e memória. `rawvideo` não representa timestamps variáveis; omitir quadros no produto mudaria o protocolo.
- **Decisão:** não promover. Sem escritor, as comparações de 40 s e 200 s não são aplicáveis com rigor. Próxima hipótese: prototipar escritor NUT mínimo e validar A/V/endpoints antes de medir velocidade.

## Fase 4 — spike WebCodecs

- Em localhost seguro, Chromium/Electron 45.3.1 aceitou `avc1.64001f` com preferências hardware e software; ambos codificaram 60 quadros de canvas com PTS monotônicos e sem erro. Saídas: 249.997 e 38.045 bytes. A preferência não confirma o encoder de hardware efetivamente usado.
- Não validei pixels do compositor V6, BT.709/faixa TV, alfa, AAC, drift, emendas/GOP, fila/memória nem 3 repetições de 40 s. Não há prova de qualidade equivalente ou ganho ≥30%.
- **Decisão:** inconclusivo, sem mudança de produto. Próximo passo é conectar compositor V6 à fixture e comparar pixels antes do mux.

## Fase 5 — fronteira de renderização

- Playback é dominado por assinantes de frame (timeline, áudio, cena); filhos que não assinam frame ficam em cerca de 3 notificações ao longo de 60 s.
- Durante drag, `EditorV6ToolRail` recebia callbacks inline novos por render da página. Estabilizei handlers via refs/callbacks e apliquei `memo`; os handlers continuam atuais. No perfil pareado, duração do trilho caiu de 1,05 ms para 0,02 ms por notificação, cerca de 98% menor.
- Não unifiquei `activeEditorV6Id`, seu ref e `activeProject.id`: o ID local seleciona a sessão e filtra o snapshot; o ref acompanha o ID atual para comandos assíncronos; `activeProject` contém o documento carregado e pode estar vazio enquanto abre/fecha. `selectedId` é a seleção do navegador. São conceitos relacionados, com ciclo de vida distinto.
- Não extraí hooks de biblioteca/elenco/sessão: o perfil não atribuiu custo relevante a essas áreas. A página segue acima de 300 linhas; não forcei extrações sem medição.
- **Decisão:** promovida apenas a memoização do trilho; sem alterar IDs, schema, canais ou persistência.

## Fase 6 — higiene

- Prettier configurado com largura 120, sem ponto e vírgula, aspas simples; `npm run format:changed` formata somente arquivos novos/alterados suportados. ADR: `docs/architecture/ADR-001-prettier-touched-files.md`.
- `docs/lixo/INDICE.md` foi gerado com 126 linhas para inventariar 122 documentos históricos. Após a aprovação do usuário, o conteúdo foi conferido no ZIP de 123 arquivos (incluindo o índice) e removido da árvore; a pasta `docs/lixo/` não existe mais.
- 141 scripts npm examinados; 34 sem referência literal fora do manifesto. Inventário em `docs/architecture/npm-scripts-reference-inventory.md`. Nenhum agrupamento/remover por falta de equivalência demonstrada.
- `.nvmrc` e workflows alinhados em 22.23.5. `out/`, `app-data/`, recursos locais, bancos e zip de diagnóstico são ignorados. O zip indicado pela análise não está na raiz; há um thumbnail versionado já dentro de `scripts/diagnostics/`. `ABRIR_DESENVOLVIMENTO.bat` já era versionado; foi preservado e excluído dos commits desta tarefa.
- Instalação do Prettier reportou 6 vulnerabilidades moderadas no conjunto instalado; não apliquei correção automática.

## Fase 7 — relatórios somente leitura

- `docs/architecture/main-process-responsibilities.md`: responsabilidades, ordem de inicialização/encerramento e extrações possíveis.
- `docs/architecture/data-layer-audit.md`: SQLite, migração, backup/restore, hashes e referências; nenhum schema alterado.
- `docs/architecture/ipc-preload-validation-audit.md`: 180 registros e 167 chamadas explícitas de origem em 40 arquivos; considera guards de domínio e canais privados de worker.
- `docs/architecture/fabricator-extraction-map.md`: extração por risco sem mover o catálogo-fonte.
- `docs/architecture/editor-v7-scene-contract-decision.md`: V7 mantém resolvedor próprio e pode compartilhar só primitives neutras.

## Fechamento da rodada

- Suíte V6 após recuperar os testes preexistentes do pipeline: **892 aprovados, 1 ignorado**; 186 arquivos passaram e 1 foi ignorado. Testes focados de cena/pipeline: 21 aprovados. `test:refactor`: 50/50 grupos concluídos.
- `npm run typecheck`, `npm run audit:architecture` (891 arquivos, zero violações), `npm run build` (incluindo compilação nativa) e `git diff --check` passaram. Nenhum teste C++ foi executado.
- Os Markdown ativos de `docs/editor-v6/atual/` e os cinco relatórios novos de arquitetura ficam abaixo de 300 linhas. O índice mestre já aponta para esta execução.
- Nenhuma alteração de produto na Fase 3 ou 4: NUT ainda não representa o contrato completo do export; WebCodecs não provou equivalência visual/AAC/sincronismo nem ganho de 30%. A memoização do trilho na Fase 5 é a única otimização promovida nesta rodada.
- Fase 6 concluída após autorização: o usuário removeu os **123 originais** depois da verificação conteúdo a conteúdo do ZIP. Na época, o pacote foi registrado em `out/editor-v6-stress/runs/proposals/docs-lixo-archive-proposal-2026-11-21.zip`, SHA-256 `B9A5D49F9447C46FC86CAD297F89718FF6B8D95F39D539D5B6A629EB9224CC2F`.

**Nota de estado atual (26/11/2026):** a busca pelo nome exato não encontrou o ZIP em `out/editor-v6-stress/runs`, `runs-local-backup-2026-11-24`, `pasta do lixo` nem na cópia conhecida `D:\EDITOR-V6-ARQUIVO-PRESERVADO-1.7`. O hash acima permanece como registro histórico, mas o link antigo não está disponível neste checkout. Não recriar o ZIP a partir dos relatórios; as 123 fontes originais foram removidas após a validação histórica.
- Commits locais: auditoria `5944df5c`; medições `204401ff`; otimização da interface `e80e604f`; spike WebCodecs `991d1e9d`; fixture IPC portátil `1cdcd3f3`; formatter/inventário `5dc486e1`; relatórios arquiteturais `43d67a1a`. Sem push.

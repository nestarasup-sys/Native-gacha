# Programa de Refatoração Geral V2 — Native-gacha

Este documento continua a [auditoria da Fase 0](./AUDITORIA_REFATORACAO_GERAL_V1_FASE_0.md) e o [programa V1](./PROGRAMA_REFATORACAO_GERAL_NATIVE_GACHA.md). O escopo e os critérios completos estão no [pedido V2](../CODEX_REFATORACAO_GERAL_V2_LOGS_DEV.md); este arquivo registra a execução, as decisões, as evidências e as pendências sem duplicar aqueles documentos.

## Regras e estado do Git

- Branch exclusiva: `Dev-V2`; todo o trabalho permanece local. Sem push, PR, merge, troca de branch, rebase ou reset destrutivo.
- Baseline V2: `02e617e5d0db93b5f0c26d04da4faf5f2db8d8bb` (`fix(editor-v6): pack motion atlases efficiently`), sincronizada com `origin/Dev-V2` em 2026-11-02.
- No início havia apenas o Markdown V2 fornecido pelo usuário como arquivo não rastreado. Ele é fonte de instruções, permanece intacto e não entra nos commits.
- Dados pessoais em `app-data`, mídia e perfil local não são fixtures. Persistência, canais IPC, IDs, formatos salvos e contratos de propriedade dos domínios são preservados.

## Reconciliação da V1 — Ciclo A

| Ciclo V2 | Estado confirmado | Evidência e trabalho que continua |
| --- | --- | --- |
| A — Reconciliação | Concluído nesta baseline | A Fase 1 da V1 já corrigiu métricas de memória do renderer via `app.getAppMetrics()` e PID do `WebContents`, extraiu o ciclo de encerramento e documentou filas distintas. A Fase 2 centralizou somente geometria idêntica de escala-base. Os testes gerais e os testes atuais confirmam essa base; não repetir essas extrações. |
| B — Logs Dev | Em andamento | O menu ainda chama a área de `Opções`, a rota canônica ainda é `/opcoes` e a tela concentra visão geral, eventos, desempenho, armazenamento, backup e migração em `OptionsPage.tsx`. Existe logger JSONL limitado a 500 eventos e sanitização básica; faltam navegação nova, áreas independentes, busca/filtros completos, eventos estruturados opcionais, painel de processos/CPU, prévia do relatório e auditoria ampliada de privacidade/flood. |
| C — Fabricador e Customizador | Parcial | A V1 extraiu modelos/comandos e criou regressões para catálogos, persistência, roupa, cabelo, pose e Animator. Os workspaces maiores ainda concentram sessão, interação de canvas, renderização e comandos. Revisar também as alterações posteriores da Dev-V2, incluindo tronco masculino independente, sapatos pareados e preferência de camada por personagem. |
| D — Electron e núcleo compartilhado | Parcial/consolidação | A correção de memória e o núcleo de geometria comum permanecem. A auditoria geral ainda deve confirmar ordem dos handlers, segurança, operações síncronas no Main, cancelamento e limites de memória. Manter `window.desktop`, validação de remetente e filas com semânticas diferentes. |
| E — Studio e Editor V6 | Parcial | A V1 isolou comandos de cena e timeline, corrigiu thumbnail e validou exportação facial e paridade Turbo. O HEAD contém o empacotamento de atlas de movimento, cuja eficiência e limite de memória precisam ser medidos com fixtures sintéticas. Continuam pendentes revisão visual e cobertura dos fluxos de áudio/vídeo, recuperação e reabertura. |
| F — Roteiros, Base de Vídeos e interface | Parcial | Fronteiras de arquivos/IDs, metadados e referências estão protegidas; há comandos e filas testados em Base de Vídeos e extrações em Roteiros. A criação/edição/importação restante e a decomposição de páginas ainda precisam ser avaliadas. CSS global segue em migração gradual, com equivalência visual. |
| G — Performance, segurança e testes | Parcial | CI local da Dev-V2 e vários benchmarks sintéticos já existem. Faltam inventário completo dos gates, auditoria de logger/IPC, medições reproduzíveis de inicialização/interação e métricas de renderer/processos auxiliares. Não inferir ganho de interface a partir de benchmark sintético. |

## Baseline executada em 2026-11-02

Todas as verificações abaixo ocorreram localmente antes da alteração de código e usaram apenas testes/fixtures existentes; a suíte de refatoração foi repetida com saída temporária fora do repositório.

| Verificação | Resultado |
| --- | --- |
| `npm run typecheck` | Aprovado. A falha de `electron/main.ts:959–960` registrada na baseline V1 já estava corrigida. |
| `npm run audit:architecture` | Aprovado: 611 arquivos TypeScript/TSX, zero imports locais ausentes e zero violações de fronteira de feature. |
| `npm run test:geometry` | Aprovado: 5/5. |
| `npm run test:editor-v6` | Aprovado: 223 testes passaram e 1 foi ignorado; 39 arquivos passaram e 1 foi ignorado, além do perfil de exportação 11/11. |
| `npm run test:refactor` | Aprovado: suíte principal 647/647 e todos os comandos encadeados concluídos com código 0. |
| `npm run build` | Aprovado. |

Ambiente observado: Node 24.18.0 (workflow fixa Node 22.22.0), Electron 45.1.0, React 19.3.1, React Router 8.5.1, Vite 8.3.5, Vitest 5.0.5 e TypeScript 6.0.2. A pesquisa de APIs do Electron deve usar a documentação compatível com a versão instalada. Nenhum framework ou banco novo está justificado.

## Decisões técnicas da V2

- `/logs-dev` será a rota canônica; `/opcoes` continuará funcionando como entrada compatível. Canais `app:diagnostics:*` e os demais nomes IPC não mudam por causa do rótulo.
- A interface será separada por áreas sem remover armazenamento, backup, restauração, migração, eventos ou relatório existentes. Leituras custosas permanecem sob demanda e a migração fica identificada como ferramenta legada.
- Os eventos JSONL antigos continuam legíveis. Metadados novos serão opcionais, validados e sanitizados no Main; nenhum conteúdo de personagem, roteiro, nome/caminho de arquivo ou payload IPC será coletado.
- Métricas devem dizer processo, horário e semântica (amostra, média ou pico). `app.getAppMetrics()` fornece CPU média desde a chamada anterior e informa memória em KB; não chamar em intervalos ocultos nem somar o Main como se fosse memória total do app.
- Toda melhoria de performance exige perfil e comparação sob condições equivalentes. Fixtures sintéticas e testes podem usar a capacidade disponível da máquina; execução do usuário em outro programa não invalida testes funcionais, mas deve ser anotada em benchmark interativo.
- Cada fatia será revisada, validada, documentada e commitada localmente antes da próxima. O diff de cada commit inclui somente arquivos da fatia e da documentação V2.

## Referências técnicas consultadas

- Electron 45.1.0 — [`app.getAppMetrics`](https://www.electronjs.org/docs/v45.1.0/api/app#appgetappmetrics), [`ProcessMetric`](https://www.electronjs.org/docs/v45.1.0/api/structures/process-metric), [`MemoryInfo`](https://www.electronjs.org/docs/v45.1.0/api/structures/memory-info) e [`CPUUsage`](https://www.electronjs.org/docs/v45.1.0/api/structures/cpu-usage): amostra de processos, unidades KB e CPU desde a chamada anterior.
- Electron — [segurança](https://www.electronjs.org/docs/latest/tutorial/security), [IPC](https://www.electronjs.org/docs/latest/tutorial/ipc) e [performance](https://www.electronjs.org/docs/latest/tutorial/performance): validar remetentes, expor API mínima pelo preload e medir antes de otimizar.
- React — [You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect): efeitos para sincronização externa, eventos e valores derivados tratados em eventos/renderização.

## Progresso e pendências

### Logs Dev

1. [x] Renomear item, criar rota canônica e manter `/opcoes` compatível; testar captura/perfil por rota.
2. [x] Separar a tela em áreas acessíveis sem quebrar backup, restauração, migração e exportação.
3. [ ] Criar modelo puro para busca, filtros, ordenação, intervalo de tempo e paginação/limite; testar eventos antigos e campos opcionais.
4. [ ] Estruturar detalhes, cópia e exportação apenas dos eventos filtrados com sanitização no Main e limites IPC.
5. [ ] Implementar painel sob demanda por processo com memória/CPU corretamente identificadas, ausência de métricas e cancelamento.
6. [ ] Pré-visualizar o resumo do relatório e incluir métricas somente quando tenham sido explicitamente coletadas.
7. [ ] Auditar flood, deduplicação/contagem, segredos, URLs, erros no logger, leitura e gravação concorrentes.
8. [ ] Revisar acessibilidade, erros, testes reais disponíveis, diff e commit final do ciclo.

### Próximos ciclos gerais

- [ ] C: inventariar tamanhos e ownership dos workspaces, escolher decomposições com fronteiras verificáveis e ampliar fluxos de criar/editar/salvar/reabrir sem tocar catálogo-fonte.
- [ ] D: concluir auditoria de segurança/IPC, recuperação, recursos e bloqueios do Main; validar tronco masculino e sapatos em todos os renderizadores consumidores.
- [ ] E: avaliar atlas de movimento e completar fixtures de áudio/vídeo, timeline, assets, geometria, paridade de preview/export e ciclo de vida de workers.
- [ ] F: fechar operações pendentes de Roteiros/Base de Vídeos; mover CSS por feature com comparações visuais e sem redesign.
- [ ] G: comparar inicialização, interação, memória, salvamento e exportação; revisar workflows/gates sem enfraquecer permissões ou duplicar builds.

## Registro de fatias

| Data | Ciclo/fatia | Resultado e verificações | Commit |
| --- | --- | --- | --- |
| 2026-11-02 | A — baseline e reconciliação V1 | Baseline aprovada conforme a tabela acima; estado do Git preservado. | `72ae218` (`docs: record refactor v2 baseline`). |
| 2026-11-02 | B1 — navegação e identidade da Logs Dev | `Logs Dev` passa a ser o item do menu e título da página; `/logs-dev` é canônica e `/opcoes` redireciona com `replace`. A captura de erros, logger Main e perfil de interface reconhecem as duas rotas através de uma lista compartilhada; canais IPC e operações existentes não mudaram. `npm run test:options:diagnostics` 8/8, `npm run typecheck`, `npm run audit:architecture` (612 arquivos), `npm run build` e `npm run test:refactor` (647/647 mais toda a cadeia) passaram. Uma primeira execução do teste geral revelou apenas que o import direto de TypeScript no runner Node precisava da extensão `.ts`; corrigido e validado na repetição. | `d9f64b6` (`feat(logs-dev): add canonical route and legacy redirect`). |
| 2026-11-02 | B2 — áreas da Logs Dev | Navegação acessível organiza Visão geral, Eventos e logs, Desempenho, Armazenamento, Backups e recuperação e Ferramentas Dev. Cada painel é montado sob demanda; catálogo/migração continuam sob a seção avançada, e os estados/casos de uso existentes permanecem no componente pai. `npm run test:options:diagnostics` 9/9, `npm run typecheck`, `npm run audit:architecture` (614 arquivos), `npm run build` e `npm run test:refactor` (647/647 mais toda a cadeia) passaram. | `1370238` (`feat(logs-dev): split diagnostics into sections`). |

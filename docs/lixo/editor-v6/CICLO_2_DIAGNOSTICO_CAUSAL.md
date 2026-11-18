# Ciclo 2 — Diagnóstico causal dos picos do Editor V6

**Data:** 26/10/2026
**Branch:** `Main-desenvolvimento`
**Base inspecionada:** `9f2377ea4373c15c7fc182a0f2b528bcdde68165`

## Resumo

A captura CDP agora ocorre dentro da mesma janela de reprodução medida. Uma trace de 30 s do cenário pesado contém 482.558 eventos brutos e 402.003 eventos normalizados. Os marcadores pareados entre `performance.now()` e o relógio monotônico CDP alinharam com residual máximo de **0,0757 ms**; um intervalo artificial de 256,2 ms foi medido com erro de **0,004 ms**.

Foram observados picos com trabalho React/JavaScript significativo e outros dominados por espera do compositor e eventos de GC. Isso demonstra que há mais de um padrão de interrupção, mas a trace exportada pelo Chromium não expôs o campo `dataLossOccurred`; a integridade completa permanece **não confirmada**. Portanto, as atribuições abaixo são evidências de sobreposição temporal, não prova final de causa. Nenhuma otimização de produto foi aplicada com base apenas nessa associação.

A comparação A/B limpa, sem CDP, mostrou que a memoização reduz o tempo cumulativo de renderização da superfície React, mas não demonstrou melhoria confiável de RAF, long tasks ou saltos de quadros. Três pares de imagens foram idênticos pixel a pixel. A auditoria não encontrou invalidação visual ausente no comparator.

## Arquitetura observada

O fluxo de playback resolve o instante da timeline em `shared/editorV6Timeline.ts`; o relógio e o estado de reprodução vivem no Editor V6 e alimentam `EditorV6Page.tsx`. A cena resolvida chega a `EditorV6PlaybackScene.tsx` e `SceneSurface.tsx`, onde SVG, imagens e elementos de mídia formam a prévia. Os componentes `SceneLayer` são memoizados por comparação de propriedades visuais. O Profiler React e a coleta agregada ficam em `ui/performanceDiagnostics.ts`. O teste de estresse abre o app Electron com perfil temporário, prepara quatro personagens STRESS por meio do renderer real e observa a página via CDP. O caminho de exportação continua separado; esta missão não alterou IPC, persistência, projeto ou FFmpeg.

## Método temporal e limites

- `performance.now()` é a referência dos marcadores, RAF, DOM, React Profiler e PerformanceObserver. `performance.timeOrigin` é registrado como contexto, sem somá-lo a timestamps monotônicos.
- Marcadores `performance.mark` identificam cenário, calibração e fronteiras da janela. O analisador encontra os marcadores correspondentes no trace `blink.user_timing`, converte `ts` em microssegundos e estima um deslocamento comum.
- O trace usa CDP `Tracing` com `ReturnAsStream`, reduzindo a pressão do buffer em comparação com coleta de eventos acumulados em memória. A coleta pesada fica em comando separado do benchmark limpo.
- O benchmark A/B é executado sem tracing CDP. Portanto, números do trace instrumentado não são comparados diretamente com os números A/B.
- A versão Electron/Chromium desta execução não entregou `dataLossOccurred` no metadata nem no envelope armazenado. O analisador registra `null` e rebaixa a confiança. O stream foi integralmente lido e o Chromium emitiu 482.558 eventos, mas isso sozinho não prova ausência de eventos descartados.
- O renderer de teste fica fora dos monitores, com throttling em segundo plano desativado. Isso não mede a apresentação física numa janela visível.

## Cinco maiores picos observados na trace

Tempos relativos ao início dos 30 s. O quinto evento é um intervalo de 26,9 ms, selecionado por exceder 1,8× a cadência RAF de referência (13,3 ms); não foi uma long task.

| # | Cenário / tempo | Duração | Thread e evento superior | Categorias exclusivas predominantes | React / RAF | Confiança e evidência |
|---:|---|---:|---|---|---|---|
| 1 | Pesado, 8,187 s | 79,7 ms | `CrRendererMain`, `ThreadControllerImpl::RunTask` (62,460 ms inclusivos; 0,003 ms exclusivos) | espera de compositor 57,087 ms; GC 6,486 ms; JavaScript 6,017 ms; paint/composição 3,443 ms | Commits de superfície 0,7 ms; RAF 79,7 ms | Insuficiente para atribuição causal: evento CDP de perda não foi fornecido; compositor/GC e RAF apenas se sobrepõem. |
| 2 | Pesado, 16,524 s | 79,5 ms | `CrRendererMain`, `ThreadControllerImpl::RunTask` (68,672 ms inclusivos; 0,003 ms exclusivos) | espera de compositor 63,377 ms; JavaScript 5,671 ms; GC 4,731 ms; paint/composição 2,838 ms | Commits de superfície 0,7 ms; RAF 79,5 ms | Mesmo limite de integridade; baixa atividade React nessa janela. |
| 3 | Pesado, 16,457 s | 61,3 ms | `CrRendererMain`, `ProxyMain::BeginMainFrame` (61,583 ms inclusivos; 0,217 ms exclusivos) | JavaScript 59,661 ms; paint/composição 0,627 ms; layout 0,376 ms | Superfície 37,8 ms; cena 38,1 ms; página 39,2 ms; RAF 53,0 ms | React Profiler e `FunctionCall` do React cobrem parte importante do intervalo, mas o stack aponta para `react-dom_client.js`, não para uma função de aplicação. Associação moderada, sem causalidade provada; integridade permanece não confirmada. |
| 4 | Pesado, 8,120 s | 60,7 ms | `CrRendererMain`, `ThreadControllerImpl::RunTask` (60,037 ms inclusivos; 0,008 ms exclusivos) | JavaScript 58,073 ms; paint/composição 1,029 ms; layout 0,409 ms; scheduling 0,270 ms | Superfície 36,4 ms; cena 36,9 ms; página 38,1 ms; RAF 53,3 ms | React/JavaScript ocupam parte do mesmo intervalo; função identificada apenas dentro de React DOM. Associação moderada, causalidade não provada; integridade permanece não confirmada. |
| 5 | Pesado, 24,834 s | 26,9 ms | `CrRendererMain`, `ProxyMain::BeginMainFrame` (aprox. 26,9 ms inclusivos) | RAF gap / scheduling; sem React Profiler substancial associado | Sem commit React associado; RAF 26,9 ms | Anomalia RAF menor que long task; atribuição insuficiente porque o evento superior pode envolver espera/composição e a integridade do trace é desconhecida. |

O próximo gap foi 26,3 ms em 24,860 s, também sem long task. As durações inclusivas não são somadas aos filhos. As categorias são tempo exclusivo agregado dentro da thread; ainda assim, eventos assíncronos sobrepostos não devem ser interpretados como serialização causal.

## Métricas da execução instrumentada

| Métrica (cenário pesado, 30 s com trace) | Resultado |
|---|---:|
| RAF p50 / p95 / p99 / máximo | 13,3 / 13,6 / 13,7 / 79,7 ms |
| Intervalos RAF acima de 33,3 / 50 ms | 4 / 4 |
| Long tasks / duração acumulada | 4 / 251 ms |
| Commits da página / commits máximos | 904 / 39,2 ms |
| Resolução da cena p95 / máxima | 0,2 / 0,3 ms (1.794 amostras) |
| Frames lógicos saltados / gaps DOM | 2 / 2 |
| Pico do heap JavaScript | 94.458.794 bytes (~90,1 MiB) |
| Eventos GC no trace renderer | 3.476 eventos GC/slices classificados; não equivale a pausas exclusivas nem prova de causa |
| PerformanceObserver de GC | Não disponível nesta versão do Chromium |
| Eventos de mídia | 0; o trace usou o cenário pesado sem mídia |

O número de eventos GC inclui slices V8 aninhados. O custo estimado de GC no primeiro pico foi 6,486 ms exclusivo no intervalo; isso não explica sozinho o atraso de 79,7 ms.

## A/B da memoização

Seis execuções limpas de 30 s, três por variante, sequência alternada `A1/B1/B2/A2/A3/B3`, warm-up de 2 s, mesmo build e fixtures. A variante “off” força o comparator React a retornar `false`; aproxima renderização sem memoização, com custo residual mínimo da chamada do comparator.

| Métrica | Memo ligada: mediana (mín–máx) | Memo desligada: mediana (mín–máx) | Leitura |
|---|---:|---:|---|
| RAF p95 | 13,6 (13,6–13,7) ms | 13,7 (13,6–13,7) ms | Diferença dentro da dispersão |
| RAF p99 | 13,7 (13,7–13,9) ms | 13,8 (13,7–13,9) ms | Diferença pequena, sobreposta |
| RAF máximo | 66,7 (66,6–79,8) ms | 66,5 (66,5–66,6) ms | Sem melhora demonstrada |
| Gaps RAF >33 ms | 5 (4–5) | 4 (4–5) | Sem melhora demonstrada |
| Commits superfície / tempo cumulativo | 900 / 384,4 ms (375–409,6) | 899 / 914,8 ms (873,5–918,7) | Menos trabalho React acumulado com memo ligada |
| Long tasks / duração cumulativa | 4 / 225 ms (223–244) | 4 / 224 ms (215–225) | Sem melhora demonstrada |
| Quadros lógicos saltados | 2 (2–3) | 2 (1–3) | Sem diferença confiável |
| Pico de heap | 131,57 MB (80,34–152,2) | 142,12 MB (90,41–142,74) | Dispersão alta; inconclusivo |
| Diferenças pixel a pixel | 0 em 3 pares | 0 em 3 pares | Imagens comparadas idênticas |

Conclusão: a memoização reduz o custo React medido na superfície em aproximadamente 58% pela mediana acumulada, mas não corrigiu os picos de apresentação observados. Como n=3 por variante e as distribuições de RAF/long tasks se sobrepõem, o A/B não sustenta alegação de fluidez melhor.

## Auditoria do comparator visual

`sceneLayerPropsEqual` compara todas as propriedades enumeráveis de `EditorV6Element`, a identidade do asset, seleção e interação. A busca na tipagem e no renderer confirmou que `motionSprite` possui seis campos que definem o recorte; a referência do asset é comparada separadamente. Assim, troca de atlas com mesma geometria, troca de recorte e mudanças de face/preset invalidam a camada. O contrato de estado do Editor V6 é imutável/Immer; mutar em lugar os objetos de asset ou campos aninhados violaria esse contrato.

Foram adicionados testes de regressão para troca de asset com crop igual e mudanças de estado facial. Os pares visuais A/B também foram idênticos. Não foi encontrada falha comprovada de invalidação; por isso o comparator não foi alterado para renderizar mais.

## Causas confirmadas, hipóteses e apresentação física

**Confirmado:** os quatro personagens reais (`STRESS_Aurora`, `STRESS_Nix`, `STRESS_Brisa`, `STRESS_Dorian`) passaram pelo renderer do Editor V6; os quatro cenários de 30 s passaram. A resolução da cena ficou abaixo de 0,3 ms nessa trace e não explica os picos observados. A superfície React teve alguns commits de 36–38 ms em duas janelas, enquanto outras janelas longas mostraram baixa atividade React e categorias de compositor/GC.

**Sustentado, ainda sem prova causal:** trabalho de React DOM e espera/scheduling do compositor são candidatos diferentes. Há GC no mesmo período de um dos gaps longos, mas a duração exclusiva de GC é muito menor que o intervalo total. Layout e paint observados ficaram pequenos nos picos React.

**Não confirmado/descartado:** a comparação não demonstra que memoização reduziu RAF ou long tasks. A resolução de composição não é responsável pelos picos de 60–80 ms nessa carga. Não há base para atribuir toda interrupção a GC, SVG, mídia ou CPU do sistema. Mídia não estava ativa no cenário da trace pesada; a execução multimídia foi validada separadamente no estresse limpo.

**Quadro lógico/DOM/RAF/apresentação:** o stress limpo observou atualização do relógio e de `data-frame` do DOM, com gaps ocasionais; no pesado foram dois gaps lógicos e dois gaps DOM em 30 s. RAF foi medido em callbacks a ~74 Hz, enquanto a timeline avança a 30 FPS. A API de vídeo `requestVideoFrameCallback` não mede a apresentação completa da composição SVG. Sem janela visível e telemetria de compositor/frame timeline adequada, não é possível afirmar quais quadros da cena composta foram fisicamente apresentados nem a latência real do monitor.

## Validação executada

Os comandos abaixo passaram nesta rodada, salvo indicação:

- `npm run typecheck`
- `npm run audit:architecture` — 0 importações runtime entre features e 0 violações estritas.
- `npm run test:editor-v6` — 47 passaram, 1 ignorado (antes do novo caso adaptativo do analisador).
- `npm run test:editor-v6:surface` — passou; 0 diferenças entre capturas de superfície do teste.
- `npm run test:editor-v6:motion` — passou; rigs, amostras e integração de controles verificados.
- `npm run test:editor-v6:export` — passou; inclui 81 frames, áudio contínuo na emenda, fallback e cancelamento.
- `npm run test:editor-v6:stress-offscreen` — quatro cenários de 30 s passaram, incluindo multimídia; sem erros de página.
- `npm run test:editor-v6 -- tests/editor-v6/traceAnalyzer.test.ts tests/editor-v6/sceneLayerMemo.test.ts` — 10 testes passaram após adicionar o caso de limiar RAF adaptativo.
- `npm run test:editor-v6:stress-trace -- --scenario=heavy` — trace co-capturada de 30 s; 482.558 eventos brutos, alignment residual máximo 0,0757 ms. Metadado de perda não fornecido, então integridade não confirmada.
- A/B memo — 6 execuções válidas e 3 comparações visuais idênticas.

`npm run test:editor-v6` será repetido depois do último ajuste do analisador antes do commit. Nenhum trace bruto, caminho local, perfil privado ou mídia de usuário deve entrar no Git. O trace e screenshots permanecem apenas em `out/` ignorado.

## Arquivos e alterações deste ciclo

- `performanceDiagnostics.ts`: timestamps de resolução de cena e marcadores React/playback opcionais apenas durante trace.
- `test-stress-offscreen.cjs`: tracing em fluxo dentro da janela medida, calibração, boundary marks, observação DOM/mídia/GC disponível, perfil separado do benchmark limpo.
- `analyze-trace.cjs`: normalização X e B/E, árvore e tempo exclusivo, associação React/RAF/long task, processos/threads, limiar RAF adaptado à cadência observada e sinalização tri-state de integridade.
- `traceAnalyzer.test.ts`: fixtures de hierarquia, sobreposição, threads, relógios, eventos ausentes/malformados e limiar adaptativo.
- `SceneSurface.tsx` e `sceneLayerMemo.test.ts`: documentação do contrato visual e testes de invalidação de atlas/face; comparator preservado.
- `run-memo-ab.ps1`, `analyze-memo-ab.cjs`, `AB_MEMO_2026-10-26.{md,json}`: execução, análise e registro A/B reprodutíveis.
- `package.json`: comandos para trace, análise e A/B.

## Pendências e próximas prioridades

1. **Confirmar integridade do trace e origem dos dois picos React.** Registrar os campos do envelope `Tracing.tracingComplete`, repetir captura curta e verificar se são disponibilizados stacks simbólicos/linhas úteis. Arquivos: `test-stress-offscreen.cjs`, `analyze-trace.cjs`. Risco: tracing pode alterar scheduling. Concluir quando o status de perda estiver conhecido e os dois intervalos forem reproduzidos com função de aplicação ou limitação explícita.
2. **Reproduzir picos de espera do compositor em janela visível.** Comparar com a execução offscreen, consultando frame timeline/DevTools disponível no Electron 44. Arquivos: harness de estresse e relatório. Risco: telemetria variar por monitor/GPU. Concluir com apresentação medida ou declaração de indisponibilidade comprovada.
3. **Repetir A/B em outros cenários e dias.** Três rodadas mostraram custo React menor, mas não melhor fluidez; ampliar n antes de ajustar o número de camadas memoizadas. Arquivos: `run-memo-ab.ps1`, `analyze-memo-ab.cjs`. Concluir quando dispersão e tamanho de efeito puderem separar diferenças de variabilidade.
4. **Medir multimídia isoladamente.** O cenário multimídia limpo passou, mas a trace causal pesada não continha mídia. Capture vídeo/áudio com menor janela e compare com personagem-only. Arquivos: fixture e harness. Risco: codecs e aceleração de hardware. Concluir com drift/seek/RAF correlacionados.
5. **Auditar renderização SVG apenas após causa replicada.** A medição atual mostra baixo layout/paint; não há justificativa para refatorar para Canvas/WebGL. Concluir com um isolamento que associe SVG/asset/rasterização a um custo mensurável.

## Recomendação ao orquestrador — Ciclo 3

Priorizar a repetição instrumentada dos picos de 8,12–8,19 s e 16,46–16,52 s com integridade CDP explicitamente determinada, e com stack de JavaScript utilizável. Em paralelo, medir os eventos de espera do compositor numa janela realmente visível. A memoização já reduz trabalho React, mas os dados atuais dizem que esse não é um remédio comprovado para os maiores gaps RAF.

## Estado de publicação

As alterações do ciclo serão registradas em commits locais coerentes e enviadas por fast-forward somente se `origin/Main-desenvolvimento` continuar avançando a partir do mesmo commit-base. A modificação local preexistente de `ABRIR_DESENVOLVIMENTO.bat` permanece fora dos commits.

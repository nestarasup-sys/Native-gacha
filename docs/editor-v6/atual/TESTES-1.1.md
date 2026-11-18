# Testes 1.1 — como medir e validar

## Verificação mínima por mudança

- Para módulo puro, execute apenas o teste focado com `npx vitest run --config vitest.editor-v6.config.ts <arquivo>`. Encontre o teste pelo nome com `rg --files tests/editor-v6`.
- Para contrato TypeScript, execute `npm run typecheck`. Para dependências ou fronteiras entre módulos, execute `npm run audit:architecture`.
- Para alteração em captura, vídeo em camadas, pipe, finalização ou emendas, use `npm run test:editor-v6:export`. Esse harness usa fixtures próprias. Verifique o JSON do harness em `out/editor-v6-export-check/result.json` e diferencie teste de correção de benchmark.
- Para a pausa de atualizações com o app em segundo plano, verifique que retornar o foco durante o job preserva o export ativo e que o editor retoma a sincronização ao terminar.

## Comparação de desempenho

1. Use a mesma fixture, intervalo, resolução, FPS, encoder, número de workers e animações. Faça cada execução fria, com dados de trabalho descartados ao final.
2. Use teste curto para validar a ideia. Quando promissora, rode A/B em ordem alternada numa fixture suficientemente longa e registre mediana e dispersão. Evite transformar um microteste de pixels num ganho anunciado do MP4 completo.
3. Registre tempo de parede total e por fase, FPS efetivo, quadros únicos e reutilizados, capturas descartadas, tempo descoberto do pipe e memória da família de processos quando disponível. `app.getAppMetrics()` não mede o FFmpeg externo nem VRAM.
4. Verifique contagem e cadência dos quadros, emendas e áudio. Compare os quadros relevantes para a mudança, especialmente o início, meio e fim da troca de expressão, junto de transparência e composição sobre vídeo.
5. Confirme sucesso, falha e cancelamento de acordo com o escopo. O relatório deve indicar a limpeza, e os temporários do diagnóstico ficam na área isolada do teste.

Para comparar relatórios com diferentes layouts de captura das camadas, use `node scripts/editor-v6/compare-run-reports.cjs ... --allow-layer-capture-change`. O comparador exibe `single+stacked` ou `single+serial`; essa flag autoriza somente a diferença de layout e continua exigindo o mesmo intervalo, animações, encoder e validações.

O padrão atual é serial para trechos com vídeo. A estratégia stacked fica para comparações isoladas por `GACHA_EDITOR_V6_LAYER_CAPTURE=stacked`. A fixture integrada compara os pixels das camadas com tolerância máxima de 1 LSB, sem diferença em alpha.

O V6 usa uma timeline de 30 FPS e pode exportar a 24 ou 30 FPS. Para mudanças de agendamento ou amostragem, cubra ambos e cheque o primeiro e o último quadro de cada trecho.

## Como aproveitar um único export real

- Na mesma execução, registre clique até MP4 validado, duração de cada fase, fila e rasterização das transições, prontidão do worker, capturas descartadas, escrita descoberta no FFmpeg e memória disponível. Use timestamps monotônicos dentro de cada processo e meça a duração da execução pelo coordenador.
- No MP4 já produzido, rode em conjunto FFprobe, checagem de áudio e emendas e comparação dos quadros-chave de expressão. Use um conjunto pequeno e fixo de quadros que cubra corte, poses, boca e vídeo em camadas. Guarde resultados agregados no relatório. Remova PNGs, traces e arquivos intermediários do diagnóstico.
- Pode testar candidatos lado a lado em amostras sintéticas ou em modo de diagnóstico nas mesmas entradas. Marque o custo do modo de diagnóstico separadamente. Uma execução que mistura candidatos por trecho serve para triagem, e um export inteiro com o mesmo candidato serve para validar a meta. Evite alterar várias opções sem registrar quais mudaram e por quê.
- Implemente o comparador sobre o JSON existente, com estados para campo ausente e incompatibilidade de perfil. Registre tempo absoluto, diferença percentual, fases dominantes, quadros escritos, resultado visual, validação e limpeza. Use os relatórios já salvos sempre que eles responderem à pergunta.
- Considere a meta atendida somente após concluir o corte real de 6.000 quadros em até 90 s do início da preparação do botão Exportar MP4 até a publicação, com as mesmas opções e verificações aprovadas. Se a carga da máquina tiver afetado a rodada ou se o valor ficar perto do limite, confirme com uma repetição fria.

## Evidência já disponível

- A rodada `45e009f0` passou 70 testes focados, typecheck, auditoria e harness de export. O novo relatório de 18/11 comprova a conclusão do corte real, mas não fornece um controle pareado.
- A rodada atual de documentação usa verificação de links ativos, limite de linhas, preservação do guia carregado pelo app e revisão do diff. A próxima rodada de código registra aqui ou na continuação quais checks executou.
- Rodada completa pareada: 6.000 quadros, ambos os MP4s passaram FFprobe, áudio, emendas e limpeza. Clique→validado 209,87 s e 206,06 s; não é uma melhoria confirmada.
- Microbenchmark sintético de alpha crop: 0,40 ms otimizado versus 2,61 ms referência, limites iguais. O contador no projeto real permaneceu ~39,6 s; use a fixture para paridade e não como estimativa de ganho do export.
- Verificações desta rodada: 5 arquivos Vitest / 38 testes, 4 testes do comparador de relatórios e `npm run typecheck`; todos passaram. O comparador exige compatibilidade de perfil e resume preparação, captura, pipe, validação e limpeza.
- O comparador foi ampliado para entender o relatório agregado do harness. Ao testar os arquivos antigos, identifica corretamente 206,06 s de parede, mas recusa a validação completa porque a saída anterior não registrava ID de projeto nem limpeza; o gerador novo passa a incluir ambos.

## Rodada de lotes 600/1.200 e C++

- `--mouth-batch-frames=200|300|600|1200` só funciona no perfil UI do harness isolado. O padrão de produção agora é 600; o planejamento e o fallback têm testes dos limites e da divisão.
- Primeiro teste integral 600: 201,45 s clique→validado, 6.000 frames, H.264 1080p/30, AAC 200 s, 9 emendas, zero erros de limpeza e zero estados de boca ignorados/obsoletos. Paridade visual entre MP4s não é inferida pelo relatório.
- Teste integral 1.200: 209,20 s; perfil e validação aprovados, 6 partes; rejeitado por desempenho.
- C++ em amostra 40 s: sem MP4, bloqueado por conjunto de assets >512 MiB. Relatório de falha preservado.
- A repetição C++ com partes 300 também excedeu 512 MiB e não gerou MP4; alterar batch não reduz o conjunto acumulado do processo.
- O comparador mostra revisão e dirty e impede comparar click→validado com soma estimada de fases. Use `--allow-mouth-batch-change` só quando aceitar explicitamente essa diferença de planejamento.
- `analyze-export-performance.cjs` agora entende o agregado do harness e mostra tempo total com sua base, main, preparação, somas de worker, memória/CPU por processo, capturas e detalhe por parte. As somas paralelas são explicitamente rotuladas como sobrepostas.
- Novo A/B integral, lote 300→600 com 4 workers: 194,502→187,864 s (−3,4%); ambos validados. A comparação curta 600 vs dois controles 300 marcou SSIM 0,996211. O padrão foi promovido; a meta 90 s continua aberta.
- Comparação curta de motion bake: concurrency 2→3 levou 44,318→45,151 s e passou a validação dos 1.200 quadros, áudio e emenda. Não é candidata para promoção.

## Rodada — encoder, captura e workers

- `tests/editor-v6/exportPlanning.test.ts`: garante que o harness recuse quatro workers com apenas dois trechos e aceite quatro trechos de 300 quadros. `npx vitest run --config vitest.editor-v6.config.ts tests/editor-v6/exportPlanning.test.ts`: 13 testes passaram.
- `npm run typecheck` e `npm run build` passaram após o ajuste. O comparador `tests/editor-v6/compareRunReports.test.cjs` também deve ser executado pelo runner Node (`node --test ...`), pois Vitest não descobre `.cjs` nessa configuração.
- Quatro execuções curtas (duas por perfil) 4×300 vs 2×300 passaram; medianas 43,857/46,951 s. Um par 6×200 vs 2×200 também passou: 44,262/48,927 s. A validação cobriu 1.200 quadros H.264 1080p/30, AAC, emendas e limpeza.
- Full com lote 300 para 2/4/6 workers: 210,963/194,502/192,850 s. Todos passaram 6.000 quadros, AAC, 19 emendas e limpeza. Picos GPU: 2≈1,01 GiB; 4≈1,20 GiB; 6≈1,49 GiB. Os relatórios não incluem hashes visuais.
- `exportFallbackStrategy.test.ts`: verifica quatro workers para encoder CPU, dois para GPU e um worker em fallback. `npm run typecheck`, build e teste focado passaram.
- `compare-run-reports.cjs` passou a exibir `phaseMilliseconds` do agregado do harness; teste garante fases de preparação/render. `node --test tests/editor-v6/compareRunReports.test.cjs`: 9 testes passaram.
- Reencode offline 40 s: Media Foundation 3,70 s, OpenH264 7,06 s; SSIM/PSNR quase iguais. Export real completo curto: 44,282/44,318 s, sem ganho de parede. Não promover encoder com base no microteste.
- Captura `paint-event`: falhou por timeout com token em 63,79 s; não produziu MP4. O relatório de falha é evidência negativa, não aprovação de captura alternativa.

## Perfil UI padrão integral

- Projeto autorizado `408a77d1-d964-4c04-a66b-f4e9fcfeee46`, intervalo `[0,6000)`, 200 s, 1080p/30, CPU OpenH264, Turbo, quatro workers, boca/piscadas/transições, Preset 2, áudio ativo e simplificação desligada.
- Resultado: 163,760 s clique→validado; 6.000 quadros, AAC de 200 s, nove emendas; zero erros de limpeza. Só MP4 e relatório permaneceram.
- Quatro workers confirmados pelo relatório da tentativa; o campo agregado de workers foi corrigido com anotação de origem. Nenhum teste C++ foi executado.
- Relatório: `out/editor-v6-stress/runs/layer-serial-default-full200-2026-11-18/stress-export-validation.json`.

## Rodada de 18/11 — export padrão, sem C++

- `npm run typecheck`, `npx electron-vite build` e Vitest em `exportWorkers`, `motionBakeEndpointGeometry` e `motionPreparation`: passaram, 60 testes.
- A/B de captura 40 s: o modo `compare-paint` não encontrou divergência de pixels. `paint-event` no corte integral validou os 6.000 quadros H.264/AAC e 9 emendas, mas levou 165,836 s contra 163,760 s do controle `capturePage`.
- 80 s: workers 2/4 = 69,088/63,810 s. 120 s, workers 4/6 = 104,417/105,781 s; a fila de boca somada cresceu 23,956/49,278 s.
- 120 s, 4 workers: concorrência de boca 2/3 = 104,417/102,517 s; lote de boca 600/300 = 104,417/104,713 s. Integral com concorrência 3 levou 163,869 s, sem ganho frente aos 163,760 s padrão.
- Os relatórios foram salvos em pastas `capture-paint-*`, `standard-*` e `endpoint-geometry-schema-counters-*` dentro de `out/editor-v6-stress/runs/`. Testes abaixo de 200 s guardam só o JSON; os cortes integrais ficam com MP4 e relatório.
- Corrigi o guard do harness: sem `--render-workers`, agora aceita o paralelismo observado e só verifica igualdade se o usuário solicitar uma contagem explícita. Executar `node --check scripts/editor-v6/benchmark-project-export.cjs` para validar sintaxe.
- `npm run bench:editor-v6:project` não foi usado; o build executado foi apenas `electron-vite`. Nenhum teste ou renderizador C++ foi executado. A meta 90 s permanece aberta.
- Lookahead 2: no mesmo perfil padrão, 40 s = 40,362 s; 120 s = 104,084 s. Controle 120 s = 104,417 s. Todas as validações passaram, mas o ganho longo de 0,3% não paga os buffers extras; o código foi revertido. Controle de threads de encoder 2 levou 102,660 s em 120 s, sem repetição pareada; não promovido.

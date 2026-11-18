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

- `--mouth-batch-frames=300|600|1200` só funciona no perfil UI do harness isolado; o padrão de produção continua 300. Planejamento e fallback têm testes para 1.200 quadros.
- Teste integral 600: 201,45 s clique→validado, 6.000 frames, H.264 1080p/30, AAC 200 s, 9 emendas, zero erros de limpeza e zero estados de boca ignorados/obsoletos. Paridade visual entre MP4s não é inferida pelo relatório.
- Teste integral 1.200: 209,20 s; perfil e validação aprovados, 6 partes; rejeitado por desempenho.
- C++ em amostra 40 s: sem MP4, bloqueado por conjunto de assets >512 MiB. Relatório de falha preservado.
- A repetição C++ com partes 300 também excedeu 512 MiB e não gerou MP4; alterar batch não reduz o conjunto acumulado do processo.
- O comparador mostra revisão e dirty e impede comparar click→validado com soma estimada de fases. Use `--allow-mouth-batch-change` só quando aceitar explicitamente essa diferença de planejamento.
- `analyze-export-performance.cjs` agora entende o agregado do harness e mostra tempo total com sua base, main, preparação, somas de worker, memória/CPU por processo, capturas e detalhe por parte. As somas paralelas são explicitamente rotuladas como sobrepostas.

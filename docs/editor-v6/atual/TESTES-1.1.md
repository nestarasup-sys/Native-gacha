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

## Evidência já disponível

- A rodada `45e009f0` passou 70 testes focados, typecheck, auditoria e harness de export. O novo relatório de 18/11 comprova a conclusão do corte real, mas não fornece um controle pareado.
- A rodada atual de documentação usa verificação de links ativos, limite de linhas, preservação do guia carregado pelo app e revisão do diff. A próxima rodada de código registra aqui ou na continuação quais checks executou.

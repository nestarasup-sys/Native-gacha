# Editor V6 — documento mestre

**Rodada iniciada em 18/11/2026 · branch `Dev-V2`.**

O objetivo é diminuir o tempo entre clicar em Exportar MP4 e receber o vídeo validado. O corte de 200 s levou 162,689 s com captura serial das camadas de vídeo; o controle stacked pareado levou 179,261 s. Essa redução de 9,25% foi promovida ao export padrão. A meta de 90 s segue aberta.

**Meta de aceitação: até 90 s do clique ao MP4 validado** para os mesmos 6.000 quadros, com a configuração de referência e qualidade preservada. O usuário autorizou repetir esse corte no próprio projeto. Use a autorização e o protocolo em [Execução 1.1](EXECUCAO-1.1.md) e [Testes 1.1](TESTES-1.1.md).

## Documentos ativos

- [Direção técnica 1.1](DIRECAO-TECNICA-1.1.md) — recomendação de arquitetura e primeiro experimento para decidir onde investir.
- [Pesquisa 1.1](PESQUISA-1.1.md) — evidência do export e hipóteses em ordem.
- [Execução 1.1](EXECUCAO-1.1.md) — próxima rodada, decisões e registro do trabalho.
- [Testes 1.1](TESTES-1.1.md) — como verificar desempenho, qualidade, emendas e limpeza.
- [Prompt para o próximo agente](PROMPT.md).

O código e os relatórios da execução são as fontes de verdade. O [arquivo histórico](../../lixo/editor-v6/README.md) serve para recuperar um experimento específico quando necessário. As recomendações e permissões antigas precisam de confirmação nos contratos atuais.

## Resultado mais recente

No perfil padrão sem simplificação, a exportação serial levou **163,760 s** para 200 s de vídeo, usando quatro workers CPU. Validou 6.000 quadros 1080p/30, H.264/AAC, nove emendas e limpeza. O A/B pareado stacked → serial reduziu o corte de 179,261 s para 162,689 s (−9,25%); a diferença entre medições reforça a variação entre execuções. O relatório mostra captura/roundtrip e escrita FFmpeg como o principal custo restante; a meta de 90 s não foi atingida. Nenhum teste C++ foi executado. Veja [Pesquisa 1.1](PESQUISA-1.1.md) e [Execução 1.1](EXECUCAO-1.1.md).

Na rodada mais recente, medi o tempo dentro da função renderer e comparei com o roundtrip. O caminho IPC alternativo ficou 2,3% mais lento em 40 s, embora os hashes amostrados fossem iguais; descartei-o. O transporte padrão segue `executeJavaScript`, com medição interna adicional disponível no relatório. Não fiz export integral, pois o teste curto não mostrou ganho. O resultado completo de 163,760 s segue como referência; veja [Execução 1.1](EXECUCAO-1.1.md).

O A/B curto no transporte de duas camadas separadas foi mais lento que o buffer combinado (+7,2%, uma amostra por lado). A tentativa foi removida; não usar o corte completo nela.

Antecipar o preparo de boca também perdeu 1,7% num corte padrão de 40 s. Mantive o preparo atual intercalado com a renderização; as comparações e o próximo foco estão em [Execução 1.1](EXECUCAO-1.1.md) e [Pesquisa 1.1](PESQUISA-1.1.md).

Na rodada posterior, `paint-event`, concorrência 3 de boca e lote 300 não reduziram o corte integral frente ao padrão. Quatro workers continuam melhores que dois; seis não ajudam por causa da fila de preparação da boca. O relatório agora conserva hits/misses do cache de geometria. Nenhum teste C++ foi executado. Consulte a rodada de 18/11 em [Execução 1.1](EXECUCAO-1.1.md).

Lookahead de dois quadros, encoder com menos threads e lote de boca 1.200 também foram medidos, sem ganho longo que justifique mudança. O último levou 165,006 s contra 163,760 s e aumentou o bake de boca; manter lote 600. O padrão segue com captura `capturePage`, quatro workers, boca concorrência 2/lote 600 e lookahead 1. Nenhum teste C++ foi executado.

O último candidato tentou pular IPC de 880 quadros repetidos em um corte padrão de 40 s. Manteve os hashes amostrados, mas levou 40,705 s contra 40,631 s no controle; foi removido. A investigação continua centrada em captura e transporte de bitmaps. Consulte [Execução 1.1](EXECUCAO-1.1.md).

Uma espera extra antes da captura reduziu `capturePage` agregado em 1,94 s no corte de 200 s, mas o total ficou 0,379 s mais lento; removi a flag experimental. O padrão continua sem gate RAF. A meta de 90 s está aberta e exige reduzir a etapa sustentada de render/codificação, sem simplificar animações ou resolução.

Na rodada mais recente, gravar quadros únicos em PNG lossless levou 60,422 s em 40 s de vídeo e foi removido. `paint-event` ficou 0,611 s mais rápido numa amostra curta, mas praticamente não alterou renderização e teve preparação menor; o A/B integral anterior também foi mais lento. Nenhum candidato foi promovido. O melhor integral padrão segue 163,760 s; o próximo foco é o custo sustentado no renderer e no roundtrip por quadro. Consulte [Pesquisa 1.1](PESQUISA-1.1.md) e [Execução 1.1](EXECUCAO-1.1.md).

## Rotina para continuar sem supervisão

1. Confira raiz, branch, commit e estado local. Leia o resultado mais recente da execução.
2. Escolha uma hipótese que possa reduzir o tempo total. Use um relatório existente para justificar a escolha.
3. Rode uma verificação sintética curta capaz de distinguir a hipótese das outras etapas. Faça uma mudança por comparação. Quando o resultado for inconclusivo, revise a medição ou avance para outra hipótese testável.
4. Compare tempo de parede, saída e memória. Registre números, limitações e arquivos afetados. Faça commit local seguindo o AGENTS.

## Regra dos 300

Cada Markdown da pasta atual tem até **300 linhas físicas**, inclusive o mestre. Antes de ultrapassar 300, abra uma continuação da mesma série. Use `PESQUISA-1.2.md`, `PESQUISA-1.3.md` e assim por diante. Aplique o mesmo a execução e testes. Para o mestre, preserve este índice e crie `MESTRE-1.2.md` para a continuação. Ligue a série no índice e no fim da parte anterior. Conte as linhas antes de fazer commit. O arquivo histórico contém documentos anteriores a essa regra.

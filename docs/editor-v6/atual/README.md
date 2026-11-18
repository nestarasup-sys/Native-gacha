# Editor V6 — documento mestre

**Rodada iniciada em 18/11/2026 · branch `Dev-V2`.**

O objetivo é diminuir o tempo entre clicar em Exportar MP4 e receber o vídeo validado. O corte de 200 s levou 162,689 s com captura serial das camadas de vídeo; o controle stacked pareado levou 179,261 s. Essa redução de 9,25% foi promovida ao export padrão. A meta de 90 s segue aberta.

**Meta de aceitação: até 90 s do clique ao MP4 validado** para os mesmos 6.000 quadros, com a configuração de referência e qualidade preservada. O usuário autorizou repetir esse corte no próprio projeto. Use a autorização e o protocolo em [Execução 1.1](EXECUCAO-1.1.md) e [Testes 1.1](TESTES-1.1.md).

## Documentos ativos

- [Pesquisa 1.1](PESQUISA-1.1.md) — evidência do export e hipóteses em ordem.
- [Execução 1.1](EXECUCAO-1.1.md) — próxima rodada, decisões e registro do trabalho.
- [Testes 1.1](TESTES-1.1.md) — como verificar desempenho, qualidade, emendas e limpeza.
- [Prompt para o próximo agente](PROMPT.md).

O código e os relatórios da execução são as fontes de verdade. O [arquivo histórico](../../lixo/editor-v6/README.md) serve para recuperar um experimento específico quando necessário. As recomendações e permissões antigas precisam de confirmação nos contratos atuais.

## Resultado mais recente

No perfil padrão sem simplificação, a exportação serial levou **163,760 s** para 200 s de vídeo, usando quatro workers CPU. Validou 6.000 quadros 1080p/30, H.264/AAC, nove emendas e limpeza. O A/B pareado stacked → serial reduziu o corte de 179,261 s para 162,689 s (−9,25%); a diferença entre medições reforça a variação entre execuções. O relatório mostra captura/roundtrip e escrita FFmpeg como o principal custo restante; a meta de 90 s não foi atingida. Nenhum teste C++ foi executado. Veja [Pesquisa 1.1](PESQUISA-1.1.md) e [Execução 1.1](EXECUCAO-1.1.md).

O A/B curto no transporte de duas camadas separadas foi mais lento que o buffer combinado (+7,2%, uma amostra por lado). A tentativa foi removida; não usar o corte completo nela.

Antecipar o preparo de boca também perdeu 1,7% num corte padrão de 40 s. Mantive o preparo atual intercalado com a renderização; as comparações e o próximo foco estão em [Execução 1.1](EXECUCAO-1.1.md) e [Pesquisa 1.1](PESQUISA-1.1.md).

## Rotina para continuar sem supervisão

1. Confira raiz, branch, commit e estado local. Leia o resultado mais recente da execução.
2. Escolha uma hipótese que possa reduzir o tempo total. Use um relatório existente para justificar a escolha.
3. Rode uma verificação sintética curta capaz de distinguir a hipótese das outras etapas. Faça uma mudança por comparação. Quando o resultado for inconclusivo, revise a medição ou avance para outra hipótese testável.
4. Compare tempo de parede, saída e memória. Registre números, limitações e arquivos afetados. Faça commit local seguindo o AGENTS.

## Regra dos 300

Cada Markdown da pasta atual tem até **300 linhas físicas**, inclusive o mestre. Antes de ultrapassar 300, abra uma continuação da mesma série. Use `PESQUISA-1.2.md`, `PESQUISA-1.3.md` e assim por diante. Aplique o mesmo a execução e testes. Para o mestre, preserve este índice e crie `MESTRE-1.2.md` para a continuação. Ligue a série no índice e no fim da parte anterior. Conte as linhas antes de fazer commit. O arquivo histórico contém documentos anteriores a essa regra.

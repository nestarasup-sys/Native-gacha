# Editor V6 — documento mestre

**Rodada iniciada em 18/11/2026 · branch `Dev-V2`.**

O objetivo é diminuir o tempo entre clicar em Exportar MP4 e receber o vídeo validado. O corte de 200 s levou 162,689 s com captura serial das camadas de vídeo; o controle stacked pareado levou 179,261 s. Essa redução de 9,25% foi promovida ao export padrão. A meta de 90 s segue aberta.

**Meta de aceitação: até 90 s do clique ao MP4 validado** para os mesmos 6.000 quadros, com a configuração de referência e qualidade preservada. O usuário autorizou repetir esse corte no próprio projeto. Use a autorização e o protocolo em [Execução 1.1](EXECUCAO-1.1.md) e [Testes 1.1](TESTES-1.1.md).

## Documentos ativos

- [Plano 1.8](PLANO-1.8.md) — auditoria integrada e execução por evidências; estado atualizado no próprio plano.
- [Regressão de animação/exportação 1.9](RELATORIO-REGRESSAO-ANIMACAO-EXPORTACAO-1.9.md) — causa da ocupação excessiva do atlas e export Turbo integral do projeto V4 validado.
- [Paridade de transições 1.9](RELATORIO-PARIDADE-TRANSICOES-1.9.md) — comparação por quadro do balão e da geometria no trecho da Seraphina.
- [Blocos curtos da timeline](RELATORIO-BLOCOS-CURTOS-TIMELINE.md) — análise do projeto V4, seleção de blocos visualmente sobrepostos e aviso para beats muito próximos.
- [Desempenho da atualização de personagens 1.9](RELATORIO-REFRESH-PERFORMANCE-1.9.md) — remove re-renderização incondicional dos snapshots atuais ao abrir projetos.
- [Perfil de workers 1.8](RELATORIO-PLANO-1.8-WORKERS-40S.md) — seis exports alternados com qualidade e áudio comparados; confirma o padrão CPU de quatro workers.
- [Triagem do scaler 1.8](RELATORIO-PLANO-1.8-SCALER-40S.md) — candidato de reamostragem descartado em dois cortes; sem alteração de produto.
- [Baseline integral 1.8](RELATORIO-PLANO-1.8-BASELINE-200S.md) — corte atual de 6.000 quadros validado; uma amostra, não substitui a mediana promovida.
- [Triagem de concorrência de motion 1.8](RELATORIO-PLANO-1.8-MOTION-CONCURRENCY.md) — concorrência 3 acelerou o corte curto, mas não o integral; mantido o padrão 2.
- [Triagem de sobreposição do pipeline 1.8](RELATORIO-PLANO-1.8-FRAME-OVERLAP.md) — desligar a sobreposição ficou abaixo do gate e mais lento; padrão ligado mantido.
- [Triagem reversível de resíduos 1.8](RELATORIO-PLANO-1.8-LIMPEZA.md) — candidatos e evidências a preservar; nenhuma movimentação feita.
- [Golden de exportação v2](../../../tests/editor-v6/fixtures/golden-export-v2/golden.json) — referência sintética para Intro bilíngue, GIF de pré-roll e cards temporizados; rode `npm run test:editor-v6:golden-extended`.
- [Guia V15.2 de roteiros JSON](../GUIA_V15_2_NATIVE_GACHA_EDITOR_V6_JSON_REACT.md) — guia ativo do importador; atualiza e substitui V15.1 no app. V15.1 permanece preservado como histórico.
- [JSON Schema do importador](../schema/NYMI_EDITOR_V6_REACT_V1.schema.json) — contrato estrutural derivado do schema Zod; regras semânticas continuam validadas pelo importador.
- [Plano da Rodada 1.5](RODADA-1.5-PLANO.md).
- [Execução 1.7](EXECUCAO-1.7.md) — A/B da rodada de limpeza; candidatos não promovidos e preservação verificada.
- [Execução 1.5](EXECUCAO-1.5.md) — thread cap + transporte NUT medidos juntos em três pares de 200 s.
- [Teste complementar NUT de 200 s](TESTE-COMPLEMENTAR-NUT-200S.md) — série CFR/NUT anterior, reavaliada com a autorização de 24/11.
- [Plano da Rodada 1.4](RODADA-1.4-PLANO.md), [Execução 1.4](EXECUCAO-1.4.md) e [índice de experimentos](EXPERIMENTOS.md).
- [Relatório de retorno da Rodada 1.4](RELATORIO-RETORNO-RODADA-1.4.md) — índice executivo e partes 1–10 com medições e limitações.
- [Limpeza da Rodada 1.6](../../../docs/RODADA-1.6-LIMPEZA.md) — remoção do Editor V7 e inventário do que foi preservado/arquivado.

A prévia mantém os pedidos de transição que continuam na janela do cursor e cancela os que saem dela. O IPC da prévia retorna `null` para cancelamento solicitado pelo cliente. A preparação antecipada continua sem devolver o atlas. Cancelar um pedido ainda na fila preserva o worker aquecido, e o cancelamento de um consumidor não interrompe o preparo compartilhado com outros consumidores. Falhas reais continuam sendo rejeitadas pelo serviço.

Ao criar uma fala ou pensamento para um personagem selecionado, o Editor V6 grava um único elemento e bloco com `englishText` para o balão superior e `text` para o português abaixo. Prévia e exportação usam o mesmo par SVG e o ajuste de borda trata os dois como uma unidade. Elementos salvos sem `englishText` continuam com um balão.

O GIF Loading fica no bloco de vídeo. Os cards de `videos[].presentation.cards` ficam na faixa Cards, com três componentes programados em quadros relativos ao bloco e vínculo pelo ID do vídeo. O resolvedor cruza os intervalos dos componentes com a janela do clipe visível. A prévia e o MP4 usam o mesmo SVG e a largura visível da imagem. Para validar o MP4 com os três componentes, rode `npm run build` e `node scripts/editor-v6/check-golden-export.cjs --unified-cards`.

O GIF original está nos assets do Editor V6. A faixa PNG ao lado contém os quatro quadros lado a lado, com 300 ms por quadro, para busca e captura determinísticas. Para gerar a faixa a partir do GIF original, use FFmpeg com `-ignore_loop 1`, `-vf "format=rgba,tile=4x1"` e `-frames:v 1`.

A Intro opcional do roteiro V14.5 é compilada em uma faixa de timeline, com retratos persistidos como snapshots do projeto. Os horários do conteúdo principal são deslocados na importação e rebaseados na exportação do roteiro. O resolvedor de quadro seleciona a tela ativa e a mesma superfície SVG é usada na prévia e no MP4. O worker inclui apenas os retratos que sua parte pode exibir e usa o renderizador Chromium quando há Intro.

O enquadramento do retrato pertence aos blocos de Intro. O arraste e o Inspetor aplicam os ajustes ao mesmo personagem nessa faixa, preservando os textos e as expressões de cada bloco. O JSON de roteiro preserva o enquadramento de cada parte em `portraitLayout` e `flipX`. Projetos anteriores usam a posição padrão à esquerda e conservam o espelhamento salvo.

A Intro usa o mesmo resolvedor de personagens e o mesmo compositor da cena. O projeto guarda referências opcionais para as variantes faciais e a proporção do retrato de cada parte. Partes contíguas do mesmo personagem podem usar o atlas de transição de pose e expressão. A atualização de retratos ao abrir projetos antigos prepara as variantes quando o personagem está disponível no Customizador. O JSON de roteiro continua descrevendo pose, expressão e enquadramento. O importador produz os retratos e suas variantes.

Se o atlas nativo de uma transição exceder o limite seguro de dimensão ou memória, a exportação omite somente essa animação opcional e continua com os retratos originais da timeline, sem reamostrar nem redimensionar o personagem. A mudança de pose/expressão ocorre sem o tween nessa emenda; o relatório da exportação lista cada bloco omitido, personagem, dimensões do atlas e limite. A preparação antecipada em segundo plano também ignora esse caso sem rejeitar o IPC nem emitir log de erro; falhas reais de renderização continuam visíveis e interrompem a exportação.

O Editor V6 assa os retratos de cada expressão no quadro da pose. O alfa da face não determina o tamanho nem o centro do corpo. Retratos recortados de projetos anteriores são convertidos ao atualizar as imagens, usando o tamanho e a posição salvos para manter o alinhamento. A preparação de transições, cabelo e fala distingue o recorte legado do quadro atual. Estados de expressão da mesma pose compartilham a mesma geometria; o normalizador central da timeline corrige snapshots antigos e atuais tanto em personagens da cena quanto na Intro, ao carregar e após edições. Ele mantém escalas, movimentos intencionais e mudanças de pose, removendo apenas deriva de posição inferior a 0,25 px. A correção de leitura é em memória e não regrava projetos só por abri-los. A importação usa a primeira geometria renderizada da pose como referência para suas demais expressões.

IDs de projeto, elementos, assets, mídias e faixas continuam exigindo UUID v4. IDs de blocos e seus vínculos de timeline aceitam qualquer versão UUID RFC 1–8, pois edições externas podem gerar IDs determinísticos v5. A validação do manifesto informa até oito caminhos de campos inválidos tanto na abertura quanto no salvamento.

Excluir um bloco da timeline remove apenas aquele bloco e preserva o tempo dos demais; não há fechamento automático de espaços. Blocos de fala vinculados ao visual excluído são mantidos no mesmo intervalo e ficam independentes. Para personagens, um estado vazio ocupa o intervalo removido quando necessário para impedir que a pose anterior vaze até o próximo estado. Undo e redo guardam a operação como uma única alteração.

No Poses Dev, o tronco é a referência de posição do modelo. Em **Ferramentas avançadas**, **Levar tronco à posição original** translada o conjunto da pose, inclusive juntas e âncoras de vestuário. Salvar uma correção de pose antiga preserva o manifesto anterior ao alinhamento.

O relógio de piscadas usa o ID do projeto como semente. A cada 75–105 quadros em 30 FPS, sorteia um personagem visível com retrato de piscada no quadro inicial do evento. O sorteio permite repetições. O evento dura quatro quadros e não muda de personagem durante um corte. A Intro e a cena usam a mesma sequência, inclusive após buscas na timeline e entre partes do MP4.

Os personagens da Intro usam as mesmas abas Editor, Rosto e Presets que os da cena. Os comandos de pose, expressão e rosto selecionam a parte da Intro. Quando a imagem muda, a edição grava um retrato novo para a parte, preservando imagens compartilhadas com outras partes ou com a cena. No catálogo de poses, aplicar a toda a Intro usa o mesmo slot no mesmo modelo e procura um nome único equivalente em outros modelos.

- [Aplicação da análise externa](ANALISE-EXTERNA-APLICADA.md) — mudanças aplicadas, verificações e itens que dependem de medição.
- [Execução 1.2](EXECUCAO-1.2.md) — auditoria da rodada anterior e medições da nova rodada.
- [Melhorias de desempenho](MELHORIAS-DE-DESEMPENHO.md) — registro das melhorias adicionais e das verificações.

- [Direção técnica 1.1](DIRECAO-TECNICA-1.1.md) — recomendação de arquitetura e primeiro experimento para decidir onde investir.
- [Pesquisa 1.1](PESQUISA-1.1.md) — evidência do export e hipóteses em ordem.
- [Execução 1.1](EXECUCAO-1.1.md) — próxima rodada, decisões e registro do trabalho.
- [Testes 1.1](TESTES-1.1.md) — como verificar desempenho, qualidade, emendas e limpeza.
- [Prompt para o próximo agente](PROMPT.md).
- [Arquivo preservado 1.7](ARQUIVO-PRESERVADO-1.7.md) e [portão de exclusão manual](LISTA-MANUAL-LIXO-1.7.md).

O código e os relatórios da execução são as fontes de verdade. A [Execução 1.2](EXECUCAO-1.2.md) registra o ZIP histórico de `docs/lixo/` e o SHA-256 `B9A5D49F9447C46FC86CAD297F89718FF6B8D95F39D539D5B6A629EB9224CC2F`, mas o arquivo não foi encontrado nos locais conhecidos de `out`, no lixo local ou na cópia de preservação 1.7 do disco D. O hash é proveniência histórica, não prova de que o ZIP ainda esteja disponível; não recriar uma cópia substituta. As recomendações e permissões antigas precisam de confirmação nos contratos atuais.

## Resultado mais recente

Em 24/11, três pares integrais com filtros e encoder em duas threads mostraram o transporte NUT mais rápido: mediana de **158,484 s**, ganho pareado de **5,458 s (3,33%)** contra 163,943 s. O PCM foi idêntico; as diferenças de imagem ficaram no piso das variações CFR↔CFR e imperceptíveis no quadro inspecionado. O Editor V6 agora usa NUT para quadros repetidos e limita encoder/filtros a duas threads. A meta de 90 s segue aberta. Consulte [Execução 1.5](EXECUCAO-1.5.md).

No perfil padrão sem simplificação, a exportação serial levou **163,760 s** para 200 s de vídeo, usando quatro workers CPU. Validou 6.000 quadros 1080p/30, H.264/AAC, nove emendas e limpeza. O A/B pareado stacked → serial reduziu o corte de 179,261 s para 162,689 s (−9,25%); a diferença entre medições reforça a variação entre execuções. O relatório mostra captura/roundtrip e escrita FFmpeg como o principal custo restante; a meta de 90 s não foi atingida. Nenhum teste C++ foi executado. Veja [Pesquisa 1.1](PESQUISA-1.1.md) e [Execução 1.1](EXECUCAO-1.1.md).

Na rodada mais recente, medi o tempo dentro da função renderer e comparei com o roundtrip. O caminho IPC alternativo ficou 2,3% mais lento em 40 s, embora os hashes amostrados fossem iguais; descartei-o. O transporte padrão segue `executeJavaScript`, com medição interna adicional disponível no relatório. Não fiz export integral, pois o teste curto não mostrou ganho. O resultado completo de 163,760 s segue como referência; veja [Execução 1.1](EXECUCAO-1.1.md).

O A/B curto no transporte de duas camadas separadas foi mais lento que o buffer combinado (+7,2%, uma amostra por lado). A tentativa foi removida; não usar o corte completo nela.

Antecipar o preparo de boca também perdeu 1,7% num corte padrão de 40 s. Mantive o preparo atual intercalado com a renderização; as comparações e o próximo foco estão em [Execução 1.1](EXECUCAO-1.1.md) e [Pesquisa 1.1](PESQUISA-1.1.md).

Na rodada posterior, `paint-event`, concorrência 3 de boca e lote 300 não reduziram o corte integral frente ao padrão. Quatro workers continuam melhores que dois; seis não ajudam por causa da fila de preparação da boca. O relatório agora conserva hits/misses do cache de geometria. Nenhum teste C++ foi executado. Consulte a rodada de 18/11 em [Execução 1.1](EXECUCAO-1.1.md).

Lookahead de dois quadros, encoder com menos threads e lote de boca 1.200 também foram medidos, sem ganho longo que justifique mudança. O último levou 165,006 s contra 163,760 s e aumentou o bake de boca; manter lote 600. O padrão segue com captura `capturePage`, quatro workers, boca concorrência 2/lote 600 e lookahead 1. Nenhum teste C++ foi executado.

O último candidato tentou pular IPC de 880 quadros repetidos em um corte padrão de 40 s. Manteve os hashes amostrados, mas levou 40,705 s contra 40,631 s no controle; foi removido. A investigação continua centrada em captura e transporte de bitmaps. Consulte [Execução 1.1](EXECUCAO-1.1.md).

Na rodada de 21/11, o corte verificado de 6.000 quadros levou mediana de **169,435 s** (mínimo 169,370 s; três controles). Quadros repetidos representam 72,46% dos bytes e 40,21% do tempo bloqueado em parede, liberando um laboratório de timestamps, mas o NUT sintético não cobre o contrato completo; nenhuma mudança foi promovida no export. WebCodecs também ficou inconclusivo. No arraste do palco, estabilizar callbacks e memorizar o trilho reduziu sua duração medida em ~98%; suíte V6, refactor, typecheck, auditoria e build passaram. Consulte [Execução 1.2](EXECUCAO-1.2.md).

Uma espera extra antes da captura reduziu `capturePage` agregado em 1,94 s no corte de 200 s, mas o total ficou 0,379 s mais lento; removi a flag experimental. O padrão continua sem gate RAF. A meta de 90 s está aberta e exige reduzir a etapa sustentada de render/codificação, sem simplificar animações ou resolução.

Na rodada mais recente, gravar quadros únicos em PNG lossless levou 60,422 s em 40 s de vídeo e foi removido. `paint-event` ficou 0,611 s mais rápido numa amostra curta, mas praticamente não alterou renderização e teve preparação menor; o A/B integral anterior também foi mais lento. Nenhum candidato foi promovido. O melhor integral padrão segue 163,760 s; o próximo foco é o custo sustentado no renderer e no roundtrip por quadro. Consulte [Pesquisa 1.1](PESQUISA-1.1.md) e [Execução 1.1](EXECUCAO-1.1.md).

## Rotina para continuar sem supervisão

1. Confira raiz, branch, commit e estado local. Leia o resultado mais recente da execução.
2. Escolha uma hipótese que possa reduzir o tempo total. Use um relatório existente para justificar a escolha.
3. Rode uma verificação sintética curta capaz de distinguir a hipótese das outras etapas. Faça uma mudança por comparação. Quando o resultado for inconclusivo, revise a medição ou avance para outra hipótese testável.
4. Compare tempo de parede, saída e memória. Registre números, limitações e arquivos afetados. Faça commit local seguindo o AGENTS.

## Regra dos 300

Cada Markdown da pasta atual tem até **300 linhas físicas**, inclusive o mestre. Antes de ultrapassar 300, abra uma continuação da mesma série. Use `PESQUISA-1.2.md`, `PESQUISA-1.3.md` e assim por diante. Aplique o mesmo a execução e testes. Para o mestre, preserve este índice e crie `MESTRE-1.2.md` para a continuação. Ligue a série no índice e no fim da parte anterior. Conte as linhas antes de fazer commit. O arquivo histórico contém documentos anteriores a essa regra.

- [Execução 1.3](EXECUCAO-1.3.md) — rastreabilidade, corretude do pipe e medições guiadas por gates.
- [Relatório de retorno 1.3](RELATORIO-RETORNO-RODADA-1.3.md) — estado, verificações e gate de qualidade D3.

## Resultado mais recente: Rodada 1.7

Nenhum candidato passou o gate de promoção atualizado pelo dono para 2% mínimo e mediano. A1 alterou geometria; A2 não tinha redundância comprovada; B1 ficou mais lento; B2 não tinha modelo pré-bake que justificasse heurística; C marcou 2,88% e 1,44% em dois cortes, falhando o mínimo. Não houve mudança de produto ou nova série de 200 s. O baseline vigente permanece 158,484 s da Execução 1.5; a meta de 90 s continua aberta. Consulte [Execução 1.7](EXECUCAO-1.7.md).

A cópia integral do lixo foi verificada em outro disco físico. O portão de exclusão manual e os limites da cópia estão em [Lista manual](LISTA-MANUAL-LIXO-1.7.md) e [Arquivo preservado](ARQUIVO-PRESERVADO-1.7.md).

## Validação mais recente: Plano 1.8

O golden legado v1 continuou idêntico. O golden v2 foi adicionado em uma fixture sintética isolada: Intro bilíngue e GIF no pré-roll, além de cards superior e inferior com tempos de entrada/saída. O resolvedor antes encerrava o quadro ao encontrar uma Intro, ocultando o GIF; agora a prévia e a captura de export mantêm o GIF acima dela. Revalidado em 27/11: o MP4 de 135 quadros não usou fallback e a comparação teve zero quadros/pixels diferentes nas camadas scene, background e foreground. Veja [Plano 1.8](PLANO-1.8.md) e [referência v2](../../../tests/editor-v6/fixtures/golden-export-v2/golden.json).

No perfil de 40 s, quatro workers CPU venceram dois em três pares alternados (mediana −8,35%, mínimo −7,07%), com SSIM acima de 0,999984 e PCM idêntico. A política já é quatro workers no produto, então o ensaio confirmou o padrão e não promoveu mudança. A meta de 90 s/200 s permanece aberta; detalhes no [relatório](RELATORIO-PLANO-1.8-WORKERS-40S.md).

A triagem `fast_bilinear` não reduziu a fase de render em um corte com vídeo quase contínuo e foi removida. O [relatório da triagem](RELATORIO-PLANO-1.8-SCALER-40S.md) registra a comparação e a qualidade.

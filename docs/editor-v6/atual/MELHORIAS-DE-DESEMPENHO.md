# Melhorias de desempenho do Editor V6

Registro das 50 melhorias adicionais solicitadas. Cada item conta uma mudança distinta. A medição de uma função isolada não representa a latência do editor inteiro.

| Nº | Mudança | Evidência |
| --- | --- | --- |
| 1 | Preparar áudio só nos clipes ativos ou prestes a começar, em vez de abrir todos na entrada do projeto. | Inspeção do ciclo de vida e typecheck. Reprodução no Electron pendente. |
| 2 | Buscar candidatos de áudio por intervalo indexado, evitando pausar todos os outros clipes a cada quadro. | Inspeção da busca e typecheck. Sincronismo no Electron pendente. |
| 3 | Selecionar blocos visíveis com busca binária que preserva sobreposições e bordas. | Mil consultas em 20 mil blocos deram os mesmos resultados que o filtro antigo. Mediana de cinco repetições com índice quente: 166,32 ms → 0,33 ms. |
| 4 | Reusar a lista de blocos visíveis em renderizações da faixa que mantêm o mesmo intervalo. | Testes do modelo de faixas e timeline. |
| 5 | Ignorar medições idênticas do viewport para evitar atualizações sem mudança de posição ou largura. | Testes do viewport e typecheck. |
| 6 | Reusar blocos e faixas que continuam iguais após a normalização. | Comparação com a implementação anterior em 80 edições de uma timeline de 20 mil blocos. Documentos iguais. A normalização completa, incluindo os itens 7 e 8, caiu de 167,68 ms para 45,80 ms na mediana de cinco repetições. |
| 7 | Calcular o fim do projeto na mesma leitura que valida início e duração, sem criar listas temporárias de fins. | Comparação acima e testes de timeline. |
| 8 | Ordenar blocos de personagem apenas quando estão fora de ordem. | Comparação acima e testes de timeline e cena. |
| 9 | Preparar o índice de encaixe somente na primeira prévia que usa encaixe. Um clique simples ou arraste com encaixe desativado evita a preparação. | Testes do arraste e typecheck. |
| 10 | Localizar o clipe pai do bloco arrastado diretamente, sem construir um mapa de todos os blocos. | Testes de arraste e timeline. |
| 11 | Reusar a prévia quando o movimento do ponteiro não muda o quadro arredondado nem as entradas do encaixe. | Teste de ponteiro confirma uma única atualização de prévia para movimentos equivalentes. |
| 12 | Evitar publicar a mesma posição de reprodução ao mover o ponteiro dentro de um único quadro da régua. | Teste de ponteiro confirma uma única publicação por quadro. |
| 13 | Compartilhar a composição facial em andamento entre pedidos idênticos. | Doze pedidos simultâneos codificaram um único PNG em teste. O teste no Electron conferiu cinco fundos sem diferença de pixels. |
| 14 | Manter as composições faciais mais usadas no cache, renovando a posição a cada acesso. | Revisão da política e teste de composição. Sem medição isolada de taxa de acerto. |
| 15 | Liberar os canvases de composição também quando a rasterização falha. | Caminho de limpeza em `finally`, typecheck e teste de composição no Electron. |
| 16 | Abrir o vídeo da miniatura somente quando o cartão estiver visível no seletor. | Inspeção do ciclo de observação. Contagem de pedidos no seletor real pendente. |
| 17 | Ordenar os candidatos do seletor uma vez por mudança de seção, filtro ou ordem, em vez de repetir a ordenação a cada tecla. | Cinquenta consultas em 10 mil itens produziram resultados iguais e passaram de 85,26 ms para 28,21 ms com os candidatos preparados, incluindo o item 18. |
| 18 | Reaproveitar nome, ID, número e descrição normalizados entre buscas. | Comparação acima e testes do modelo de busca. |
| 19 | Dar prioridade à digitação e adiar a atualização dos resultados da busca. | Typecheck. Latência de digitação no seletor real pendente. |
| 20 | Atender pedidos de prévia a partir do catálogo confirmado mesmo enquanto a fila de escrita da Base está ocupada. | Teste com a publicação do catálogo suspensa em uma biblioteca isolada com armazenamento ativo. A prévia resolveu o vídeo existente antes da gravação terminar. |
| 21 | Compartilhar a leitura e o índice temporário do catálogo entre pedidos de mídia concorrentes. | Doze pedidos simultâneos fizeram uma única leitura do catálogo. Teste de protocolo confirmou os bytes retornados por intervalo. |
| 22 | Compartilhar o `ffprobe` entre vínculos concorrentes do mesmo vídeo e da mesma revisão. | Typecheck e inspeção da remoção da operação após sucesso ou falha. Medição no Electron pendente. |
| 23 | Solicitar somente os campos usados ao vincular vídeos no Editor V6. | MP4 sintético com vídeo e áudio. A saída do `ffprobe` caiu de 4.743 para 393 caracteres, com duração, dimensões e faixas equivalentes. Sem medição isolada do tempo de processo. |
| 24 | Verificar até três vídeos únicos em paralelo durante a importação JSON. | O teste com seis IDs e uma repetição confirmou seis chamadas, pico de três operações e validação de sobreposição depois da análise. |
| 25 | Reusar a fonte do modelo entre estados importados, inclusive no preparo da referência neutra. | Teste do lote confirma uma leitura de modelo para várias poses e personagens do mesmo slot. |
| 26 | Reusar fontes de poses já carregadas na importação, com limite de oito entradas. | Teste do lote confirma reaproveitamento por modelo e pose, separação de slots e nova tentativa após falha. |
| 27 | Reaproveitar materiais de roupa e cabelo entre os renderizadores criados durante a importação. | Typecheck e inspeção do cache limitado ao trabalho de importação. Ganho no projeto real pendente. |
| 28 | Compartilhar as leituras do catálogo facial entre aplicação de preset, cálculo de transformações e renderização. | Testes do cache cobrem reutilização, isolamento por slot e limite de memória. |
| 29 | Reusar a carga dos efeitos padrão de expressão entre estados importados. | Typecheck e inspeção da sessão de importação. Ganho no projeto real pendente. |
| 30 | Medir o recorte da referência neutra diretamente no canvas, evitando codificar a imagem, decodificá-la e gerar outro PNG só para medir largura e altura. | Mesmo limiar de alfa da rotina anterior. Passaram os testes de elenco e o teste geral de geometria no Electron. Comparação isolada da referência neutra pendente. |

Ainda falta medir numa sessão real a abertura, a inserção de vídeo, a troca de expressão e o sincronismo do áudio. O MP4 não foi cronometrado nesta rodada.

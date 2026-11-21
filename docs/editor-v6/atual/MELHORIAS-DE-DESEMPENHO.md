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
| 31 | Pular a espera em lote para imagens já decodificadas no worker. | Ensaio com 5 mil quadros e 16 imagens quentes, sem decodificação real. Mediana de cinco repetições caiu de 52,58 ms para 6,71 ms junto com o item 32. |
| 32 | Registrar diagnósticos de imagem somente enquanto há trabalho pendente ou falha, sem publicar eventos por imagem já pronta. | No mesmo ensaio, os eventos durante os cinco lotes caíram de 800 mil para zero. O teste de imagem ainda cobre os diagnósticos de decodificação nova. |
| 33 | Preservar a referência da cena quando o loop de boca não muda nenhum elemento. | Testes confirmam a mesma referência em silêncio e durante movimento com face pronta. |
| 34 | Evitar consultar o modo facial fora da reação do cabelo quando o export não tem atlas de boca. | Testes confirmam que o piscar só é substituído durante a reação. |
| 35 | Calcular a amostra de boca apenas se um personagem realmente precisar dela no quadro. | Testes da amostra em fala e da pausa do ciclo durante a reação. |
| 36 | Reusar a variante sem boca de cada rig, permitindo que o compositor identifique a mesma pose em quadros sucessivos. | Teste confirma identidade do rig e alternância correta entre boca isolada e face completa. |
| 37 | Retirar a importação direta do seletor de áudio no painel de exportação para que seu módulo possa carregar sob demanda. | O build final gerou um módulo próprio de 5,21 kB e eliminou o aviso de importação dinâmica ineficaz. |
| 38 | Limitar a quatro as decodificações simultâneas de imagens de cabelo no worker. | Fixture com nove fontes confirma o limite e o compartilhamento do bitmap entre superfície e textura. |
| 39 | Limitar a quatro os canvases de pose mantidos por personagem, liberando os pixels do menos recente. | Teste confirma o reaproveitamento da pose recente, a liberação da antiga e sua recomposição. |
| 40 | Reaproveitar a classificação das peças de cabelo por ordem de composição do rig. | Testes confirmam a ordem das camadas estáticas e das transições. |
| 41 | Consultar apenas o estado de fala ao preparar as amostras de transição, que já mantêm os olhos abertos. | Testes de movimento, piscada e fala. |
| 42 | Adiar o índice de transições da cena enquanto a timeline ainda não tiver nenhum atlas preparado. | Testes de resolução de cena com atlas pronto e sem atlas. |
| 43 | Omitir os limites cumulativos nos índices de personagem, cuja regra é manter o estado até o próximo bloco. | Testes de timeline, incluindo cortes e sobreposição. |
| 44 | Resolver a cena sem ordenar novamente quando o resultado já segue a ordem das camadas. | Comparação de cenas e testes de composição. |
| 45 | Reutilizar os blocos que já estão em ordem ao montar planos de movimento, aceitando projetos com blocos fora de ordem. | Comparação com a versão anterior em timelines ordenadas e invertidas. |
| 46 | Serializar a chave da transição uma única vez após resolver os modos faciais. | Comparação das chaves com a versão anterior e testes de invalidação. |
| 47 | Preencher o modo facial nas amostras recém-criadas, sem gerar uma segunda coleção de amostras. | Comparação das amostras com a versão anterior e testes de movimento. |
| 48 | Pular a preparação do plano de cabelo quando a exportação não contém pacote de cabelo. | Testes do worker sem cabelo e com rig carregado. |
| 49 | Omitir o mapa de blocos de transição no modo padrão de reação à pose, que usa somente os eventos de fim de pose. | Testes do worker e exportação integrada de cabelo. |
| 50 | Pular a busca de pares de transição nas faixas em que o movimento foi desativado pelo usuário. | Testes do plano de movimento e da janela visível. |

Na verificação sintética de MP4, os casos padrão `current-parity`, `capture-profile-unique-320` e `capture-profile-unique-1080` concluíram com 40, 60 e 60 quadros. A suíte parou no caso experimental `capture-profile-paint-1080` por timeout ao aguardar o token de pintura. Os casos posteriores não foram executados nessa tentativa.

## Verificação final

- Uma timeline sintética de 8.550 blocos produziu as mesmas chaves e amostras de transição e 5.880 resoluções de cena iguais às da revisão `ed954389`. A comparação incluiu blocos fora de ordem, fala ligada e desligada, e cenas com e sem atlas preparado.
- Na mediana de cinco repetições, oito montagens de planos de movimento com cache vazio passaram de 537,59 ms para 246,66 ms. Oito primeiras resoluções de cena sem atlas passaram de 573,39 ms para 5,21 ms. São medidas dessas funções em uma fixture grande, sem a interface ou o carregamento de mídia.
- Passaram o typecheck, a auditoria de arquitetura, o build Electron/Vite e 909 testes do Editor V6, com um teste ignorado. A verificação integrada de cabelo passou em 720p e 1080p, incluindo sete quadros de transição, espelhamento, transparência e emendas. O fixture temporário foi removido.
- O corte autorizado em cópia verificada passou no perfil padrão da interface, com boca, cabelo, piscadas e transições. O MP4 tem 6.000 quadros H.264, 1920×1080/30, áudio AAC de 200 s e nove emendas verificadas. Não houve estados de boca ignorados ou obsoletos nem erros de limpeza. MP4 e relatório em `out/editor-v6-stress/runs/performance50-full200-20261121-000942/`.
- A comparação dos 6.000 quadros decodificados com o MP4 histórico de referência deu SSIM de 0,999113. O conteúdo codificado da faixa de áudio teve o mesmo SHA-256.
- O corte levou 184,19 s do início do fluxo até a validação e ficou 21,50 s (13,22%) acima da referência histórica de 162,69 s com os mesmos parâmetros. A renderização passou de 108,67 s para 129,02 s. A soma da espera dos workers após a navegação passou de 14,51 s para 36,84 s, e a taxa de leituras de captura antigas passou de 14,54% para 22,90%. As duas execuções usaram árvores com mudanças locais e a nova medição contém uma única amostra. O relatório não isola a causa da diferença nem confirma ganho no tempo total.
- Ainda falta medir na interface real a abertura, a inserção de vídeo, a troca de expressão e o sincronismo da prévia. O tempo de exportação continua acima da meta de 90 s.

## Troca de preset e pose na timeline

- A troca prepara corpo, rosto, recorte e até quatro PNGs antes de publicar o snapshot. O preset também media de novo o recorte anterior. A edição passava todos os blocos pelo Immer, sincronizava as faixas e calculava planos sem atlas ao limpar snapshots.
- A preparação interativa mantém dois renderizadores recentes e reaproveita seus PNGs e recortes por aparência, transformação, efeitos e modo. Troca de projeto ou revisão de fonte invalida os renderizadores. Uma primeira preparação ainda renderiza as variantes e codifica seus PNGs, com até duas codificações simultâneas.
- A edição de aparência grava pelo caminho do bloco selecionado, sem sincronizar a estrutura inteira. O estado recebe a transformação imutável sobre o documento estável. A limpeza calcula chaves apenas para blocos com atlas preparado.

| Projeto sintético | Ação | Primeira troca, antes → depois | Mediana de sete trocas com repetição, antes → depois |
| --- | --- | ---: | ---: |
| 24 blocos | Preset | 296,3 → 168,3 ms | 140,6 → 0,3 ms |
| 24 blocos | Pose | 160,0 → 131,5 ms | 135,7 → 0,3 ms |
| 8.550 blocos | Preset | 923,2 → 189,3 ms | 856,7 → 7,7 ms |
| 8.550 blocos | Pose | 834,7 → 167,0 ms | 855,1 → 8,1 ms |

O ensaio no Electron compara `014246be` com o caminho atualizado, usando canvases sintéticos de 960×1280. O tempo cobre preparo, gravação no estado e resolução da cena. Os PNGs e recortes comparados foram idênticos. A medição exclui leituras reais do Fabricador e a pintura final da interface. A verificação integrada de movimento e geometria facial também passou.

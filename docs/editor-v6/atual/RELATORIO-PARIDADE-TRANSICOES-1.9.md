# Paridade de transições do Editor V6

## Reprodução

O pensamento bilíngue da Seraphina indicado no print fica ativo durante a troca que termina no quadro 4.127 (2:17,57 a 30 fps). O salto aparece nos quadros 4.120 a 4.126. O corte validado vai de 4.100 a 4.220, com o fim exclusivo, cobrindo o trecho do print e 2:19.

A exportação usou uma cópia isolada do V4 com 428 imagens locais verificadas, Turbo, CPU, dois renderizadores, 1080p e preset 2. O manifesto original tinha SHA-256 `4a314eb3bd533bbb0fa997daa624f15d6a9fe680681a004b3ff43809849f16d7`. A captura da prévia usou a mesma superfície SVG e os mesmos pedidos de animação que o editor em reprodução. Essa captura desenha a cena sobre a cor de fundo porque o SVG isolado não incorpora a imagem da biblioteca.

| Medida a 1080p | Antes da troca | Durante a troca | Depois da troca |
| --- | ---: | ---: | ---: |
| Centro da faixa branca do balão inferior no MP4 anterior | 930,5 px | 813,5 px | 930,5 px |
| Centro da faixa branca do balão inferior no MP4 corrigido | 930,5 px | 930,5 px | 930,5 px |
| Centro da faixa branca do balão inferior na captura da prévia | 927 px | 927 px | 927 px |

A diferença estática entre os rasterizadores na medição da faixa branca foi de 3,5 px. A comparação procurou deslocamento em regiões do gorro, ombro e calça em 14 quadros, incluindo todos os sete da transição e o quadro em 2:19. Os melhores alinhamentos do MP4 corrigido com a prévia ficaram a até 1 px. As imagens de origem da troca tinham o mesmo quadro de 1.122×1.402 e o mesmo limite alfa vertical. O recorte de conteúdo de 960 px no atlas manteve a escala da imagem inteira, equivalente a cerca de 903 px em cena, antes de qualquer corte pela borda do vídeo.

O MP4 corrigido tem 120 quadros e quatro transições preparadas. Os dados de medição e a montagem da comparação estão em `out/editor-v6-stress/runs/v4-parity-evidence/`. O corte gerado com os snapshots mais recentes está em `out/editor-v6-stress/runs/v4-parity-current/`.

## Causas e correções

- `cd7a461f` estabilizou as dimensões dos retratos da timeline. Os commits posteriores introduziram proteções de orçamento e a separação entre quadro-fonte e área visível no atlas. O resolvedor de cena ainda reaproveitava a posição e as dimensões do recorte da animação para posicionar o balão e apontar a cauda. A referência agora é a geometria do personagem na timeline, inclusive quando um atlas está ativo. A chave de reutilização também inclui tradução, layout resolvido e âncora do balão.
- A principal diferença de composição encontrada no caminho de cabelo contínuo era expandir um sprite recortado como se tivesse o tamanho e a origem do retrato estático. O exportador agora só substitui o sprite quando tem as camadas da mesma amostra e o respectivo recorte. A preparação dessas camadas abrange também mudanças faciais e independe do cache dos retratos. O preset de reação de pose continua usando o atlas canônico nessa etapa.
- A dimensão visível nas pontas de uma transição pode subestimar um quadro intermediário. O montador detecta esse caso, libera a tentativa e recalcula a grade a partir das amostras visíveis. O orçamento e a resolução nativa são mantidos. A versão da chave mudou para invalidar atlas antigos.
- A prévia só solicitava ativamente atlas da Intro. Agora ela solicita os atlas de personagem e Intro que se aproximam no cursor, usando o mesmo preparador e resolvedor da exportação. A fila adiantada é limitada aos próximos seis planos dentro de três segundos.

## Verificações

- MP4 real no perfil Turbo padrão com dois renderizadores, 120 quadros e 4/4 transições. A preparação do corte ficou em 1,91 s. Esse corte não mede o tempo de exportação integral.
- Segundo MP4 do mesmo corte com cabelo contínuo e quatro transições em camadas. Os centros dos balões permaneceram estáveis. O gorro e a calça tiveram alinhamento de 0 px com a prévia nos 14 quadros medidos. A área do ombro inclui cabelo em movimento.
- Golden estendido offscreen, 135 quadros. Intro bilíngue, GIF e cards. Zero diferença de pixels nas camadas capturadas contra a referência.
- Sobreposição de vídeo offscreen, 60 quadros em duas partes Turbo, e sequência de 150 quadros com Intro, GIF e cards. Prioridade, duração e emendas aprovadas.
- Fixture de cabelo offscreen com diagnósticos ativos. Os sete quadros de transição, o encaixe Turbo e o MP4 foram aprovados.
- Suíte Vitest do Editor V6 com 987 aprovados e um ignorado. Build, typecheck e auditoria de arquitetura aprovados.

A comparação do projeto real é local ao trecho indicado. No MP4, a codificação e os efeitos habilitados só no exportador, como o preset de cabelo e a abertura cíclica da boca, podem modificar pixels mesmo quando a geometria coincide.

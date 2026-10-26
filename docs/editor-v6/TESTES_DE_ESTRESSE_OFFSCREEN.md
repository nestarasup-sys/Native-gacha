# Testes offscreen do Editor V6

**Data:** 26/10/2026
**Executável:** `npm run test:editor-v6:stress-offscreen`

## O que foi testado

O teste inicia o app Electron completo em modo de desenvolvimento, posiciona a janela nativa fora dos monitores e mantém o Chromium ativo. O runner acessa o renderer por CDP local, cria e abre projetos pela interface normal do Editor V6 e mede a reprodução. O processo usa o IPC do app e o mesmo `SceneSurface` da prévia. Não é reprodução simulada em Vitest.

Os projetos usam os quatro personagens reais que já existem no Customizador:

- `STRESS_Aurora`
- `STRESS_Nix`
- `STRESS_Brisa`
- `STRESS_Dorian`

Para cada personagem, o motor real do Editor V6 gerou dois snapshots de poses do Fabricador e dois atlas de transição, um em cada direção. Os atlas usam sete amostras por transição de 250 ms. O renderizador recortou os snapshots e calculou a geometria final antes de gravar os projetos; ao abrir, a normalização do app preservou as animações e não reportou transições ausentes.

## Resultados da reprodução

Cada cenário foi reproduzido por seis segundos. Confirmei que os quatro personagens aparecem como camadas da cena e que o relógio de reprodução avançou até seis segundos.

| Cenário | Duração | Blocos no projeto | Transições planejadas | Blocos desenhados na timeline | `requestAnimationFrame` médio | p50 | p95 | Pior intervalo | Long tasks da página |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Leve | 30 s | 80 | 28 | 50 | 73,5 Hz | 13,3 ms | 13,6 ms | 66,4 ms | 2, total 117 ms |
| Médio | 2 min | 284 | 92 | 47 | 73,5 Hz | 13,3 ms | 13,6 ms | 80,0 ms | 2, total 126 ms |
| Pesado | 5 min | 752 | 284 | 51 | 73,5 Hz | 13,3 ms | 13,7 ms | 66,5 ms | 2, total 115 ms |

Após separar o relógio da página, a rota do editor teve 181/183/184 commits em seis segundos, contra 363 em cada cenário na rodada anterior. O tempo React acumulado na rota caiu aproximadamente pela metade: média por commit de 2,80/3,05/3,02 ms, com picos de 39,3/40,3/40,3 ms. A área de prévia (resolução da cena mais superfície SVG) teve custo médio de 0,92/0,98/1,00 ms e não registrou long tasks próprias. A timeline manteve entre 47 e 51 blocos no viewport, mesmo com 752 blocos no projeto pesado.

Durante o Play, o teste observou sprites de transição dos quatro personagens em cada cenário. Nos primeiros seis segundos, encontrou seis dos sete quadros programados: os quadros 108, 146 e 121 não foram observados nos cenários leve, médio e pesado. Como a leitura do DOM ocorre por RAF, ainda é preciso determinar se o playback pulou esses quadros ou se a amostragem coincidiu com a atualização visual.

Nesta rodada, o preparo dos atlas reais levou de 569,6 a 721,8 ms por transição, em oito transições medidas. Cada atlas tem sete amostras e 8.006.184 pixels (perto do limite de 8,1 MP). O tempo de reprodução é medido depois do preparo: abrir os projetos testados não deixou transições pendentes.

## Leitura dos números

Os cenários avançaram o relógio durante a reprodução, inclusive o projeto pesado, e renderizaram os quatro personagens STRESS. O p95 de RAF ficou em 13,6–13,7 ms, abaixo de um quadro de 30 FPS (33,3 ms). A separação do relógio reduziu pela metade o trabalho React acumulado na rota, mas os picos de RAF chegaram a 80 ms, a página ainda teve long tasks de 115–126 ms por cenário e uma amostra de transição não foi observada. Esta rodada não comprova fluidez perfeita em todos os quadros.

Os 73,5–74,0 Hz vêm da cadência de `requestAnimationFrame` deste Chromium e deste monitor. O Editor continua avançando a timeline a 30 FPS. A rodada não mede exportação MP4, FFmpeg nem o executável empacotado; ela mede a prévia, a timeline e a preparação das transições no app Electron em desenvolvimento.

## O que esta rodada ainda não valida

- O stress run confirma personagens, relógio e sprites de transição. Testes de lógica verificam `talk` por fala, ausência de `talk` por pensamento e piscadas determinísticas; o teste de movimento inclui esses modos no atlas quando coincidem com uma transição. A captura stress não compara pixel a pixel boca/olhos durante as falas.
- A reprodução foi medida em Electron em desenvolvimento, com a janela fora dos monitores e em uma tela de aproximadamente 75 Hz. O RAF não mede diretamente todos os quadros que o usuário percebe, nem representa hardware mais fraco ou o app empacotado.
- O stress run não inclui mídia de vídeo/áudio. Um teste Electron separado exportou vídeo sintético em movimento, confirmou que o personagem fica sobre ele, verificou o trecho e o quadro de origem e mixou áudio de vídeo e WAV. Ainda faltam fontes reais de codecs variados e uma comparação visual de cada codec na prévia.

## Outras verificações executadas

- `npm run test:editor-v6:motion`: passou; compositor real no Chromium, sete amostras de atlas, leitura do catálogo e movimento progressivo de peças. A fixture é sintética; os personagens reais foram medidos pelo teste offscreen acima.
- `npm run test:editor-v6`: 38 testes passaram; um teste opt-in foi ignorado.
- `npm run test:editor-v6:surface`: passou; preview/captura, comparação de pixels e integração do painel de áudio.
- `npm run test:editor-v6:export`: build de produção e teste FFmpeg passaram; além do MP4 de 81 quadros/77 reutilizados, verificou vídeo importado quadro a quadro, personagem à frente do vídeo, gap antes do início, entrada de origem, mixagem, dois workers, cancelamento e transição cruzando a emenda Turbo.

## Arquivos de evidência

O runner salva as três capturas e os dados completos em `out/editor-v6-stress/`:

- `light-offscreen.png`
- `medium-offscreen.png`
- `heavy-offscreen.png`
- `offscreen-performance.json`

Os projetos `[TESTE]` com as quatro personagens ficam em `app-data/runtime/profile/studios/Editor V6` e são regenerados ao executar o comando acima.

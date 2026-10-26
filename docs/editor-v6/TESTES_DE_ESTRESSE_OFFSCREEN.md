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
| Leve | 30 s | 80 | 28 | 50 | 73,8 Hz | 13,3 ms | 13,6 ms | 53,3 ms | 2, total 106 ms |
| Médio | 2 min | 284 | 92 | 47 | 74,0 Hz | 13,3 ms | 13,6 ms | 53,4 ms | 2, total 100 ms |
| Pesado | 5 min | 752 | 284 | 51 | 73,5 Hz | 13,3 ms | 13,6 ms | 53,4 ms | 1, total 58 ms |

O custo médio de commit React da `SceneSurface` foi de 0,49 ms no leve, 0,48 ms no médio e 0,50 ms no pesado; não houve long task atribuída à cena. A rota do editor teve 363 commits em cada janela de seis segundos, com média de 2,80/2,68/3,04 ms e picos de 40,6/36,5/44,8 ms. O DOM da timeline manteve entre 47 e 51 blocos no viewport, mesmo com 752 blocos no projeto pesado. Isso confirma, nesta rodada, que o scroll da timeline não montou todos os blocos ao mesmo tempo.

Durante o Play, o teste observou sprites de transição dos quatro personagens em cada cenário. Nos primeiros seis segundos, encontrou seis dos sete índices internos do atlas por personagem; um índice não apareceu no DOM amostrado por cenário (108 no leve, 145 no médio e 121 no pesado). O teste observa a cena por `requestAnimationFrame`, então é preciso investigar possível frame omitido durante playback e considerar que a captura por RAF pode perder uma atualização curta.

O preparo de atlas com os personagens reais levou de 554 a 689 ms por transição, com sete amostras e 8.006.184 pixels no atlas (perto do limite configurado de 8,1 MP). O tempo de reprodução é medido depois do preparo: abrir os projetos testados não deixou transições pendentes.

## Leitura dos números

Os cenários avançaram o relógio durante a reprodução, inclusive o projeto pesado, e renderizaram os quatro personagens STRESS. O p95 de RAF ficou em 13,6 ms, abaixo de um quadro de 30 FPS (33,3 ms). Também ocorreram picos de 53 ms, uma amostra interna de transição não foi observada em cada reprodução e a página principal teve long tasks de 58 a 106 ms somadas por cenário. Há espaço para engasgos curtos, então esta rodada não comprova fluidez perfeita em todos os quadros.

Os 73,5–73,6 Hz vêm da cadência de `requestAnimationFrame` deste Chromium e deste monitor. O Editor continua avançando a timeline a 30 FPS. A rodada não mede exportação MP4, FFmpeg nem o executável empacotado; ela mede a prévia, a timeline e a preparação das transições no app Electron em desenvolvimento.

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

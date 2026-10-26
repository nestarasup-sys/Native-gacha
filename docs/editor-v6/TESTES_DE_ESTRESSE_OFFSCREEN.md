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

| Cenário | Duração | Blocos no projeto | Transições planejadas | Blocos desenhados na timeline | `requestAnimationFrame` médio | Intervalo p95 | Pior intervalo | Long tasks da página |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Leve | 30 s | 80 | 28 | 50 | 74 Hz | 13,6 ms | 53,0 ms | 1, total 57 ms |
| Médio | 2 min | 284 | 92 | 47 | 74 Hz | 13,6 ms | 53,3 ms | 1, total 52 ms |
| Pesado | 5 min | 752 | 284 | 51 | 73,8 Hz | 13,6 ms | 53,0 ms | 1, total 51 ms |

O custo médio de commit React da `SceneSurface` foi de 0,45 ms no leve, 0,47 ms no médio e 0,48 ms no pesado. O DOM da timeline manteve entre 47 e 51 blocos no viewport, mesmo com 752 blocos no projeto pesado. Isso confirma, nesta rodada, que o scroll da timeline não montou todos os blocos ao mesmo tempo.

O preparo dos atlas levou de 550 a 650 ms por transição, com média de aproximadamente 575 ms para sete amostras. O tempo de reprodução é medido depois do preparo: abrir os projetos testados não deixou transições pendentes.

## Leitura dos números

Os cenários mantiveram a reprodução no computador desta rodada, inclusive o projeto pesado. O p95 de 13,6 ms ficou abaixo de um quadro de 30 FPS (33,3 ms). Ainda houve um pico isolado de 53 ms em cada cenário e uma long task de 51 a 57 ms. Portanto, a cena foi fluida na maior parte da amostra, com alguns engasgos curtos; o resultado não indica fluidez perfeita em todos os quadros.

Os 73,8 Hz vêm da cadência de `requestAnimationFrame` deste Chromium e deste monitor. O Editor continua avançando a timeline a 30 FPS. A rodada não mede exportação MP4, FFmpeg nem o executável empacotado; ela mede a prévia, a timeline e a preparação das transições no app Electron em desenvolvimento.

## Arquivos de evidência

O runner salva as três capturas e os dados completos em `out/editor-v6-stress/`:

- `light-offscreen.png`
- `medium-offscreen.png`
- `heavy-offscreen.png`
- `offscreen-performance.json`

Os projetos `[TESTE]` com as quatro personagens ficam em `app-data/runtime/profile/studios/Editor V6` e são regenerados ao executar o comando acima.

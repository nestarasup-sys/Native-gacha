# Editor V6 — Rodada 01: resultados

Data: 31/10/2026
Base local: `98bea62` (`Dev-V2`)
Branch de trabalho: `codex/editor-v6-performance-mouth`
Baseline: [RODADA_01_BASELINE_2026-10-30.md](RODADA_01_BASELINE_2026-10-30.md)

Todos os perfis e exports desta rodada usam dados sintéticos em diretórios temporários isolados. Nenhum projeto, asset ou perfil pessoal foi aberto. As alterações permanecem somente no repositório local.

## Causas confirmadas e correções

- O loop da boca rasterizava e substituía a imagem inteira do personagem por amostras de atlas. O limitador de pixels podia reduzir o atlas e, junto dele, todo o personagem. Agora o bake compara as imagens e guarda apenas a menor região com pixels alterados, na resolução nativa, por cima da imagem estática. Transições de pose preservam o atlas do corpo em resolução nativa e guardam a boca numa camada separada. Se a composição nativa exceder o orçamento, a exportação falha com uma mensagem recuperável em vez de reamostrar o corpo.
- A opção `mouthLoop: false` podia desligar a animação no painel e no processo principal. O controle foi removido; o runner força o loop também para chamadas antigas. Trechos sem fala vinculada não preparam atlas. Falta de personagem, fonte desatualizada, bake incompleto ou falta de orçamento interrompem o export antes de publicar o MP4.
- Cada movimento do ponteiro repetia filtragem, ordenação, busca de vizinhos e varredura dos pontos de snap. Vizinhos, pai e pontos ordenados agora são calculados no início do arraste; cada movimento consulta apenas o intervalo próximo por busca binária. A ordem anterior das guias, inclusive empates, está coberta por teste.
- A detecção de fala por estado repetia buscas lineares. Os intervalos mesclados são indexados uma vez por timeline e consultados por busca binária. O cache de bake conta também as camadas faciais; em disco, reutiliza entradas entre orçamentos após validação, enquanto o cache em memória e os trabalhos simultâneos ficam separados por teto de pixels.

## Medições

### Timeline

O benchmark de snap usa 20.000 blocos e 240 movimentos de ponteiro, comparando a varredura completa com o índice pré-calculado na mesma execução. As respostas são iguais, inclusive em empates.

| Caminho de snap | Tempo total | Tempo por movimento |
| --- | ---: | ---: |
| Varredura de todos os blocos | 673,66 ms | 2,807 ms |
| Índice pré-calculado + busca binária | 0,90 ms | 0,0037 ms |

Nesse microbenchmark, o trecho de consulta ficou 749× mais rápido. Isso mede o cálculo do snap, não o tempo completo entre input, React e pintura.

O teste offscreen de 30 segundos por cenário terminou sem erros de página ou lacunas lógicas/DOM. A coleta usou quatro personagens sintéticos:

| Cenário | Blocos | Nós visíveis de bloco | p95 RAF | Atualizações DOM/s | Heap JS máxima |
| --- | ---: | ---: | ---: | ---: | ---: |
| Leve | 80 | 10 | 13,6 ms | 29,96 | 54,1 MiB |
| Médio | 284 | 20 | 13,6 ms | 30,03 | 96,8 MiB |
| Pesado | 752 | 31 | 13,6 ms | 29,97 | 84,5 MiB |
| Multimídia | 288 | 30 | 13,6 ms | 29,96 | 71,9 MiB |

Todos tiveram 0 lacunas de frame/DOM, 0 erros de página e nenhum long task registrado. O renderer ficou em cerca de 75 callbacks RAF/s. A heap JavaScript observada não é RSS de todo o renderer nem representa uma tela física. A diferença de heap entre casos depende do material sintético e da coleta do Chromium.

Como referência, o benchmark anterior de planos visíveis com 30.000 blocos ficou em 80,313 ms para varredura integral e 0,133 ms para 34 planos visíveis; nesta rodada ficou em 80,705 ms e 0,119 ms. Esse caminho já existia no baseline e permaneceu estável; não é ganho atribuído a esta mudança.

### Export e resolução da boca

O teste de estresse de 301 quadros usa bake mockado e atlas minúsculo, para medir o pipeline de captura/codificação. Baseline: 2,513 s, 119,8 fps efetivos e RSS máximo do processo principal de 141,1 MiB. Na última execução depois das mudanças: 2,583 s, 116,5 fps e 145,8 MiB (+2,8% no tempo e +4,7 MiB de RSS). Esse caso não mostra ganho material; a diferença é pequena e não valida o tempo de rasterização de assets reais.

Para qualidade, o Chromium compôs uma fixture sintética de 640×960 com o renderer de personagens, executou `bakeEditorV6Motion` e entregou o atlas gerado a exports reais Electron/FFmpeg de 40 quadros em 720p e 1080p. O corpo ficou numa imagem estática; somente o recorte da boca mudou. Cada export inclui três personagens falando: um normal, um menor espelhado/rotacionado e um maior rotacionado. A fala atravessa a emenda entre os dois trechos Turbo. Foram comparados quadros imediatamente antes, durante e depois da fala.

| Export | Tempo / FPS efetivo | RSS de pico do processo principal | Atlas facial por personagem | MAE fora da região facial |
| --- | ---: | ---: | ---: | ---: |
| 1280×720 | 1.736 ms / 23,0 fps | 162,1 MiB | 18.720 px | 0,0000 |
| 1920×1080 | 2.519 ms / 15,9 fps | 230,9 MiB | 18.720 px | 0,1015 |

O bake facial levou 303,3 ms nesta execução. A região de uma amostra mede 78×60 (4.680 px); o atlas 156×120 mantém três amostras na resolução nativa. Para comparação de armazenamento, três quadros completos de 640×960 em células 2×2 ocupariam 2.457.600 px. O patch usa 99,24% menos pixels neste fixture. As áreas de boca mudaram durante a fala e voltaram ao estado-base depois. Na emenda Turbo, a contagem de pixels verdes foi 385→388 em 720p e 800→800 em 1080p. O MAE foi calculado nos quadros imediatamente antes/durante, fora das regiões da boca e uma margem de 24 px; a tolerância explícita é 5 para diferenças de compressão H.264.

O tempo de exportação facial é uma medição de uma fixture sintética curta, sem comparação antes/depois; ele varia com a carga local e não deve ser comparado diretamente ao teste de estresse separado. O RSS é amostrado no processo principal a cada 500 ms, portanto pode não capturar picos breves.

Imagem comparativa extraída do MP4 1080p: quadro 7 (antes) à esquerda e quadro 16 (durante) à direita. O fundo quadriculado é uma fixture de alta frequência para revelar perda de nitidez; não é asset de usuário.

![Comparação da boca antes e durante a fala](/C:/TRABALHO%202/OUTROS/GACHA%20EM%20C++/out/editor-v6-face-export-check/face-mouth-compare-1080.png)

RSS reportado é somente do processo principal, amostrado a cada 500 ms. Os testes não separam RSS de renderizadores Electron e FFmpeg; não se infere dali o consumo total da máquina.

## Verificações executadas

- `npm run test:editor-v6`: 36 arquivos aprovados, 1 skip; 194 testes aprovados, 1 skip.
- `npm run typecheck`: aprovado.
- `npm run build`: aprovado.
- `npm run audit:architecture`: aprovado, sem violações.
- `npm run test:editor-v6:motion`: bake Chromium aprovado; source 640×960, atlas facial 18.720 px.
- `npm run test:editor-v6:face-export-silent`: exports Electron/FFmpeg em 720p e 1080p aprovados; loop forçado mesmo recebendo `mouthLoop: false` antigo.
- `npm run test:editor-v6:export`: aprovado; 81 quadros, áudio contínuo na emenda Turbo, cancelamento preserva destino, movimento atravessa a emenda. O resumo inclui um cenário de fallback intencional.
- `npm run test:editor-v6:export-overlay`: aprovado; 60 quadros, duas partes Turbo e três entradas de vídeo.
- `npm run test:editor-v6:motion-service`: aprovado; cache, workers, cancelamento e recuperação verificados com fixture 100×100.
- `npm run test:editor-v6:stress-offscreen`: quatro cenários de 30 segundos aprovados; zero lacunas de frame/DOM e zero erros de página.
- Benchmark de arraste/snap: 20.000 blocos, 240 movimentos; os resultados indexados são idênticos aos da varredura completa.

## Limites e próxima medição

- O ganho de snap é de um microbenchmark; ainda não mede scroll, zoom, seleção ou latência input-a-pintura na janela visível.
- O offscreen contém no máximo 752 blocos; o caso com 20.000 blocos cobre o snap, não a composição completa de timeline.
- A fixture facial é sintética. Não existe um MP4 anterior com personagem real do usuário para uma comparação antes/depois, e nenhum asset pessoal foi usado. A evidência confirma a composição localizada no pipeline real e a fidelidade fora da boca nesta fixture, inclusive com três transformações e a emenda Turbo.
- O export de estresse longo ainda usa bake mockado. A otimização não reduziu o tempo ou RSS total nesse caso, pois captura/codificação dominam o percurso curto. Uma rodada maior e memória separada por processo continuam necessárias antes de afirmar as metas de −20%.
- Os testes validam continuidade de transição, blink automático e boca em fala; uma medição de sincronismo com faixa de áudio real e perfil de memória por renderer/FFmpeg continua pendente.

Nenhum push, Pull Request ou merge foi feito.

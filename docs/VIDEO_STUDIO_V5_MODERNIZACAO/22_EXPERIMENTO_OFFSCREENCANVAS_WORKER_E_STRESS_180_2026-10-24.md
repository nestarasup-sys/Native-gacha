# Video Studio V5 — Experimento OffscreenCanvas/Worker e estresse de 180 s

**Data:** 24/10/2026  
**Branch:** `Main-desenvolvimento`  
**Base de referência:** commit `9f120cedd8bc3b3ac40d9972563d2d3361f48e62`  
**Decisão:** manter o Canvas autoral como caminho padrão. O Worker OffscreenCanvas funciona no pipeline de exportação, mas foi reprovado pelo gate de igualdade de pixels e não foi mais rápido na mediana deste A/B.

## Resumo

Foi implementado um experimento isolado que executa a rasterização de personagens no `VideoCharacterFrameRenderer` e `TransitionRenderer` dentro de um Web Worker com `OffscreenCanvas` 2D. O Worker devolve `ImageBitmap` transferível; a composição final de cena, mídia e texto e a leitura RGBA continuam na superfície de exportação existente.

O Worker é habilitado apenas pela opção de diagnóstico `?characterWorker=1`. O padrão continua Canvas. Se o Worker não iniciar ou falhar ao renderizar, a superfície volta ao Canvas. A prévia interativa não foi conectada ao novo Worker.

O teste principal de 180 segundos exportou a cena mista pelo Canvas tradicional: **10.800/10.800 frames únicos, em ordem, sem perdas ou duplicatas**, vídeo H.264 de 1920×1080/60 e áudio AAC de 48 kHz, ambos com 180 segundos. O tempo total foi 12 min 15 s, ou 14,69 frames/s de throughput.

No A/B curto, com quatro personagens e vídeo importado, o Worker teve mediana de exportação 3,2% mais lenta e não produziu igualdade exata em nenhum dos 300 frames das três repetições. Não foi ampliada a tolerância visual. Portanto, o experimento não foi promovido a caminho padrão.

## Arquiteturas distinguidas

| Mecanismo | Significado neste projeto | Resultado da investigação |
|---|---|---|
| `BrowserWindow` com `offscreen: true` | Janela Electron sem apresentação visual, usada pela exportação para renderizar uma página/superfície fora de tela. | Já existia antes deste experimento e foi usado nos dois braços A/B e no soak. Isso, por si só, não desloca Canvas 2D para um Worker. |
| `OffscreenCanvas` + Web Worker | Superfície Canvas 2D criada no Worker, sem `document` ou DOM, para rasterizar o personagem fora da thread principal da página. | Implementado para a rasterização dos personagens na exportação, opcional e isolado. |
| Superfícies e caches reutilizáveis | Canvases intermediários, camadas estáticas e materiais preparados que evitam alocações/desenhos repetidos. | Continuam sendo usados pelo Canvas autoral e pelo Renderer compartilhado. São uma técnica de cache, não um Worker nem uma janela Electron offscreen. |

O pipeline efetivamente testado foi:

```text
VideoExportSurfacePage
  → VideoCharacterFrameRenderer / TransitionRenderer
  → Canvas 2D no Worker (opcional)
  → ImageBitmap transferível
  → composição final e readback na superfície Electron existente
  → writer RGBA / FFmpeg
```

O fluxo de prévia segue no Canvas existente. `VideoStudioDomElement` aceita `OffscreenCanvas` nos limites necessários, e `canvasSurface.ts` cria superfícies sem depender de `document`. A fronteira de carregamento de assets no Worker usa `fetch(dataURL)` e `createImageBitmap`; imagens são fechadas ao serem expulsas do cache. Partes do renderer continuam dependentes de APIs do lado de janela, por exemplo o `assetProvider` de `window.desktop`; o protótipo entrega ao Worker um snapshot limitado dos assets e não move a API de projeto/IPC para lá. O código de composição final não foi reescrito.

### Limites e descarte

- Um pedido de renderização por vez; sem fila ilimitada de frames. O writer conserva uma pré-busca limitada e aplica backpressure.
- Cancelamento via `AbortSignal`, timeout de frame e encerramento do Worker ao descartar a sessão.
- Worker: orçamento de recursos de 224 MiB compartilhado entre caches; cache de imagens limitado a 96 MiB/256 entradas. `ImageBitmap` é fechado ao ser expulso.
- Superfície de exportação: limite de admissão de cache de 256 MiB.
- Esses limites contabilizam recursos admitidos nos caches, não toda a memória real do Chromium/GPU; os limites não formam um único ledger global entre threads. O consumo de processo medido abaixo é a observação complementar.
- `PixiJS` permaneceu desligado; aceleração de hardware Chromium desabilitada nos dois braços A/B e no soak.

## Ambiente e método

| Item | Valor observado |
|---|---|
| Sistema | Windows `10.0.26300` |
| CPU | AMD Ryzen 5 4600G with Radeon Graphics, 12 processadores lógicos |
| RAM física reportada | 16.526.802.944 bytes (aprox. 15,4 GiB) |
| FFmpeg | 8.1.2; encoder H.264 `h264_mf` |
| Resolução e FPS | 1920×1080, 60 FPS |
| GPU PixiJS | Desligada |
| Aceleração Chromium | Desabilitada nos testes comparativos |
| Dados de teste | Fixtures Gacha geradas em diretório temporário; nenhum projeto ou asset pessoal foi alterado |

O harness passa pela `VideoExportSurfacePage`, pelo `VideoSceneIR` e pelo renderer de personagens reais do aplicativo; os frames vão ao writer RGBA/FFmpeg. A fixture completa inclui corpo e cabeça, roupas, mangas, cabelo atrás e à frente do rosto, óculos, pupilas PT, sobrancelhas, tom de pele e estados faciais usados pela animação. Os cenários repetem transições determinísticas entre poses. O perfil misto acrescenta elementos de texto/fala, vídeo gerado/importado e áudio.

## Benchmark A/B: Canvas vs OffscreenCanvas Worker

Condições iguais nos dois braços: 5 segundos, 300 frames, 1920×1080/60, quatro personagens Gacha, textos/fala e um clipe de vídeo, encoder H.264 `h264_mf`, Canvas de exportação e cache com os mesmos limites, aceleração desabilitada e Pixi desligado. Foi feito um aquecimento por braço e três repetições pareadas. O plano de benchmark não incluiu faixa de áudio. O Worker não acionou fallback em nenhuma repetição, então o braço B mediu de fato o caminho experimental.

| Métrica (mediana das 3 repetições) | Canvas autoral | Worker OffscreenCanvas |
|---|---:|---:|
| Tempo de exportação | 22.385 ms | 23.122 ms |
| Throughput total de exportação | 13,40 FPS | 12,97 FPS |
| Latência de frame P50 | 55,35 ms | 58,35 ms |
| Latência de frame P95 | 69,85 ms | 72,78 ms |
| Latência de frame P99 | 76,23 ms | 82,53 ms |
| Pico de working set da árvore Electron | aprox. 1,25 GB | aprox. 1,26 GB |
| CPU média da árvore Electron | aprox. 12,9% | aprox. 13,4% |

O índice de velocidade foi `Canvas / Worker = 0,968`: o Worker ficou cerca de **3,2% mais lento** na mediana do tempo de exportação. O P95 também ficou aproximadamente 4,2% mais alto. A média de CPU e o pico de RAM foram ligeiramente maiores no Worker. Os valores de CPU/RAM excluem o processo externo FFmpeg.

### Comunicação e cache do Worker

Por execução de 300 frames, o perfil medido registrou 600 mensagens, 842 transferências de `ImageBitmap`/recursos contabilizadas pelo harness e 146.572.320 bytes transferidos (aprox. 146,6 MB). A soma de roundtrips medidos do Worker ficou entre 3,36 e 4,04 s; a conversão/entrega de bitmap ficou entre 59 e 72 ms; o tempo agregado de `postMessage` foi cerca de 15–16 ms e a inicialização ficou em 7,7–8,4 ms. Esses acumulados de tarefas podem se sobrepor a composição, decodificação e escrita: não devem ser somados como se fossem estágios seriais.

O cache interno de camadas do renderer do Worker teve 1.158 misses e nenhum hit neste perfil, com pico de aproximadamente 45,4 MB. O cache de imagens teve 4.670 hits, 10 misses, nenhuma falha ou invalidação e pico contabilizado de 248.104 bytes. Os resultados mostram que a transferência de bitmaps e o trabalho redundante de renderização não foram compensados neste cenário.

### Paridade visual

- Comparação feita nos bytes RGBA dos frames, antes da codificação H.264, com SHA dos frames e contagem de diferenças. O gate exigiu igualdade exata; nenhuma tolerância foi ampliada.
- No aquecimento e em cada uma das três repetições, todos os 300 frames tiveram ao menos uma diferença; a primeira divergência foi o frame 0 e a última foi o frame 299.
- No exemplo do frame 0: 694 pixels diferentes, 1.844 bytes diferentes e delta máximo de canal 1. As diferenças observadas estavam na área do personagem; os pixels de exemplo eram opacos. Isso reprova igualdade exata mesmo que a variação amostrada seja pequena.
- No benchmark suplementar de personagem básico houve divergência em 126/300 frames e delta máximo de canal 2.
- A origem técnica precisa da variação ainda não foi isolada entre decodificação via `createImageBitmap`, premultiplicação/arredondamento de Canvas ou outra etapa de rasterização. Não se afirma paridade visual.

O oráculo existente de preview/export Canvas foi executado separadamente e passou pelos limites já documentados para esse teste: fundo exatamente igual, razão geral de pixels alterados 0,00792 e MAE 0,364, além das regiões de texto/extensão dentro do gate existente. Esse teste é de preview/export atual; não demonstra paridade do Worker nem cobre todas as combinações visuais do personagem.

## Soak completo de 180 segundos

Execução final: perfil `mixed`, backend `canvas`, variante animada. O timestamp de latência foi corrigido para começar no envio do pedido IPC (e não após a espera do writer); os números abaixo vêm da execução completa posterior à correção. Uma primeira execução de 180 s foi substituída por esta medição corrigida.

| Configuração/resultado | Valor |
|---|---:|
| Duração / quadros esperados | 180 s / 10.800 |
| Personagens / transições | 4 / 1.436 (359 por personagem) |
| Conteúdo adicional | 4 textos, 4 elementos de fala, 1 vídeo importado/gerado e áudio AAC |
| Preparação / início da superfície | 3.287,7 ms / 155,1 ms |
| Render + encode / montagem | 700.489,2 ms / 3.534,2 ms |
| Tempo total de exportação | 735.294,7 ms (12 min 15 s) |
| FPS de renderização / throughput total | 15,42 / 14,69 FPS |
| Fator de tempo real | 0,2448× |
| Latência de frame média / mediana | 60,57 / 59,56 ms |
| Latência P95 / P99 / máxima | 78,92 / 95,46 / 226,49 ms |
| RAM inicial / pico / final da árvore Electron | 223,8 MB / 1.692,9 MB / 1.493,2 MB |
| CPU média / pico da árvore Electron | 15,14% / 26,55% |
| GC observado no processo Electron principal | 3.251 eventos; 4.051 ms acumulados; pausa máxima 6,72 ms |

Os custos atribuídos por frame foram: `characterMs` 112.095,5; `mediaDecodeMs` 248.294,5; `composeMs` 159.957,3; `readbackMs` 32.585,4; e `writerWaitMs` 73.835,0. `characterMs` e `mediaDecodeMs` são tarefas concorrentes. `surfaceRoundTripMs` acumulou 654.145,8 ms ao longo dos pedidos e também não é um estágio serial a somar aos anteriores.

Foram solicitados/renderizados 10.800 frames, todos únicos, com zero duplicados e zero fora de ordem. O arquivo verificado tem 180 s, 1920×1080, 60/1, 10.800 frames H.264; o áudio AAC estéreo 48 kHz também tem 180 s. O arquivo final tem 245.449.842 bytes. A leitura de frames e áudio pelo verificador confirmou duração e contagem; não houve análise perceptual de sincronismo labial.

Cache de camadas: 95.717 hits, 1.441 misses, 1.429 expulsões; pico 99.532.800 de 100.663.296 bytes admitidos. A RAM inclui a árvore de processos Electron e exclui o FFmpeg filho. Eventos de GC de Chromium e do Worker não são expostos por este harness.

## Cenários progressivos curtos

Os perfis abaixo foram executados em varreduras de 5 segundos para comparar custo crescente e validar fixtures/fluxos. Somente o perfil misto foi executado pela duração completa de 180 segundos. Portanto, não se deve interpretar esta tabela como soak de 180 s para cada contagem de personagens.

| Cenário | Personagens | Renderização | Throughput exportado | P95 de frame | Pico RAM Electron |
|---|---:|---:|---:|---:|---:|
| Básico | 1 | A/B Canvas: 13,39 s para 300 frames | 13,40 FPS | 34,26 ms (Canvas) | medido no A/B curto |
| Intermediário | 2 | 300 frames | 22,97 FPS | 35,13 ms | 805 MB |
| Pesado | 4 | 300 frames | 19,69 FPS | 47,18 ms | 853 MB |
| Extremo | 8 | 300 frames | 9,80 FPS | 136,23 ms (P99 158,89 ms) | 1.599 MB |
| Misto | 4 + vídeo/texto/áudio | 300 frames; H.264 e AAC | 15,28 FPS | 64,97 ms* | 1.171 MB |

Todos os perfis curtos concluíram seus 300 frames, sem perda/reordenação. O extremo foi limitado à varredura curta: já atingiu cerca de 1,60 GB de pico e menos de 10 FPS de throughput. Não foi feito soak de 180 s com oito personagens. O P95 do misto marcado com `*` é do primeiro smoke curto; a medição corrigida do soak longo está na seção anterior.

## Outros testes e benchmarks executados

| Comando | Resultado observado |
|---|---|
| `npm run typecheck -- --pretty false` | Passou na validação final. |
| `npm run build` | Passou; bundle ESM do Worker produzido (`videoCharacterFrameRender.worker`, aprox. 181 KiB). |
| `npm run audit:architecture` | Passou: 265 arquivos TS/TSX, zero erros de sintaxe/imports locais ausentes/violações de fronteira. |
| `npm run test:video:offscreen-worker` | 4/4 passaram: refs da fixture, perfis determinísticos, plano AAC misto e contratos A/B/fallback/gate. |
| `npm run test:video:next` | 158/158 passaram, incluindo renderer Canvas, caches, transições e regressões do Video Studio. |
| `npm run test:export:synthetic` | 108/108 passaram. |
| `npm run test:export:e2e-electron` | Passou: 60 frames H.264, 1920×1080/60, 1 s. Smoke de exportação sem cena Gacha animada. |
| `npm run test:export:electron-surface` | Passou: superfície 1920×1080 e buffer RGBA de 8.294.400 bytes. |
| `npm run test:export:preview-oracle` | Passou com o gate existente de preview/export Canvas. |
| `npm run bench:video:cache` | Passou: em 120 frames de benchmark de cache (sem rasterização Gacha), 21,42 FPS frio e 32,50 FPS quente; speedup quente 1,52×. |
| `npm run bench:video:workers` | Passou em perfil curto misto de 2 personagens/300 frames; serve como referência de worker/cache já existente, não é o A/B OffscreenCanvas. |
| `npm run bench:video:offscreen-ab` | Três pares medidos e gate rejeitado conforme resultados acima. |
| `npm run test:export:full-engine-soak:180` | Passou no perfil misto, com integridade e duração detalhadas acima. |

O script oferece `test:export:full-engine-soak:180:worker` para investigação, mas a execução de 180 segundos não foi repetida no Worker após o gate A/B reprovado. Também não foram executados os soaks de 90 ou 900 segundos nesta rodada; o primeiro foi substituído pelo soak animado de 180 s e o segundo não era necessário para validar a hipótese.

## Gargalos e conclusão

1. No perfil misto de 180 s, a exportação processou aproximadamente 0,245× tempo real. A obtenção/decodificação de mídia, composição e rasterização do personagem aparecem como custos mensuráveis; os tempos por tarefa se sobrepõem.
2. O Worker transfere mais de 146 MB por execução curta, cria custos de mensagens e bitmaps, não obteve hits no cache de camadas do renderer neste perfil e aumentou ligeiramente CPU/RAM. A separação de thread, isoladamente, não reduziu o trabalho de rasterização nem o tempo final.
3. Mesmo uma diferença de canal 1 reprova a política atual de preservar os pixels autorais; não foi usado limiar perceptual para mascarar a divergência.
4. Assim, o Worker continua disponível apenas como diagnóstico opt-in e fallback automático para Canvas. Não deve ser habilitado por padrão nem integrado à prévia até corrigir a divergência de pixels e demonstrar ganho repetível.
5. Próxima etapa recomendada: perfilar o Canvas por camada/pose e testar reutilização seletiva de partes comprovadamente invariantes, com oráculo RGBA do Canvas antes/depois. Medir custo de composição/readback e decodificação de mídia separadamente. Só experimentar dirty regions quando máscaras, antialiasing e ordem das camadas forem preservados pelo oráculo.

## Limitações ainda abertas

- Não foi testada reprodução manual do Video Studio com o Worker; o protótipo só atende exportação. Logo não há comprovação de melhora de responsividade da UI, seek para frente/trás, troca de blocos ou interação simultânea.
- Não foram executados 180 s para cada perfil nem soak extremo de oito personagens. O teste longo foi perfil misto com quatro.
- O A/B de Worker mediu 5 s/300 frames, não 180 s. A ausência de paridade visual e a regressão de tempo levaram a manter o Canvas no soak longo.
- A matriz completa de pixels para todas as combinações pedidas (poses inicial/intermediária/final, mudanças de proporção, várias escalas/resoluções, máscaras e todas as expressões) ainda precisa de fixtures-oráculo dedicadas. A fixture atual cobre camadas e animações representativas, mas não prova toda a biblioteca real do usuário.
- Cancelamento, seek e descarte têm cobertura automatizada dos contratos existentes; não foi feito ensaio manual longo de vazamento com várias exportações, trocas de cena e cancelamentos repetidos.
- CPU/RAM excluem FFmpeg filho. A contagem/pausas de GC cobre apenas o processo Electron principal, não os processos Chromium ou Worker.
- Vídeo e AAC tiveram duração e contagem verificadas; sincronismo audiovisual perceptual e lipsync não foram julgados por escuta/quadro a quadro.
- A causa exata da diferença RGBA do Worker ainda requer isolamento por estágio.
- Os recursos de teste foram criados em diretório temporário e removidos pelo harness; nenhum projeto salvo, asset ou biblioteca pessoal foi migrado ou sobrescrito.

## Arquivos da implementação experimental

- Worker e cliente: `src/renderer/src/features/videoStudio/videoCharacterFrameRender.worker.ts`, `src/renderer/src/features/videoStudio/videoCharacterFrameRenderWorkerClient.ts`.
- Fronteira Canvas: `src/renderer/src/characters/canvasSurface.ts` e alterações de compatibilidade em `characterRenderer.ts`, `characterImageMemos.ts`, `gachaStaticLayers.ts`, `videoGachaCanvasFrame.ts` e `eyeInteriorMask.ts`.
- Seleção opt-in, fallback e métricas: `VideoExportSurfacePage.tsx`, `videoCharacterFrameRenderer.ts`, `transitionRenderer.ts`, IPC e configurações de build.
- Fixture/harness: `scripts/video-studio/animated-gacha-character-fixture.cjs`, `gacha-video-stress-scenario.cjs`, `offscreen-character-worker-benchmark.cjs` e `full-engine-soak.cjs`.
- Testes: `tests/video-studio-offscreen-character-worker.test.cjs` e stubs/contratos existentes atualizados para aceitar `OffscreenCanvas`.

Relatórios JSON brutos e capturas de teste foram gravados no diretório temporário do sistema e não são dependências do aplicativo.

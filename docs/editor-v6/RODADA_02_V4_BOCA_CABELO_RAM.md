# Editor V6 · V4 — Rodada 02: boca isolada, FFmpeg e memória

**Data:** 2026-11-03
**Branch:** `Dev-V2`
**HEAD de partida:** `14272daf`
**Escopo:** correção do gate local de FFmpeg, boca isolada no MP4, instrumentação e exportações sintéticas. Sem migração de schema, escrita em projetos existentes ou alteração da animação de cabelo na prévia normal do Editor V6.

**Commits locais de implementação:** `51a88937` (boca isolada e contrato IPC/cache) e `fc794836` (toolchain FFmpeg, stress e perfil longo). Nenhum deles foi publicado.

## Resultado

A Rodada 02 concluiu a correção local da cadeia de teste MP4, implementou um caminho export-only que renderiza a peça da boca separada quando o catálogo permite, e mediu exportações sintéticas de 30 s, 2 min e 5 min por processo. Também executou uma exportação combinada de 5 minutos com fala e cabelo e coletou 184 amostras dos processos. A animação de cabelo continua opt-in e exclusiva do MP4; a prévia normal do Editor V6 não foi alterada.

O isolamento visual da boca e os MP4 sintéticos passaram. O teste de memória encontrou e corrigiu uma retenção do próprio validador: ele mantinha simultaneamente dezenas de quadros decodificados de 1080p. Depois de transmitir os lotes, a validação não mantém o conjunto de imagens inteiro na memória. Nas exportações observadas, os processos renderer/FFmpeg terminaram; o processo principal voltou perto da memória privada inicial após repouso. O processo GPU conservou parte do cache e **não** caiu ao nível inicial em 20 segundos.

## Causas verificadas e mudanças

### FFmpeg e validação MP4

- O pin anterior do pacote BtbN apontava para um release que não estava mais disponível. O manifesto agora fixa `autobuild-2026-10-31-12-59`, FFmpeg `n8.1.3-27-g8dca1586f4`, SHA-256 `d4c2a42673917b4a97104a3e9f082729a9730796b98664e37c0b7eba6c6c613d` e declara LGPL 3.0-or-later.
- O arquivo baixado foi comparado com o digest publicado e o instalador verificou executáveis, FFprobe, licença dentro do ZIP, configuração de build e encoders exigidos. O pacote inclui `aac` e `libopenh264`; os encoders de hardware aceitos permanecem opcionais.
- O workflow do GitHub Actions prepara as ferramentas numa pasta temporária do runner e informa o caminho ao teste. Isso não troca nem sobrescreve `resources/video-tools` instalado localmente.
- O instalador aceita destino e manifesto explícitos, preserva a instalação local quando há incompatibilidade e faz staging/verificações antes da publicação. Testes cobrem resolução do binário e ausência de fallback silencioso.
- Os MP4 locais foram gerados e lidos com FFmpeg/FFprobe reais. A execução hospedada do workflow continua pendente porque esta rodada não publicou alterações.

### Boca como camada independente no export

**Causa confirmada no caminho antigo:** `scaleMouthForExport` alterava a transformação da boca, mas o bake comparava imagens faciais completas e extraía um retângulo RGBA de `changedBounds`. Assim pele, cabelo e detalhes vizinhos podiam acompanhar a ampliação retangular.

Quando o renderizador canônico consegue identificar os componentes `mouth-open`/`mouth-closed`, o bake agora cria:

1. Um atlas transparente contendo somente a peça da boca nas escalas do ciclo.
2. Bases temporárias sem a boca antiga para `talk` e `talk-blink`, renderizadas pelo mesmo catálogo facial e com os outros detalhes preservados.
3. Transformações faciais localizadas, aplicadas pelo compositor de cena existente; a base sem boca remove os pixels anteriores em vez de sobrepor uma boca nova à antiga.

Os assets existem apenas no payload temporário do trabalho de exportação; projetos, personagem do Customizador e catálogo do Fabricador não são alterados. Projetos sem peça de boca isolável mantêm o caminho retangular compatível; a saída não é silenciosamente trocada por um atlas vazio.

Durante a revisão final, foi encontrado e corrigido um detalhe no contrato compartilhado: o schema validava as bases sem boca, mas removia `mouthIsolationMode` ao atravessar IPC ou cache. As imagens continuavam sendo usadas, porém o relatório classificava o método como legado. O campo agora sobrevive ao parse e o schema exige duas bases distintas para `isolated-piece`, ou patches de substituição completos para `legacy-patch`; há regressão para preservação e rejeição de payload incompleto.

Na fixture de alta resolução, o atlas isolado ocupa **15.252 px**, contra **1.253.120 px** do atlas equivalente de quadro completo (**98,78% menos pixels de atlas**). São três personagens sintéticos, 40 quadros, 720p e 1080p, Turbo, rotação/espelhamento, expressão atravessando a emenda Turbo e roupa/customização preservadas. A composição RGBA alterou **zero pixels fora da região da boca**. Após H.264, o erro médio de referência no corpo foi 1,6712 (720p) e 1,7176 (1080p); compressão não produz identidade pixel a pixel.

O atlas é compacto, mas a cena ainda compõe a imagem do personagem a partir da base sem boca e do patch. Não se afirma que o caminho inteiro deixou de gerar/compor imagens do corpo, nem que houve ganho mensurável de tempo de exportação por esta alteração.

### Memória e limites do que foi provado

- A correção anterior de assets temporários por quadro no worker e a liberação de superfícies/canvas já estavam no baseline desta rodada; foram preservadas e verificadas pela suíte. A Rodada 02 não reescreveu o pipeline de encode nem removeu backpressure.
- O stress validator guardava quadros RGB completos de muitas transições 1080p até terminar as comparações. Em uma exportação de 5 minutos havia 58 quadros únicos simultaneamente, cerca de **358 MB decimais** só em pixels RGB. Isso era retenção do teste, não do exportador. O validador agora decodifica lotes e guarda apenas pequenos recortes quando os dois quadros de uma comparação caem em lotes diferentes.
- A medição usa `app.getAppMetrics()` para processos Electron, `process.memoryUsage()` e `performance.memory` quando disponíveis, além de amostras de processos Windows para FFmpeg. Valores em KB da API Electron são convertidos uma vez para bytes. Memória privada/working set do processo GPU **não é VRAM**; o Electron não expõe a alocação física do driver.
- O teste também registra tempos de etapa, quadros e processos que ainda existem depois do trabalho. Renderer de exportação e FFmpeg foram encerrados; no cenário de 5 minutos o processo principal caiu de pico privado observado de aproximadamente 429 MiB para 81 MiB após 20 s. O processo GPU foi de pico privado 771 MiB para 626 MiB nesse repouso. Isso aponta cache/reserva do processo GPU, não demonstra leak nem prova liberação de VRAM.
- `runEditorV6Export` mantém escrita com backpressure. Na exportação segura de 5 minutos, os callbacks de escrita ao FFmpeg somaram 49,8 s nos 9.000 quadros (p95 por escrita: 6,7 ms); o p95 de captura foi 41,8 ms nas 236 capturas medidas. Remover backpressure aumentaria fila de quadros e risco de RAM; não foi feito.

### Perfil longo combinado de fala e cabelo

- A nova tarefa opcional `npm run test:editor-v6:combined-hair-mouth-memory` exportou 300 s, 9.000 quadros, 1280×720, um personagem, fala contínua, animação de cabelo, modo seguro/um worker e 30 lotes de boca de 300 quadros. Usa fixture sintética; a boca do perfil é deliberadamente legada, para exercitar as duas rotas sem depender de catálogo pessoal.
- O MP4 H.264 passou no FFprobe com 9.000 quadros, 30 fps e duração de 300 s. O cabelo foi detectado em três quadros separados (26.283, 27.295 e 27.093 pixels da paleta sintética). Foram registrados 9.000 samples de composição do cabelo, captura e escrita ao FFmpeg.
- O export levou **525,8 s** (8 min 46 s) sob o jogo ativo, carga concorrente não controlada. O maior custo medido ficou no round-trip/desenho no renderer: mediana dos p50 por lote 55,7 ms; pior p95 entre lotes 67,1 ms. Composição de cabelo somou 114,4 s (mediana dos p50 por lote 12,3 ms; pior p95 15,2 ms). Composição facial somou 247,9 ms nos 2.373 samples em que ocorreu. Escritas ao FFmpeg somaram 7,2 s (mediana dos p50 por lote 0,7 ms; pior p95 1,0 ms). Isso aponta o caminho de desenho/captura do renderer como foco para eventual perfil adicional; não é comparação antes/depois nem prova de ganho introduzido nesta rodada.
- O sampler Windows fez **184 amostras**, sem erro, em intervalos de 3 s e até 20 s após a exportação. Pico de memória privada: Main 229,2 MiB; renderer de export 49,4 MiB; FFmpeg 48,3 MiB; processo GPU 441,3 MiB. Após repouso de 20 s, Main ficou em 131,0 MiB privados; renderer e FFmpeg já não existiam; GPU ficou em 120,4 MiB privados. O valor inicial do GPU já era 441,3 MiB, portanto não cresceu no cenário; memória privada do processo GPU **não é VRAM**.
- O RSS do Main, medido pelo relatório da exportação, foi de 145,2 MiB no início e 296,0 MiB no pico. O heap JS do Main ficou em 8,1 MiB no primeiro sample e 7,7 MiB depois do repouso. Não houve tendência de crescimento contínuo do Main neste perfil; isso não cobre cancelamento com cabelo/fala nem os cenários com 4/8 personagens.

## Testes MP4 e pixels

| Verificação | Resultado local |
| --- | --- |
| FFmpeg/FFprobe LGPL | Release pinado verificado por SHA, licença, build config e encoders. |
| `npm run test:editor-v6:face-export-silent` | Aprovado; MP4 real 720p/1080p, boca isolada, 40 quadros, 3 personagens, zero diferença RGBA fora da boca, emenda Turbo, rotação/flip e corpo/roupa personalizados. |
| `npm run test:editor-v6:hair-motion-export` | Aprovado; MP4 real, 7 amostras de transição, movimento de cabelo, quatro fundos, transparência e safe 720p/Turbo 1080p. |
| `npm run test:editor-v6:export-overlay` | Aprovado; MP4 real de 60 quadros e 3 vídeos sobrepostos, incluindo quadros 29/30 da emenda Turbo. |
| `npm run test:editor-v6:export` | Aprovado; MP4s reais para Turbo, áudio na emenda, cancelamento preservando destino, FullHD e stress do loop de boca de 301 quadros. |
| `npm run test:editor-v6:combined-hair-mouth-memory` | Aprovado; MP4 real de 5 min / 9.000 quadros em 720p com fala+cabelo, FFprobe e 184 amostras por processo, incluindo 20 s de repouso. |
| `npm run test:editor-v6` | Aprovado após a regressão IPC/cache: 41 arquivos, 231 testes aprovados, 1 ignorado; stress-profile: 16 testes aprovados. |
| `npm run typecheck` | Aprovado. |
| `npm run audit:architecture` | Aprovado: 665 TS/TSX, sem violações ou imports faltando. |
| `git diff --check` | Aprovado; apenas avisos normais de normalização LF/CRLF do Git. |

Os scripts MP4 executaram builds Electron/Vite; o build geral `npm run build` também foi executado separadamente nesta rodada.

## Exportações sintéticas de memória e desempenho

As medições abaixo ocorreram em Windows x64, Electron 45.1.0, Node 24.18.0, 12 CPUs lógicas, com o jogo aberto conforme informado pelo usuário. Carga do jogo não foi controlada; resultados servem para comparar o comportamento observado, não para prometer desempenho numa máquina limpa. Todas as cenas foram geradas para testes e nenhum `app-data` pessoal foi usado.

| Perfil | Execuções | Resultado observado |
| --- | --- | --- |
| 30 s · 1 personagem · 720p · seguro/Turbo | 3 por modo, MP4 real | Medianas: seguro 4,409 s, Turbo 3,529 s (20,0% menor nesta amostra); RSS pico mediano 279,1/290,2 MiB. |
| 30 s · 8 personagens · 1080p · seguro/Turbo | 3 por modo, 116 transições verificadas por execução | Medianas: seguro 15,547 s, Turbo 13,813 s (11,2% menor); RSS pico mediano 491,4/486,0 MiB. |
| 120 s · 4 personagens · 720p · Turbo | 1 execução, 3.600 quadros, 44 transições | 13,478 s; RSS pico do Main no relatório 314,7 MiB. |
| 300 s · 8 personagens · 1080p · seguro | 1 execução, 9.000 quadros, 116 transições | 78.374 ms; renderização 65.445 ms. 51 amostras de memória incluindo 20 s de repouso. |

O A/B compara os modos de worker já existentes, sem mudar encoder ou parâmetros de qualidade. Sob o jogo, o Turbo foi mais rápido nestas amostras, com mais RSS no perfil leve e valores próximos no perfil denso. Não é ganho introduzido nesta rodada. O perfil de 5 min mostrou que exportações longas completam com contagem/transições válidas e que os processos transitórios encerram; não prova todas as combinações de fala/cabelo.

O perfil de 5 min registrou Node RSS amostrado de aproximadamente 167 MiB no começo, 291 MiB no pico e 135 MiB no último ponto; heap usado permaneceu perto de 16–18 MiB. O FFmpeg atingiu aproximadamente 170 MiB de memória privada, o renderer 91 MiB e o GPU 771 MiB. Os processos renderer/FFmpeg não estavam vivos na checagem posterior. O GPU ainda estava perto de 626 MiB privados após 20 s.

## Limitações e pendências reais

1. O teste facial é sintético; falta o aceite visual do usuário com um personagem real e detalhes do seu catálogo. O teste prova a composição para rigs que expõem a peça de boca, não a compatibilidade artística de cada rig.
2. A combinação longa fala+cabelo passou em fixture de um personagem/720p/modo seguro. A matriz completa não foi executada: falta cruzar cabelo/fala com 4 e 8 personagens, 1080p, Turbo/seguro e 1/2 workers. Fala e cabelo usam fixtures sintéticas; falta aceite artístico com personagem real.
3. O caminho legado sem boca isolável continua usando patch facial retangular; não foi removido para não quebrar projetos antigos.
4. Não houve uma execução hospedada do workflow GitHub; publicar está fora da autorização desta rodada.
5. Não foi demonstrado ganho de velocidade causal da boca isolada. No perfil combinado o processo GPU diminuiu após o trabalho, mas o valor privado não corresponde a VRAM. Turbo manteve backpressure e qualidade existente.

## Pesquisa técnica consultada

- Electron: [`app.getAppMetrics`](https://www.electronjs.org/docs/latest/api/app#appgetappmetrics), [estrutura `ProcessMetric`](https://www.electronjs.org/docs/latest/api/structures/process-metric), [estrutura `MemoryInfo`](https://www.electronjs.org/docs/latest/api/structures/memory-info), [offscreen rendering](https://www.electronjs.org/docs/latest/tutorial/offscreen-rendering) e [performance](https://www.electronjs.org/docs/latest/tutorial/performance). Os limites de memória e de regiões sujas orientaram como medir processos e validar captures.
- MDN: [Canvas compositing](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/globalCompositeOperation), [OffscreenCanvas](https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas) e [uso/ciclo de vida de WebCodecs](https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API/Using_the_WebCodecs_API). Não se substituiu o transporte porque isso exigiria novo ciclo de vida e equivalência RGBA/alpha sem ganho medido.
- FFmpeg: [documentação geral](https://www.ffmpeg.org/general.html), [licença](https://www.ffmpeg.org/legal.html), [opções](https://www.ffmpeg.org/ffmpeg-all.html) e release pinado do [BtbN FFmpeg Builds](https://github.com/BtbN/FFmpeg-Builds).

## Arquivos de evidência

Relatórios sintéticos e MP4s permanecem localmente sob `out/editor-v6-memory-profile`, `out/editor-v6-face-export-check`, `out/editor-v6-hair-motion-check`, `out/editor-v6-overlay-parity` e `out/editor-v6-export-check`. O perfil conjunto está em `out/editor-v6-hair-motion-check/artifacts/hair-mouth-5min-memory-profile.json`, com o vídeo e o report do export ao lado. São ignorados pelo Git e não contêm projetos pessoais.

Ver também [Rodada 01](RODADA_01_V4_BOCA_CABELO_MEMORIA.md), [Roadmap V4](ROADMAP_V4_EXCELENCIA.md), [animações](ANIMACOES.md) e [exportação](EXPORTACAO.md).

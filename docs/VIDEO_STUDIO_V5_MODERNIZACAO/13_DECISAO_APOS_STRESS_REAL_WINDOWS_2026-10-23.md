# Video Studio G-V5 — decisão de arquitetura após stress REAL no Windows
**Data:** 23/10/2026  
**Estado:** decisão proposta para execução, **não implementação concluída**  
**Alvo:** somente Windows  
**Base auditada:** `feature/model-source-editor`, `992b000b551005e7de81a93b5457bfd3444fc9e0`  
**Fonte primária:** [RELATORIO.md](../../video-studio-diagnostico-interrompido/RELATORIO.md). [Pacote de evidências ZIP](../../video-studio-diagnostico-interrompido.zip) (~6,25 MB); **a análise automatizada não conseguiu descompactá-lo via conector do GitHub**. Métricas abaixo são do relatório e do código/CI examinados, não uma auditoria independente do conteúdo de cada CSV, PNG e JSON compactados.

> **Nova decisão:** o bloqueador imediato é a arquitetura do **preview de transições Gacha**, e não há evidência de falha do FFmpeg de exportação. **Suspender novos grandes pré-renders, benchmarks de 3 minutos em dobro e expansões de cache no caminho legado** até corrigir o scheduler. Propor renderer Gacha por GPU em prova de conceito Windows; manter React/Electron como UI, FFmpeg como codificador até demonstração contrária e estudar MLT/GES/Skia como candidatos independentes.

## 1. Evidência do teste local real

| Item | Resultado | Confiança |
|---|---|---|
| Máquina | Windows, ~15,4 GiB RAM reportados; Node 24.18, Electron 44.7.1; FFmpeg 8.1.2 | Relatório de coleta |
| Personagens/projeto | 4 fichas salvas; `StudioDocument v1`, 180 s / 60 fps / 10.800 frames, 213 character keys, 48 clipes de fala/pensamento, 2 vídeos sintéticos, 4 gaps | Round-trip local relatado; **reabertura após encerrar não comprovada** |
| Preview frio | 802,473 s (13 min 22,5 s), 10.800 quadros de **posição da timeline** observados; 0 erros no ciclo final | Relatório de playback |
| Preparação | 618,005 s em 52 períodos, média ~11,9 s, pior 28,728 s; ~77% do tempo | Gargalo dominante medido |
| requestAnimationFrame | intervalo p50 13,4 ms; p95 79,9 ms; média ~49 callbacks/s | **Não equivale** a FPS de vídeo renderizado |
| Memória agregada Electron | pico working set 2.552,1 MiB; pico Private Bytes 3.029,0 MiB | CSV agregado no relatório; WS inclui páginas compartilhadas |
| Execuções iniciais | Erro de vídeo por `AbortError` em troca de origem original para proxy; correção subsequente passou em testes e no ciclo frio | Reproduzido e corrigido |
| Ciclo quente | Interrompido pelo runner em 8.101 frames; UI continuou depois, sem registro final | **Inconclusivo** |
| Export MP4 | **Não executado** | Sem métrica ou prova de paridade |
| GPU/VRAM/GC/paginação | **Não medidos** | Não alegar OOM, leak nem causa de pressão gráfica |

**Atenção:** a execução de 13 minutos foi do **preview**, não de exportação. Os 10.800 frames indicam avanço de playhead observado pelo harness, **não um MP4 de 10.800 quadros**. A qualidade visual de todos os frames não foi verificada. O ZIP não foi descompactado pelo conector; evidências visuais descritas no relatório não foram auditadas pixel a pixel aqui.

## 2. Causa provável validada na implementação

- `src/renderer/src/features/videoStudio/useCharacterTransitions.ts` cria `TransitionSession` com uma **fila Promise serial**. Para a próxima fronteira, `prepareAhead` aguarda todas as amostras de `transitionSampleFrames`. Cada janela tem até 14 quadros intermediários (transição nominal de 15 frames).
- `TransitionRenderer.render` recompõe e retorna `imageDataUrl`, que o hook carrega em `Image` e decodifica, antes de disponibilizar ao preview.
- `VideoStudioEditor.tsx` chama `await characterAnimation.preparePlayback` **antes de iniciar Play** e volta a interromper se `characterAnimation.missing` indicar amostra ausente. A latência torna-se parte da experiência, mesmo com timeline correta.
- `dispose()` interrompe aceitação/publicação, **mas não envia AbortSignal real ao trabalho pesado em progresso**. Pausar/cancelar pode não evitar espera/custo residual.
- O novo `renderToCanvas` de três grupos implementado nos cortes anteriores alimenta `VideoExportSurfacePage`; **o hook da prévia ainda chama o caminho PNG**. Assim, a maior parte das otimizações novas **não foi exercitada no gargalo principal do teste**.

**Diagnóstico de confiança alta:** política de preparação serial antecipada é inadequada para preview. **Ainda não quantificado separadamente:** custo por montagem de pose, transformação facial, PNG encode/decode, IPC de catálogo, memória de textura e GPU. **Não atribuir a demora ao FFmpeg.**

## 3. Falha adicional encontrada na CI do commit auditado

- [Run de qualidade 40033661419](https://github.com/nestarasup-sys/Native-gacha/actions/runs/40033661419) falhou em `tests/architecture-audit.test.cjs`.
- `electron/main.ts` tem **2.511 linhas** contra limite estático de **2.500**, devido às alterações do novo fluxo de teste/diagnóstico. Testes de domínio passaram antes disso.
- [Core Windows 40033661442](https://github.com/nestarasup-sys/Native-gacha/actions/runs/40033661442) passou em typecheck, build e testes específicos. **Isso não torna o PR totalmente verde.**
- **Correção antes do próximo marco:** extrair novos handlers/diagnósticos para módulo próprio; **não aumentar o orçamento de linhas artificialmente**.

## 4. Tecnologias — decisão fundamentada, sem Big Bang

| Componente | Escolha proposta | Razão | Não resolve sozinho |
|---|---|---|---|
| Editor/persistência | Manter Electron + React como shell; migrar comandos para `EditorCore`/SceneIR imutável | Evita perder dados e permite aposentar o monólito | Renderização e sincronização |
| Preview de Gacha | **Prova de conceito PixiJS v8/WebGL2**, com Canvas fallback | Texturas persistentes, composição GPU, camadas e máscaras; integração inicial viável no renderer Electron | Scheduler, decodificação e correção PT |
| Avaliação de timeline | **`SceneEvaluator` puro, determinístico, por quadro** | Seek absoluto; não criar 14 PNGs antecipados por bloco | Custos de textura/mídia |
| Scheduler | Worker/processo de render supervisionado; prioridades e cancelamento real | Só quadro solicitado + janela curta; fila limitada e preempção | Driver/GPU e alocação externa |
| Mídia/audio NLE | **MLT como spike separado**, comparado a FFmpeg já disponível; **GES** alternativa | MLT/GES dão timeline multifaixa, codecs, mixagem e tracks | Renderizador Gacha e pré-render de face |
| Skia nativo | **Plano B** se Pixi/WebGL2 falhar na fidelidade/perf Windows | Canvas/efeitos 2D de alta qualidade e possibilidade de backend gráfico nativo | Packaging, IPC e media NLE |
| Export | Preservar FFmpeg/FFprobe inicialmente; integrar frames/PTS determinísticos, audio clock e encoder em worker separado | Evita reimplementar codecs e mantém compatibilidade | Preview interativo |

**Não instalar Pixi, MLT, GES e Skia de uma vez.** Fazer duas provas independentes: **render Gacha GPU** e **pipeline multimídia**. Escolher com custo Windows de integração, licenças de distribuição, memória, paridade, captura de perfis e tempo real medido. Atenção: Skia é renderer 2D, **não** editor multifaixa; MLT/GES são frameworks de mídia, **não** motores faciais Gacha. FFmpeg é codec/processamento, não scheduler de interação.

Referências oficiais: [PixiJS WebGL/experimental WebGPU](https://pixijs.com/guides/components/renderers/); [MLT](https://mltframework.org/); [GES](https://gstreamer.freedesktop.org/documentation/gst-editing-services/); [Skia](https://skia.org/docs/); [FFmpeg](https://www.ffmpeg.org/ffmpeg.html).

## 5. Plano de execução com gates e critério de parada

### G0 — preservar e instrumentar (antes de qualquer stress longo)
- Congelar amostras/projeto e branch sob revisão; conferir integridade e backup de `StudioDocument v1`, fichas, CAS e referências. Não sobrescrever `app-data` reais.
- Extrair IPC recém-adicionado de `electron/main.ts`; fechar o gate de arquitetura do PR.
- Instrumentar por etapa: `prepareArtworkMs`, `faceDrawMs`, `encodePngMs`, `decodePngMs`, fila/espera, hits LRU/eviction, p95 de quadro, FPS efetivo do canvas, CPU/paging/GC, working set/private bytes por PID, VRAM Windows.
- Rodar **5 s, 15 s e 30 s** antes dos 180 s. Watchdog: sem avanço por 30 s → capturar diagnóstico e cancelar sem perda; timeout por etapa configurável. Nunca iniciar 2 ciclos de 3 minutos automaticamente.
- **Gate:** dados observáveis e cancelamento funcionais; testes Windows/arquitetura verdes.

### G1 — eliminar o pré-render serial do preview (maior ROI)
- Substituir `useCharacterTransitions` e `preparePlayback` bloqueantes por API `requestFrame(frame, quality, signal)` orientada à posição absoluta e `FramePlan` da SceneIR.
- Apenas **quadro corrente e janela curta adiante**, com prioridades `visible-now > seek > nearby-prefetch`; invalidar geração ao seek, cancelamento real para operações cooperativas; fila max N e budget de jobs/bytes.
- Transições faciais não devem gerar 14 imagens de forma obrigatória antes de Play. Recursos base (pose/roupa/cabelo) reutilizados, alterações de face avaliadas em tempo de quadro; caching por rig/face id, não por PNG de todo frame.
- Se GPU não entregar no prazo, **reduzir resolução do preview/proxy ou atualizar visuais em cadência adaptativa**, preservando avanço e fidelidade temporal; congelar o playhead por dezenas de segundos é falha.
- **Gate:** com quatro personagens, Play responsivo e seek repetível; sem períodos de preparação de 10–30 s. Medir startup, não prometer tempo exato sem hardware alvo.

### G2 — renderer Gacha GPU com semântica real (Windows)
- Provar **um personagem real** em Pixi/WebGL2 com corpo, roupa, cabelo, olhos, boca, blink, PT esquerda/direita e máscaras; comparar capturas de referência nas mesmas resoluções. Depois dois e quatro personagens.
- Cena GPU com texturas estáveis, apenas propriedades/partes alteradas por dirty flags; evitar a cada quadro `dataURL`, `new Image`, `getImageData` full-frame e CPU→GPU uploads repetidos. Fallback Canvas e chave de feature flag; não mudar projetos nem UI global.
- Testar GPU default + software fallback, device loss e VRAM. Se WebGL2 não cumprir equivalência, fazer spike Skia nativo separado.
- **Gate:** fidelidade aprovada para normal/PT, máscaras, roupas, flip e pose; preview de 4 atores mantém ao menos 30 fps efetivos como **meta de produto** (60 preferível) em cenários reais e sem longas paradas; memória estabiliza entre ciclos.

### G3 — áudio, vídeos, PTS e decisão MLT/GES
- Comparar pipeline FFmpeg + decoders atuais versus MLT **apenas com fixtures reais de 24/30 fps, áudio e seeks reversos**. Medir integração de frames externos do Gacha, cópias CPU/GPU, mixagem, sincronismo e empaquetamento Windows offline.
- Escolher **um backend principal**. MLT favorecido como candidato NLE por multifaixa, mas manter FFmpeg se o custo de ponte/depêndencias superar a melhora. GES fica como alternativa, não segundo runtime obrigatório.
- Relógio de áudio autoritativo no preview e PTS racional para export; separação `MediaService`/`Compositor`/`ExportService`; limite de decoders e recursos por PID.
- **Gate:** dois vídeos simultâneos + áudio sem AbortError falso, seek regressivo limpo e tolerância AV medida.

### G4 — supervisor e budgets reais
- Orçamento **cross-process** para RAM/VRAM, além do ledger de JS: caches, frames em voo, buffers IPC, decoder, GPU, ffmpeg, PNG, texturas e staging. Backpressure na entrada, release obrigatório, resposta a renderer crash, cancellation e recovery.
- Garantir que o shutdown/cancel não deixe fila de raster avançando. Workers reiniciáveis e logs diagnósticos sem caminhos ou dados privados.
- **Gate:** repeated seeks/play/stop/export sem crescimento indefinido, sem mídia/projeto perdido; capturas Windows de commit/private bytes + VRAM em cenários densos.

### G5 — prova de export e aceitação por etapas
- Exportar inicialmente **5 s → 15 s → 30 s** de conteúdo **animado diferente em cada quadro**. Só então liberar **180 s / 10.800 frames** com watchdog, progresso e cancelamento.
- Gerar MP4 via pipeline escolhido; verificar FFprobe, FPS, quadro inicial/final, contagem real de frames, duração, áudio, PTS e snapshots preview/export.
- Fazer comparação cold vs warm sem usar cache inválido; benchmark com animações normal/PT, 4 personagens, 213 keys, 48 falas, 2 vídeos. Não confundir simulação SceneIR com raster 10.800 frames.
- **Gate:** export completo correto, integridade e recovery; só depois aumentar para 12/24/48 atores e 15+ minutos. 180 s passam a ser cenário de aceitação, **não smoke inicial**.

## 6. Contratos e metas de referência (não resultados atingidos)

- **Fidelidade:** mesmos estados e geometrias do projeto v1; PT com pupilas independentes, roupas, máscaras, textos e flip. Diferenças de pixel exigem inspeção, não tolerância arbitrária para esconder regressão.
- **UI/responsividade:** medir p50/p95/p99 de primeira imagem, seek e tempo para iniciar Play. Meta preliminar: Play em poucos segundos, sem bloqueios longos; ideal preview ≥30 fps com quatro atores em hardware Windows de ~16 GiB (60 fps é alvo evolutivo).
- **RAM:** não afirmar teto de processo a partir de ledger de JS. Observar plateau de Private Bytes após cold/warm, quedas após fechar e criação/descarte de mídia; investigar subidas persistentes. Primeiro perfil local mediu **pico de 3,03 GiB agregados**.
- **Export:** 1080p60, 10.800 frames reais em MP4 para os 3 minutos; áudio e PTS verificados; progresso útil e abort cooperativo.
- **Segurança de dados:** migrações aditivas, fixtures isoladas, transações, rollback; não alterar `main`, não mesclar PR #5, não remover assets.
- **Stop loss:** nenhum novo teste de 90 minutos sem gates curtos, logs em arquivo e timeout de falta de progresso.

## 7. Ações imediatas (ordem não negociável)

1. Fechar a violação da CI em `electron/main.ts`, mantendo o orçamento arquitetural.
2. Medir custo de preparação por função e corrigir cancelamento de `TransitionSession`.
3. Retirar espera de amostras futuras de `preparePlayback` e impedir `missing` de gerar pausa longa; adicionar feature flag/rollback.
4. Protótipo PixiJS/WebGL2 para rig e faces normais/PT, com capturas reais Windows.
5. Benchmark comparativo 5/15/30 s e **depois** 180 s; iniciar spike MLT de mídia somente após evidência de problema ou ganho na integração AV.

**Recomendação final:** manter UI Electron/React e persistência v1, **substituir o centro de execução do preview**, usar `SceneEvaluator` compartilhado, escolher um renderizador GPU para Gacha por medição e manter FFmpeg até haver razão comprovada para MLT/GES. A arquitetura atual **não é suficiente como motor de preview pesado**, mas uma troca indiscriminada de biblioteca não resolve a fila serial, falta de cancelamento e a discrepância entre preview e export.

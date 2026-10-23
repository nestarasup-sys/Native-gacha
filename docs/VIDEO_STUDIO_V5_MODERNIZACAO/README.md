# Video Studio V5 — Reconstrução integral da arquitetura

**Decisão ativa (23/10/2026):** reconstruir **integralmente a arquitetura interna do Video Studio**. Não basta “otimizar o editor antigo”. A nova fundação deve conter editor/domínio, timeline, SceneEvaluator, renderizador Gacha, MediaService/AV clock, scheduler, orçamento de memória, supervisão de processos, preview, export e persistência, com **substituição progressiva e aposentadoria da orquestração experimental**.

**Ler primeiro:** [12 — Plano diretor da reconstrução integral e pesquisa das seis prioridades](./12_REAVALIACAO_RECONSTRUCAO_MLT_SKIA_2026-10-23.md). O nome do arquivo `12` é histórico e foi mantido para preservar links; **não significa que MLT/Skia foram escolhidos**.

## Política de reconstrução

- **Arquitetura nova é obrigatória; tecnologias específicas não.** Electron + React continuam a direção de UI. FFmpeg/libav, MLT, GES, Canvas, PixiJS, Skia, Blend2D e C++ entram **somente** após comparação de paridade/Windows/custo/licenças.
- **Código antigo = oráculo, algoritmo ou adaptador temporário, nunca arquitetura final.** Reaproveitar `StudioDocument v1`, SceneIR, semântica normal/PT, pose, fala, blink, infraestrutura de export/FFmpeg e testes quando eles satisfizerem contratos e budgets novos. Não reescrever tudo cegamente; também não deixar o `VideoStudioEditor.tsx` como centro permanente.
- **Nenhuma perda de dados:** preservar personagens, roupas, poses, expressões, PNGs, textos, áudios, vídeos, bibliotecas e projetos v1. Migrações somente aditivas, testadas com cópias e com rollback. Fabricador, Customizador, Studio Principal, Roteiros e Base de Vídeos fora de escopo.
- **Robustez e testes obrigatórios:** RAM/VRAM/processos/decoders medidas; filas e memória orçadas; recovery de falha da engine; preview/export coerentes; 12/24/48 atores e até 4 vídeos sob stress, 15–30 min de **animação variável**, AV/PTS e Windows offline. O teste histórico de 15 min com frame estático após 301 **não valida essa carga**.
- **Nenhuma promessa de “10×” sem benchmark.** A meta é capacidade/confiabilidade, fidelidade e fluidez mensuradas em hardware real, com degradação de preview quando necessário.
- **Branch autorizada:** exclusivamente `nestarasup-sys/Native-gacha` → `feature/model-source-editor`. `main` e `refactor/shared-character-core` **não** podem ser alteradas, mescladas ou receber release sem autorização explícita. PR #5 permanece rascunho até aprovação.
- **Estado:** pesquisa e especificação. O novo motor **não foi implementado** por esta revisão de documentação.

## Ordem de leitura

1. **[12 — Reconstrução integral, contratos, roadmap N0–N10, gates e seis investigações](./12_REAVALIACAO_RECONSTRUCAO_MLT_SKIA_2026-10-23.md)** — fonte atual da decisão arquitetural.
2. [00_PLANO_DIRETOR.md](./00_PLANO_DIRETOR.md) — visão histórica de produto.
3. [11_PESQUISA_OPEN_SOURCE_E_FECHAMENTO_EXPORTADOR.md](./11_PESQUISA_OPEN_SOURCE_E_FECHAMENTO_EXPORTADOR.md) — pesquisa anterior de engines e fechamento do exportador.
4. [02_ARQUITETURA_CANONICA.md](./02_ARQUITETURA_CANONICA.md) — SceneIR, frame/render/audio e contratos já estudados.
5. [04_LAB_E_GATES.md](./04_LAB_E_GATES.md) — laboratório histórico e cenários anteriores.
6. [05_DECISOES_ADR.md](./05_DECISOES_ADR.md) — ADRs anteriores, sujeitos à nova meta.
7. [06_BACKLOG_DE_EXECUCAO.md](./06_BACKLOG_DE_EXECUCAO.md) — tarefas anteriores, não equivalentes ao roadmap N0–N10.
8. [03_MIGRACAO_E_DADOS.md](./03_MIGRACAO_E_DADOS.md) — integridade, asset refs e CAS.
9. [07_MODOS_DE_EXPORTACAO.md](./07_MODOS_DE_EXPORTACAO.md) — variantes `animated` / `static-characters`.
10. [08_ARQUITETURA_EXTENSIVEL_E_RECONSTRUCAO.md](./08_ARQUITETURA_EXTENSIVEL_E_RECONSTRUCAO.md) — abstrações propostas historicamente.
11. [10_RELEASE_CHECKLIST.md](./10_RELEASE_CHECKLIST.md) — critérios de release a complementar com os gates da reconstrução.
12. [01_ESTUDO_DE_MOTORES.md](./01_ESTUDO_DE_MOTORES.md) — motores avaliados anteriormente.
13. [09_MISSAO_CODEX_AUTONOMA.md](./09_MISSAO_CODEX_AUTONOMA.md) — briefing histórico de execução, não autorização de mudança de branch.

**Precedência em conflitos:** integridade de dados e semântica real > gates/decisões do documento 12 > texto histórico. Qualquer instrução de docs antigos para escrita em `G-V5/master-desenvolvimento` deve ser tratada como **obsoleta**.

## Execução iniciada — primeira fatia N2 (ainda não concluído)

O módulo `src/shared/videoStudioNext/editorCore.ts` inicia a nova fronteira de comandos da timeline, sem dependências de React: **resize de bloco, settings/lock de tracks, transições, duração e viewport**. O editor real já encaminha esses comandos para o novo núcleo, preservando o formato v1 e o compartilhamento das referências de mídia. Histórico, salvar e muitas outras ações seguem temporariamente no adaptador legado; **N2 não está pronto**.

`src/shared/videoStudioNext/resourceBudget.ts` inicia um **ledger local por bytes e leases** com testes de admissão/liberação. **Não foi conectado ainda a caches, decoders, superfícies, GPU ou subprocessos**, portanto **não impõe um limite global à RAM/VRAM nem resolve OOM nesta etapa**. Essa integração é trabalho dos marcos N1/N4/N6.

Novos testes: `npm run test:video:next`, também incluídos em `npm test`. O corte depende de validação CI/Windows; não há promessa de ganho de FPS/memória.

### Segundo corte — consultas de fala e memória de layers (Windows)

- `src/shared/videoStudioNext/speechIndex.ts` compila um índice de intervalos de balões por revisão da timeline, consultado durante Play/seek em vez de percorrer todos os balões a cada frame. A UI usa o índice e a precedência histórica de fala/pensamento foi mantida. **É uma melhoria algorítmica pontual; ganhos de FPS ainda precisam de benchmark.**
- `VideoCanvasLayerCache` agora aceita `VideoStudioResourceBudget` para reservar bytes estimados de RGBA efetivamente colocados em cache. Expulsar/limpar um layer devolve a reserva. A export surface instancia o budget e o compartilha com esse cache de layers, incluindo a proteção contra renders assíncronos terminando após `clear()`. Se não houver orçamento para cache, o frame ainda é desenhado sem ser retido.
- **Limite honesto:** este budget regula **somente os layers cacheados desta surface**; não mede/limita HTMLVideoElement, ImageBitmap, PNGs, GPU, ffmpeg, memórias transitórias ou a árvore Electron. A integração global continua **pendente**.
- Testes novos: fala indexada (comparada com a varredura antiga por muitos frames), LRU/leases sob pressão, descarte assíncrono e retry após erro. `npm run test:video:next` roda os quatro arquivos de testes, **em CI focada no Windows**. Os workflows históricos de outras áreas não foram removidos.

### Terceiro corte — vídeos importados com frames protegidos e orçamento compartilhado (Windows)

- `VideoExportMediaFramePool` passa a entregar **frames emprestados por composição** via `acquireFramesForScene()` com `release()` obrigatório. Um `ImageBitmap` em uso não pode ser fechado por expulsão LRU quando outra mídia é decodificada. Frames extras que ultrapassam o limite do **cache** ficam **transitórios**, reservados no ledger e fechados após a composição.
- A `VideoExportSurfacePage` agora faz `Promise.allSettled` entre Gacha e mídia, liberando frames em `finally` mesmo com falha no desenho, render ou readback. Uma surface não aceita dois empréstimos ativos simultâneos, evitando o mesmo decoder servir seeks concorrentes.
- **Um budget de 160 MiB por surface** é compartilhado entre cache de camadas (máximo 96 MiB) e ImageBitmaps de mídia (máximo 96 MiB retidos em LRU, mais transitórios *dentro do mesmo budget*). Sob pressão o cache de camadas derivadas pode ser limpo para dar lugar a frames originais. Em falta de memória para frames simultâneos, a exportação falha **explicitamente**, sem retornar bitmap já fechado nem publicar resultado parcial.
- Novos testes cobrem **três vídeos simultâneos, expulsão segura, orçamento compartilhado, memória insuficiente, descarte durante decode, PTS e seek reverso**. Executados pela CI **Windows** com `npm run test:video:next`.
- **Nota histórica — superada no sétimo corte:** esta versão reservava o tamanho do `ImageBitmap` apenas *após* decodificar. Isso foi corrigido para admissão antecipada usando `videoWidth/videoHeight` antes de `seek()` e `createImageBitmap()`. Ainda não limita buffers internos do Chromium/decoder, RAM/VRAM, preview, múltiplas surfaces ou FFmpeg.

### Quarto corte — decodificadores de vídeo ociosos limitados (Windows)

`VideoExportMediaFramePool` agora mantém **no máximo oito elementos de vídeo ociosos por surface** após cada composição. Um algoritmo LRU descarrega a fonte e seus recursos quando outra mídia assume a posição. Os arquivos originais permanecem inalterados. **Mídias simultaneamente necessárias numa composição ficam protegidas** e podem exceder esse limite temporariamente; o cache volta à capacidade configurada depois de liberar o frame, sem cortar um vídeo da cena.

Testes Windows cobrem 12 mídias sequenciais, reapertura de fonte expulsa e cinco vídeos simultâneos com limite ocioso menor. O teto é de **quantidade de decoders retidos**, não de bytes dos buffers internos nem teto RAM/VRAM; medir isso em Windows real segue necessário.

### Quinto corte — cinco prioridades iniciadas na nova fundação (Windows)

| Prioridade | Entrega de código nesta fatia | Limitação / próximo gate |
| --- | --- | --- |
| **1. Diagnóstico Windows** | IPC on-demand `getVideoStudioMemoryReport()` com memória por PID Electron e processo GPU, acompanhado de `scripts/video-studio/windows-memory-probe.ps1` para árvore de processos (incluindo FFmpeg quando descendente). | **Sem medições reais feitas nesta sessão**; GPU VRAM dedicada, ETW/WPA e causa do OOM ainda não diagnosticados. |
| **2. Orçamento compartilhado** | O `VideoStudioResourceBudget` da export surface passou a contabilizar estimativas de retenção **Canvas, ImageBitmap de vídeo e cache derivado de PNG/receitas Gacha**. Falta de orçamento desabilita retenção de arte, sem perder frame. | Não controla a RAM total, assets transitórios, decoded GPU, processos FFmpeg nem outros processos Electron. |
| **3. Núcleo/histórico** | `videoStudioNext/commandHistory.ts` assume a implementação genérica de checkpoints e undo/redo, agora usada pela UI através de importação do novo núcleo. Comportamento de `StudioDocument v1` preservado e comparado com história antiga nos testes. | Estado editorial, persistência e maioria dos comandos ainda no monólito; não representa N2 concluído. |
| **4. Renderização Gacha** | `videoStudioNext/boundedMemo.ts` faz deduplicação de receitas assíncronas e LRU por bytes de **resultados de imagem** em `VideoCharacterFrameRenderer`; limpa leases no `clear()`. O pool de mídia limpa caches derivados sob pressão. | É retenção eficiente de resultados; **não é ainda desenho incremental por camadas/sprites**. Necessário spike Canvas/Pixi com golden de expressão PT e roupas. |
| **5. Tempo AV / recuperação** | `videoStudioNext/projectClock.ts` centraliza cálculo de tempo em frames 60 fps, usado pelo preview React e pela SceneIR de export; a export surface continua com isolamento, timeouts e render-process-gone pré-existentes. | Relógio de áudio mestre, VFR PTS real e fault-injection Windows ainda pendentes; não declarar playback unificado completo. |

**Amostragem Windows:** `window.desktop.getVideoStudioMemoryReport()` somente por chamada explícita. Para perfis de processos não-Electron, executar o script manualmente com o `mainPid` retornado pela API, durante projeto **de teste**: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/video-studio/windows-memory-probe.ps1 -RootPid <pid> -Samples 120 -CsvPath <arquivo-temporario.csv>`. Traces e CSV são privados e **não** devem conter arquivos/projetos reais em CI. Valores de working set podem se sobrepor e não são memória exclusiva.

**Validação Windows:** `npm run test:video:next` verifica diagnósticos, histórico, cache de arte e relógio. A CI Windows executa também smoke de `windows-memory-probe.ps1` (processo de teste, 1 amostra) e `windows-sceneir-stress.cjs` com **12, 24 e 48 atores, até 1000 keys, 4 referências de vídeo e timeline sintética de 15 minutos amostrada**. Essa avaliação não faz composição GPU nem decodifica áudio/vídeo reais, e **não equivale à reprodução contínua de 15 minutos**. O IPC de métricas passou a incluir os últimos 24 motivos de perda de processo renderer/child (`oom`, `crashed` etc. quando relatados pelo Electron), sem paths de usuário. O diagnóstico Windows físico e todos os gates de full raster/export continuam pendentes.

### Evidência Windows real de CI — SceneIR sintética (23/10/2026)

**Execução:** [Core architecture validation — Windows](https://github.com/nestarasup-sys/Native-gacha/actions/runs/40003220416), commit `2b7297e`, 27/27 testes específicos aprovados, typecheck e build aprovados. O probe PowerShell também executou com sucesso no runner.

| Atores | Keys | Janela cronológica | Frames **amostrados** | Referências de vídeos, sem decode | Compilação SceneIR | p95 avaliação/frame | RSS delta do processo de teste* |
| ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: |
| 12 | 300 | 15 min / 54.000 frames | 1.500 | 4 | 7,709 ms | 0,081 ms | +6,59 MiB |
| 24 | 600 | 15 min / 54.000 frames | 1.500 | 4 | 5,648 ms | 0,047 ms | +2,38 MiB |
| 48 | 1.000 | 15 min / 54.000 frames | 1.500 | 4 | 8,231 ms | 0,075 ms | +15,39 MiB |

*O RSS delta foi medido sequencialmente em um único processo Node de CI; **não** são medições isoladas, números cumulativos ou comparações de memória de GPU. A variação depende de GC e aquecimento; executar com perfis isolados e repetidos antes de tomar decisão. Todos os 1.499 pares consecutivos de avaliações amostradas mudaram de `reuseKey`, mas **não foram renderizados todos os 54.000 frames**.*

**O que o teste demonstra:** SceneIR consegue compilar e avaliar essas fixtures sem falha de contrato, com custo semântico relativamente pequeno nesse runner. **O que não demonstra:** que 48 PNGs pesados + quatro vídeos decodificados + áudio + render GPU/Canvas + IPC + FFmpeg cabem na RAM ou exportam 15 min sem travar. O teste de stress completo Windows, medição de VRAM/commit e reprodução do problema do usuário continuam **bloqueadores**.

### Estado dos cinco objetivos — não confundir cortes técnicos com conclusão

1. **Diagnóstico total Windows: PARCIAL.** A coleta Electron por PID e o script externo são funcionais, mas faltam capturas WPR/WPA/VRAM no projeto pesado e diagnóstico da causa do crash.
2. **Budget global: PARCIAL.** Cache Canvas, ImageBitmap e Gacha derivado compartilham reservas por surface; faltam decoders nativos, caches de preview, FFmpeg, recursos em voo e controle entre processos.
3. **EditorCore/histórico: PARCIAL.** Cinco comandos de timeline + histórico genérico já vivem fora da UI; maioria dos comandos/undo snapshots e persistência continuam adaptadores legados.
4. **Render Gacha incremental: PARCIAL.** Resultados de receitas faciais estão memoizados por bytes; ainda não há compositor por corpo/olhos/boca separado, atlas nem golden PT integral.
5. **Playback/export unificados: PARCIAL.** Contrato de 60 fps por frame e SceneIR compartilhados; ainda faltam relógio de áudio autoritativo, PTS/VFR, decoders coordenados e fault-injection de export.

**Logo, as cinco prioridades foram iniciadas e validadas em cortes verificáveis, mas não seria correto declará-las integralmente concluídas.**

### Sétimo corte — prevenção de alocação antes de admitir memória (Windows)

**Mudança de segurança:** no `videoExportMediaFramePool.ts`, a reserva estimada de bytes **antecede** o seek e o `createImageBitmap(video)`, usando `videoWidth × videoHeight × 4` depois de obter metadados. Se o frame não couber no ledger de 160 MiB da surface, ele **não é materializado** pelo `createImageBitmap`; antes de negar, o pool expulsa cache não usado e permite limpar caches derivados de Canvas/Gacha. A reserva acompanha o frame emprestado e é devolvida após composição, cancelamento, erro, descarte ou eviction. Se as dimensões finais excederem as declaradas, o bitmap é fechado e a renderização falha **sem publicar frame inválido**.

**Trabalhos Gacha controlados:** `videoStudioNext/rasterAdmission.ts` serializa a geração pesada de resultados Gacha por surface, com **no máximo oito trabalhos aguardando** e uma reserva antecipada de trabalho de **16 MiB estimados**. O `VideoCharacterFrameRenderer` usa essa admissão antes de cada receita de transição/boca/blink; saturação, falta de orçamento e erros produzem falhas controladas, não filas infinitas. `dispose()` rejeita trabalhos aguardando, e o trabalho ativo libera o empréstimo ao terminar. `clear()` continua descartando somente resultados derivados, para ser seguro sob pressão durante o render.

**Testes Windows novos:** rejeição *antes* de criar bitmap ou iniciar seek, erro de conversão, metadados inconsistentes, abort durante conversão, fila saturada, admissão de trabalho Gacha antes de executar, pressão sobre cache derivado e liberação exata do lease após falha/descarte. Comandos: `npm run test:video:next` e CI Windows existente. Os testes de vídeo usam mocks de browser; o typecheck/build valida integração, e **a paridade real de canvas/codec/VRAM ainda exige ensaio Windows físico**.

**Limite honesto:** reservar `w × h × 4` **não controla** preload/decoder interno iniciado ao criar um `HTMLVideoElement`, frames GPU, cópias temporárias de canvas, GL textures, malloc nativo ou memória do FFmpeg. A reserva Gacha de 16 MiB é **estimativa conservadora de workspace, não teto físico de um render**. Se a demanda real ultrapassar os tetos, podem surgir erros de export recuperáveis. A política global multi-PID e o compositor por partes continuam pendentes.

### Oitavo corte — imagens de cena limitadas por bytes em vez de 256 entradas (Windows)

O `videoCanvasCompositor.ts` guardava até **256 `HTMLImageElement`** no `imageCache` sem relação com resolução ou uso de RAM. Agora usa `VideoStudioBoundedMemo` com **48 MiB de retenção estimada** e até 128 itens, calculando `naturalWidth × naturalHeight × 4` após decodificação. Imagens grandes demais **continuam podendo ser usadas no frame**, porém deixam de ficar retidas no cache. A export surface conecta essas reservas ao **mesmo ledger de 160 MiB** usado por Canvas layers, frames de vídeo e resultados Gacha.

O cache permite `clear()` sem anular `image.src` de uma imagem que outro desenho ainda possa estar usando; isso preserva a correção durante falha/pressão e descarta as referências/leases mantidos. A callback de pressão do pool de vídeo passa a liberar **também** as imagens cacheadas, além dos layers e renders derivados. Acrescentei teste para múltiplas imagens sintéticas 1080p e uma imagem excessivamente grande.

**Limites:** as estimativas só contabilizam imagens **retidas**, não decodificação em progresso, texturas ou memória interna do Chromium. GC pode atrasar a liberação física após a referência sair do cache; não é teto global de RAM/VRAM, nem solução demonstrada do OOM. As prioridades seguintes continuam medir pressão multi-processo no Windows real e implementar raster incremental de corpo/olhos/boca, com golden PT e continuidade do export.

### Nono corte — preparar pose/corpo/roupa/cabelo uma vez para a mesma expressão Gacha (Windows)

**Implementado em produção da export surface:** `TransitionRenderer` distingue uma **receita facial com estado de origem e destino idênticos** (`transition.from === transition.to`) de uma **transição verdadeira de pose**. Quando é apenas boca/piscada/face do mesmo estado e pose, prepara `prepareSavedCharacterRenderer()` **uma única vez por personagem, pose e **aparência facial completa (incluindo índice, olhos e pupilas)****, retendo temporariamente o compositor-base (corpo, roupa, cabelo e proporções). O desenho da expressão continua dinâmico com os métodos originais de `drawFaceCatalogOverlay`, máscaras, olhos/PT, pupilas esquerda/direita, boca e efeitos. Assim as seis fases de fala não exigem reconstruir do zero a roupa e cabelo em cada fase.

**Isolamento e limites:** `TransitionRenderer` mantém LRU de no máximo **8 preparações**, com teto de **48 MiB estimados** (`width × height × 4 × 4`), integrado ao ledger de 160 MiB da exportação. O renderer limpa estas preparações quando há pressão por cache ou no `dispose()`. O fluxo de transições pose-a-pose **permanece sem cache da preparação interpolada**, pois misturas diferentes a cada frame precisam da geometria correta.

**Testes:** novas verificações sintéticas para seis variantes boca/blink sobre a mesma base (apenas **uma preparação**, mas seis renderizações faciais), pupilas PT com parâmetros independentes, isolação por pose e set facial, preservação de mixagem de duas poses, evicção por bytes e liberação final do lease. O ganho de preparação é medido por contagem de chamadas, **não equivale ainda a benchmark de FPS ou à paridade pixel-a-pixel de imagens reais**.

**Próximo bloqueador de §N4:** completar compositor por camadas/sprites com corpo/roupa/face independentes e golden Windows real para oclusão de cabelo, roupas e pupilas PT. A base reaproveitada ainda é desenhada no canvas final por variante facial e convertida em PNG para o pipeline legado, portanto a reconstrução estrutural completa do renderer não está concluída.

## Estrutura-alvo resumida

`StudioDocument/AssetManifest → ProjectRepository + EditorCore/CommandBus → SceneCompiler/Evaluator → FramePlan → ResourceBudgeter/Scheduler + GachaRenderer + MediaService → PreviewTransport / ExportService → verificador e publish atômico`.

A interface React apresenta estado e edita; não controla bitmap/decoder como parte do histórico. O autor dos estados Gacha é único por frame. A engine pesada é supervisionada e tem limites de recursos.

## Gates de conclusão

1. **Nova arquitetura real**, sem execução crítica dependente do monólito experimental;
2. **Fidelidade Gacha** total: PT L/R, pose, expressão, fala, blink, balão, transições e z-order;
3. **Projetos v1 íntegros** no roundtrip, incluindo compatibilidade com assets e undo/redo;
4. **Memória limitada e recuperação** em projetos grandes e falha injetada de processo isolado;
5. **Preview, áudio/PTS e MP4 final corretos**, sem frames faltando ou output parcial;
6. **Stress animado e embalagem Windows offline**, com CI/benchmarks registrados;
7. **Aceite do criador e autorização explícita** de merge/release.

Um reparo de OOM no código antigo **não satisfaz** por si só o gate 1. O roadmap técnico **N0–N10** do documento 12 é o plano de execução ativo.

# CODEX — EDITOR V6 · V4 / RODADA 02
# Boca isolada + cabelo export-only + redução comprovada de RAM/tempo de exportação

## Missão

Execute autonomamente a próxima rodada do Editor V6, **aproveitando as mudanças já publicadas pelo orquestrador**. O foco não é “refatorar por refatorar”, mas transformar duas experiências específicas em algo perceptivelmente melhor:

1. **ANIMAÇÃO DA BOCA:** eliminar o aspecto de quadrado/recorte que acompanha pele, cabelo e detalhes ao redor durante a fala. A boca já tem asset separado no Fabricador/Customizador. Queremos mover **somente a peça boca**, com camadas, tintas, rotação, alpha, oclusão e poses corretas. Qualidade de pixels vem antes de reduzir linhas de código.
2. **EXPORTAÇÃO MP4 — RAM + VELOCIDADE SEM PERDA DE QUALIDADE:** entender por que o consumo de memória do PC cresce durante exportação; eliminar retenções indevidas, reduzir PNG/Base64 e surfaces temporárias com evidências, mantendo nitidez e continuidade. O motor de cabelo WebGL continua **exclusivo da exportação MP4**, opt-in. **PROIBIDO animar cabelo na prévia/playback/viewport normal do Editor V6.** A prévia do Fabricador DEV continua permitida para editar presets.

Siga `AGENTS.md`. Trabalhe **somente localmente na branch Dev-V2**, sem criar branch, push, PR, merge, rebase, clean destrutivo ou mexer em dados pessoais do usuário. Preserve commits e alterações preexistentes. Faça commits locais pequenos e testes antes de avançar. Não peça confirmação para alterações técnicas de rotina; prossiga até concluir as tarefas seguras, documentando impedimentos.

## Leia antes de agir

- `docs/editor-v6/ROADMAP_V4_EXCELENCIA.md` — prioridades atualizadas, especialmente **3A boca isolada** e **3B RAM**.
- `docs/editor-v6/RODADA_01_V4_BOCA_CABELO_MEMORIA.md` — trabalho já realizado e limites não resolvidos.
- `docs/editor-v6/EXPORTACAO.md`, `ANIMACOES.md`, `PREVIA.md`, `TIMELINE.md`.
- `docs/architecture/PROGRAMA_REFATORACAO_GERAL_V3_NATIVE_GACHA.md`, `AGENTS.md`.
- Fonte: `src/renderer/src/features/editorV6/motion/bakeMotion.ts`, `sceneFaceComposition.ts`, `exportWorker.tsx`, `exportFrameAssets.ts`, `exportHairMeshRenderer.ts`, `editorV6HairMotionPreparation.ts`, `faceModeAssets.ts`, `src/renderer/src/characters/editorV6CharacterRenderer.ts`, `characterFaceCatalogRenderer.ts`; `electron/domains/editorV6/prepareMouthLoops.ts`, `exportRunner.ts`, `exportWorkers.ts`.
- Testes: `tests/editor-v6/exportFrameAssets.test.ts`, `motion.browser.ts`, `faceExport.electron.ts`, `hairMotionExport.electron.ts`, `export.electron.ts`, suites de patch facial/alpha e CI.

O orquestrador já removeu o crescimento **potencialmente ilimitado** de `assetsById` com composições faciais de cada frame, criou registro de assets com escopo de quadro e teste de 1.000 quadros, reutilizou o canvas scratch de transição de cabelo e parou de resolver a cena da mesma cabeça duas vezes por amostra. **Não reverter nem repetir essas correções; verificar benchmarks e testes reais.**

## Ordem de execução obrigatória

### P0. Confirme estado e restaure gates

1. Verifique branch, HEAD, `git status`, documentação e scripts do package.json. Não presuma que a CI histórica prova o HEAD atual.
2. Rode `npm run typecheck`, `npm run audit:architecture`, `npm run test:editor-v6` e demais suites relevantes. Confirme que `tests/editor-v6/exportFrameAssets.test.ts` está incluído no Vitest.
3. **Restabeleça FFmpeg/FFprobe na CI** antes de atribuir falhas de MP4 ao motor. O manifesto antigo apontava uma URL BtbN apagada (HTTP 404). O orquestrador encontrou candidato de release mensal LGPL `autobuild-2026-10-31-12-59`, asset `ffmpeg-n8.1.3-27-g8dca1586f4-win64-lgpl-8.1.zip`, digest publicado `d4c2a42673917b4a97104a3e9f082729a9730796b98664e37c0b7eba6c6c613d`. **Verifique na API GitHub, download e hash, contents/LICENSE, FFprobe e encoders h264/aac antes de alterar o pin.** Como o script hoje recusa `resources/video-tools` com SHA diferente, garanta compatibilidade com instalações antigas do usuário, sem sobrescrever/apagar recursos existentes. Se necessário, separe o pin **da CI** do instalado no app; prefira um manifesto versionado/retido a `latest` mutável. Não ignore testes para passar CI.
4. Não faça push sem autorização. CI hospedada só comprova o estado quando o usuário publicar; testes locais com Electron/FFmpeg verificado são essenciais.

### P1. Reproduza o quadrado da boca com fixture de verdade

Monte perfil/arquivo **sintético**, com boca aberta/fechada detalhada, pele e cabelo cruzando o retângulo antigo, bordas subpixel, cabelo anterior, opacidade parcial, várias paletas e duas poses. Inclua `talk`, `talk-blink`, boca em `motionSprite`, 720p/1080p, espelhamento, rotação, crop e transições. Capture **PNG RGBA antes/durante/depois**; compare o que muda fora do desenho real da boca.

Documente exatamente:
- A transformação que ocorre hoje em `scaleMouthForExport`.
- O retângulo detectado por `changedBounds`/`changedPixelPatch`.
- Os pixels reais que pertencem à boca versus pele/rosto/cabelo.
- O que acontece na limpeza da boca antiga e em transparências, incluindo `putImageData`.
- O efeito da oclusão do cabelo frontal e de acessórios/filtros de cor.
- Bytes de atlas/payload e custo dos `getImageData`/PNG.

**Não use suposições ou apenas recortes/retângulos menores como solução.**

### P2. Prototipe e implemente **boca como peça independente**, com validação

Aproveite o renderizador canônico de face/catálogos. Desenhe a base **sem a boca antiga** e a nova boca em camada RGBA separada com máscaras e transforms reais. Posicione-a na pilha correta de camadas, preservando a ordem dos cabelos/front face e detalhes. **Não desenhe nova boca sobre a antiga.** Considere uma região limitada para limpar o desenho antigo ou uma base sem boca na preparação, evitando refazer o personagem inteiro a cada quadro.

Reutilize as mesmas regras de pele, tintas, largura/altura, rotação, flip, offsets, pose, animação 120 Hz do cabelo (independente), escalas da boca e efeitos de expressão. Não invente outro parser de catálogos ou outra geometria de cabeça.

Garanta que `talk` e `talk-blink` continuam obrigatórios durante a fala na exportação, inclusive em transições de pose. A face estática na prévia do editor não deve piorar; a animação de cabelo não aparece nela. Se o renderizador legado não tiver boca isolável com segurança, mantenha fallback **compatível, explícito e medido**, mas não degrade a maioria dos personagens para sustentar o legado.

O contrato de dados pode usar atlas/payload **temporários de exportação**, sem alterar personagens nem projetos persistidos. Não introduza schema ou IPC incompatível sem estratégia comprovada de migração.

**Critério:** o MP4 muda visualmente **apenas a boca** em quadros da fala, sem moldura quadrada, sem remendar cabelo/pele no patch, sem halos ou duplicação da boca, com alpha e continuação de poses corretas. A referência RGBA e o resultado H.264 têm tolerâncias distintas.

### P3. Medir RAM antes/depois e eliminar retenções restantes

O usuário está jogando no computador; você tem autorização para usar toda CPU/GPU/RAM/threads/workers necessária aos testes. **Não poupe recursos artificialmente**, não espere o jogo acabar. Apenas registre que benchmarks são sob carga concorrente e não controlada.

Faça exportações **sintéticas** de pelo menos 30 s / 2 min / 5 min (e maior se necessário) com 1/4/8 personagens, cabelo e fala ligados/desligados, Turbo/seguro e 720p/1080p. Para cada cenário plausível, amostre:
- Main, renderer de export, GPU, FFmpeg: working set, private bytes, CPU e pico, quando API real permitir.
- Heap JS e strings, buffers base64/PNG, canvases, texturas WebGL, bitmap/capturas, custos de `toDataURL`.
- `faceCompositionMs`, `hairCompositionMs`, `frameRoundTripMs`, readback e taxa de quadros efetiva.
- Diferença após warm-up, crescimento por quadro, **platô**, sucessos, cancelamentos e liberação após fechar.
- Memória com 1/2 workers, variação da fila e efeitos de backpressure.

Não chamar VRAM medida se é só estimativa; não usar RSS crescente como prova de leak sem analisar retenção.

Investigue **especialmente** o custo de `sceneFaceComposition.ts` gerando um PNG de corpo inteiro a cada frame de boca e `exportWorker.tsx` gerando PNG de cabelo por frame. Considere Blob/object URLs, buffers transferíveis, `ImageBitmap`, camadas SVG/Canvas temporárias ou readback menor. Qualquer troca deve ter **ciclo de vida explícito**, gerenciamento de URLs/surfaces, descarte ao cancelar e paridade RGBA. Memória de disco e proxy não são soluções mágicas: não gerar milhares de PNGs temporários no disco sem orçamento, limpeza, autorização e ganho demonstrado.

Otimize também loops/consultas repetidas e atlas quando o perfil demonstrar custo. Não comprometa nitidez nativa, 30 FPS, áudio, fala, cabelo, transparência, 720p/1080p, Turbo e safe mode.

**Meta verificável:** o uso não cresce indefinidamente com frames após o platô, assets e processos são liberados após exportação/cancelamento, e o tempo final **não piora** significativamente sob fixture comparável. Quantifique benefícios e trade-offs, sem prometer 10×.

### P4. Regressões e entrega

Execute scripts **existentes/verificados**:
- `npm run audit:architecture`
- `npm run typecheck`
- `npm run test:editor-v6`
- `npm run build`
- `npm run test:editor-v6:hair-motion-export`
- `npm run test:editor-v6:face-export-silent`
- `npm run test:editor-v6:export`
- Testes da UI/face, geometria e contratos de IPC pertinentes.

Exija goldens **RGBA** com pele, cabelo, variação de boca, pose, espelhamento, alfa e patches transparentes. Preserve o arquivo MP4 anterior em erro; confira cancelamento, flush, sem perda de dados e resultados de FFprobe. Adicione testes reais de crescimento da memória baseados em tendências/platô, não limiar frágil fixo de RSS em máquina sob jogo.

Após cada fatia, revisar diffs, commits locais pequenos e atualizar:
- `docs/editor-v6/ROADMAP_V4_EXCELENCIA.md`
- `docs/editor-v6/RODADA_01_V4_BOCA_CABELO_MEMORIA.md` ou um novo registro da Rodada 02 com medição.
- `docs/editor-v6/EXPORTACAO.md` e `ANIMACOES.md` se comportamento mudou.

**Relatório final em PT-BR:** causas verificadas vs hipóteses; novos caminhos de boca, redução de retenção e uso de memória por processo; custo por etapa, antes/depois; PNG/goldens e MP4; testes executados e resultados reais; commits locais e pendências.

**Não pare após o diagnóstico se puder implementar com segurança. Continue até concluir as tarefas realizáveis, e, se houver limite de sessão, deixe checkpoint exato para retomar.**

**REGRAS FINAIS:** somente `Dev-V2` local, sem push/PR/merge/branch nova; nenhuma mudança na animação de cabelo da prévia do Editor V6; nenhuma perda de qualidade ou de dados.

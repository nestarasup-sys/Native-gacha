# Pesquisa 04 — Canvas2D, SVG foreignObject, raster, alpha, Sharp e imagens

**Status:** PESQUISADA EM CÓDIGO E FONTES PRIMÁRIAS · PROVA DE `foreignObject` EXECUTADA · BENCHMARK DO NOVO COMPOSITOR PENDENTE
**Rodada:** 06/11/2026 · **Revisão estática:** `Dev-V2@5166de7bacb024a72ee15505f8289f81fc9889bd`. Atualizar commit antes de adotar conclusões. **Nenhum teste Windows/MP4 foi executado nesta rodada.**

## Pergunta principal

**Onde temos processamento repetido de pixels de personagens e quais operações podem se tornar persistentes ou restritas à região alterada, sem quebrar a exata posição das camadas?**

## 1. Evidências no Native Gacha (funções e comportamento)

1. **[CÓDIGO]** `src/renderer/src/characters/editorV6CharacterRenderer.ts:100–163` prepara fonte, textura base, pele, hair back/front e roupas; `renderLayersToCanvas` separa camadas de rosto, e `renderToCanvas` as recombina.
2. **[CÓDIGO]** `editorV6CharacterRenderer.ts:360–369` expõe `render()` que devolve PNG por `canvas.toDataURL('image/png')`, enquanto `renderToCanvas` oferece superfície de canvas. A escolha entre data URL e superfície tem custo de serialização.
3. **[CÓDIGO]** `src/renderer/src/features/editorV6/sceneFaceComposition.ts:120–131` cria canvas `willReadFrequently:true`, copia base e sprite face/mouth e serializa PNG para patch. Essa operação pode acontecer por mudança facial, não apenas por hair.
4. **[CÓDIGO]** `src/renderer/src/features/editorV6/editorV6HairMotionPreparation.ts:91–328` prepara `originalRenderer` e `hairlessRenderer`, reutiliza par de wardrobe entre eles, faz split de camadas/face e converte canvas em PNG com `canvasDataUrl()`.
5. **[CÓDIGO]** `src/renderer/src/features/editorV6/exportHairMeshRenderer.ts:45` cria WebGL1 com `premultipliedAlpha:true`; `exportWorker.tsx:266–314` desenha resultado da malha em Canvas2D, cujo conteúdo segue para `<foreignObject>` da `SceneSurface`.
6. **[CÓDIGO]** `src/renderer/src/features/editorV6/exportWorker.tsx:381–414` compõe personagem em canvas do tamanho do rig e incrementa `hairRasterFrames` e `hairRasterPixels`; métodos de reação alternativos podem produzir telas diferentes.
7. **[CÓDIGO]** `SceneSurface.tsx:75–84` insere vídeo no SVG com `foreignObject`, enquanto `SceneSurface.tsx:160` o usa para canvas rasterizado do personagem; dois contratos diferentes de conteúdo embutido.
8. **[CÓDIGO]** `electron/imageIngestion.cjs:3–45` usa Sharp/libvips para decodificar e normalizar imagens de usuário em PNG, com limites (50MiB, 32M pixels) e orientação; não é evidência de que Sharp componha cabelo por frame no worker.
9. **[CÓDIGO]** `electron/domains/images/imageNormalizationIpc.ts:19–31` expõe normalização sob IPC com validação de origem, não um desenhador universal no renderer.

## 2. Pesquisa em documentação oficial — aplicabilidade e limitações

1. **[FONTE OFICIAL] [MDN Canvas API](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API)** — Canvas desenha bitmaps/paths diretamente; `drawImage` e captura de dados em CPU têm custos diferentes de atualizar atributos SVG.
2. **[FONTE OFICIAL] [MDN SVG](https://developer.mozilla.org/en-US/docs/Web/SVG)** — SVG é árvore vetorial com transforms, clips, masks e foreignObject; substituir por Canvas exige reimplementar semântica de order/transform.
3. **[FONTE OFICIAL] [MDN OffscreenCanvas](https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas)** — OffscreenCanvas permite canvas em worker, mas não move DOM/SVG/React para um worker e pode exigir ciclo de vida de ImageBitmap.
4. **[FONTE OFICIAL] [MDN transferToImageBitmap](https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas/transferToImageBitmap)** — ImageBitmap criado ocupa recursos gráficos; consumir no bitmaprenderer ou fechar explicitamente; drawImage aceita OffscreenCanvas direto em vários casos.
5. **[FONTE OFICIAL] [Sharp composite](https://sharp.pixelplumbing.com/api-composite/)** — Composição com blend, posição e overlay; transformações da imagem de base são aplicadas antes da sobreposição, relevante para oclusão e crop.
6. **[FONTE OFICIAL] [Sharp performance](https://sharp.pixelplumbing.com/performance/)** — libvips e libuv possuem concorrência/caches próprios; perf de normalização de imagem não prova perf de compositor por frame.

**Atenção:** documentação “latest” não garante a API ou o comportamento no build do Electron/Chromium/Node/FFmpeg instalado no PC. Não foram auditados os fontes upstream inteiros; o estudo abrange contratos públicos e código de integração.

## 3. Diagnóstico técnico e oportunidades (não são ganhos medidos)

### 3.1 O custo estrutural não é apenas física de cabelo

[CÓDIGO] O app possui dois renderizadores durante prep, PNGs e camadas faciais, e um compositor dinâmico de imagem completa no export worker. Embora exista reuso de wardrobe, ainda resta produção repetida potencial de corpo/face e conversões.

### 3.2 A camada posterior exige plano de desenho sem duplicação

[HIPÓTESE] Para gerar apenas cabelo RGBA, a base do personagem **não pode conter o mesmo cabelo posterior parado**. É preciso separar `baseWithoutPosteriorHair`, a reação posterior e a oclusão por cabeça/corpo. Desenhar `hair` simplesmente sobre PNG final criaria cabelo duplicado e ordem errada.

### 3.3 Alpha e antialias são critérios funcionais

[FONTE + CÓDIGO] WebGL premultiplica alpha e Canvas/Sharp podem usar representações distintas. Verificar halos em fundos contrastantes e compor em RGBA antes de H.264 (yuv420p perde alpha).

### 3.4 Static caching requer identidade visual completa

[HIPÓTESE] O reuso de canvas/crop por pose e face só é seguro com chave baseada em fonte/pose/roupa/face/cabelo/tint/headExtra/escala; ID de personagem ou PNG aparentemente igual não bastam.

### 3.5 `foreignObject` e vídeo externo precisam ser tratados separadamente

[CÓDIGO] `<video>` não se comporta como canvas de cabelo. Uma alternativa de compositor estático pode falhar com vídeo/seek/texto se não preservar tempo e blend.


## 4. Experimentos reproduzíveis (propostos, NÃO EXECUTADOS)

1. **I0 — superfície de repouso:** Renderizar personagem com cabelo ativado mas sem reação; comparar com caminho estático para detectar diferença legítima de preview/snapshot.
2. **I1 — medir CPU/bytes:** Instrumentar `renderToCanvas`, `toDataURL`, drawImage full-rig, imagens por personagem, pixels totais e consumo RAM; não duplicar trabalho de contadores existentes.
3. **I2 — ROI:** Extrair ROI do cabelo posterior e base sem cabelo, compor abaixo da cabeça, comparar PNG 32-bit sobre branco/preto/checkerboard e regiões em movimento.
4. **I3 — abordagem Sharp:** Testar somente montagem de imagem estática ou atlas offline com Sharp vs Canvas; verificar cor, crop, blending, tempo frio e custo de IPC; não mover mesh WebGL para libvips sem suporte.
5. **I4 — modos:** Múltiplos atores, zoom, flipX, pose, barba/acessórios, boca e face; avaliar pixel diff por frame e alpha.
6. **I5 — tempo total:** Ganho só conta se reduzir prep+captura+encode no mesmo intervalo, não apenas a linha `hairCompositionMs`.

## 5. Invariantes, riscos e critérios para adotar

- **Correção visual:** hair atrás da cabeça, boca sobre a face, head extras, mascára de cabelo e crop, escala e flip.
- **Memória:** mini-atlas de 29 frames multiplica dimensões de ROI e VRAM por ator/preset; evitar full-frame RGBA.
- **Persistência:** não salvar cache derivado como imagem canônica do usuário.
- **Vídeo:** preservar media `<video>` e overlay de FFmpeg após tirar `foreignObject` de algum subconjunto.
- **Fontes:** Sharp não deve ser vendido como renderizador de física/rig/SVG dinâmico sem implementar essas funções.

## 6. Veredito de pesquisa e bloqueios

**Conclusão:** priorizar separação da camada posterior RGBA/ROI e eliminar recomposição desnecessária, mas somente se o profiler mostrar custo do compositor. Registrar `IMG-001` (pixels e serializações por personagem) e `IMG-002` (golden RGBA de hair ROI).

**Ainda não sabemos:** quanto `toDataURL` e Canvas full rig custam em wall clock, memória de rigs, perfil de alpha real e impacto de várias texturas em paralelo.

**Relações com outras pesquisas:** [Arquitetura do app](01-ARQUITETURA-GERAL-E-INTEGRACOES.md), [Plano executável](../PLANO_EXECUTAVEL.md), [Matriz de oportunidades](../MATRIZ_DE_OPORTUNIDADES.md) e [Fontes](../evidencias/FONTES-OFICIAIS.md).

## 7. Revalidação no motor novo — 06/11/2026

**[RUNTIME Electron 45.1.0 / Chromium 156]** `npm run test:editor-v6:surface` montou um canvas RGBA sintético dentro do mesmo `foreignObject` usado por `SceneSurface` para cabelo rasterizado. `capturePage` preservou o pixel de referência `17,221,103,255`. Serializar o SVG vivo para Blob e carregá-lo como imagem contaminou a origem do canvas de leitura (`getImageData` lançou erro); o round-trip de bitmap não é seguro nessa forma. O scratch, incluindo perfil Chromium e imagens, foi removido pelo harness.

**Consequência arquitetural:** SVG→Canvas não é uma rota de composição aprovada. Foi criado um adaptador candidato `Canvas2DFrameSurface`, sem importar React, que desenha bitmaps e hair canvas diretamente e mantém falas/pensamentos em SVG vetorial por causa da rasterização tipográfica. A quebra de linha é compartilhada por um módulo leve independente de UI. A captura SVG/capturePage continua em produção; o candidato ainda não foi medido em exportação real. Vídeo embutido por `<foreignObject>` é rejeitado pelo candidato e exige fallback; `dispose` libera as imagens/canvases do job.

**Golden sintético Canvas2D vs capturePage:** a fixture expandida cobre personagem com atlas/motionSprite, flip/rotação e máscara de boca, imagem, narrador, fala/pensamento com speaker labels e background asset; 6.750 canais divergentes em 2.073.600 (<0,33%), máximo 90/255, erro médio 0,14072. Todos os pixels-controle do fundo coincidiram. A fixture simples de fala ficou em 7.524 canais, máximo 75/255 e média 0,12531; SVG atual no mesmo gate teve 7.524 canais e média 0,12531. Canvas hair RGBA com alpha + máscara e sprite de boca + flip + rotação: 6.860 canais divergentes, nenhum fora do ator, máximo 35/255 e média 0,00563. A camada frontal preservou alpha 0 fora da figura. Isto cobre apenas fixtures sintéticas; não cobre pose/cabelo real em movimento, vídeo, leitura/encoder nem velocidade.

**Fontes primárias adicionais:** [SVG 2 — `foreignObject`](https://svgwg.org/svg2-draft/embedded.html#ForeignObjectElement) documenta a inclusão e renderização de conteúdo HTML no SVG; [HTML Standard — Canvas](https://html.spec.whatwg.org/multipage/canvas.html#security-with-canvas-elements) especifica a proteção de leitura de pixels por estado *origin-clean*. A falha observada no Electron é um resultado de runtime local, não uma conclusão inferida apenas da especificação.

**Próximo experimento:** cobrir hair raster real em movimento e vídeo/fallback/cancelamento; então comparar exportações frias equivalentes do projeto completo, medindo wall time, cópias/readback, áudio, tamanho/qualidade do MP4 e memória. Manter a rota SVG como fallback até paridade real e ganho de parede comprovados.

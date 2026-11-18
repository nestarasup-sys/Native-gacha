# Editor V6 · V4 — Rodada 01: retenção de RAM, cabelo e diagnóstico da boca

**Data:** 2026-11-03  
**Branch:** `Dev-V2`  
**Tipo:** execução parcial de código + pesquisa técnica + planejamento de qualidade.  
**Escopo:** o Editor V6; não houve mudança de schema, persistência, assets existentes, paleta ou UI. A animação de cabelo permanece **exclusiva do MP4 exportado**, nunca da prévia normal do editor.

## 1. O que o usuário pediu

- O efeito de fala **não deve parecer ampliar um recorte quadrado da pele, do cabelo e de detalhes próximos da boca**. O editor já possui bocas como assets individuais, de modo que um caminho de renderização boca-only deve ser investigado.
- Manter ou melhorar nitidez, alpha, geometria, boca obrigatória, poses e qualidade MP4 **ao mesmo tempo que acelera a exportação**.
- Investigar a RAM do computador, que parece só subir durante exportações longas. Avaliar buffers, GPU, processos Electron/FFmpeg, limites reais de cache e descarte de superfícies — **não** “mover toda a RAM para disco” sem verificar impacto e segurança.
- Foco imediato em **boca + cabelo + memória**; outras melhorias da timeline e do Editor V6 continuam no roadmap.

## 2. Análise confirmada do código da boca

Em `src/renderer/src/features/editorV6/motion/bakeMotion.ts`, `scaleMouthForExport` modifica o transform **da boca**; depois os quadros são renderizados no canvas **do personagem inteiro** e comparados via `changedBounds`. `changedPixelPatch` captura **um retângulo RGBA completo** com margem de amostragem; `src/renderer/src/features/editorV6/sceneFaceComposition.ts` reconstitui esse retângulo sobre uma nova cópia do personagem usando `getImageData` e `putImageData`.

Portanto, a animação não foi projetada para “escalar o cabelo” intencionalmente. O problema arquitetural é que a **boca não permanece uma peça independente no caminho de exportação**: há uma atualização retangular de pixels que inclui também pele/cabelo/contorno existentes naquela região. Isso pode causar molduras visuais, depender do recorte e gastar CPU/RAM de composição; **a causa exata do artefato observado não foi comprovada com quadros reais**.

**Decisão desta rodada:** não trocar por `source-over` sem criar base sem boca. Pixels apagados (alpha 0) e antigas bocas não podem ficar por baixo do novo desenho. O próximo protótipo deve reutilizar o renderizador facial do Fabricador/Customizador, extraindo **camada de boca + base sem boca + ordem correta de sobreposição**, com suporte a rigs legados, expressões, sobreposições de cabelo e transições de pose. Ver roadmap.

## 3. Mudanças de código executadas agora

### 3.1 Parar retenção indefinida de PNGs temporários do rosto

O worker `exportWorker.tsx` tinha um mapa `assetsById` que persistia durante **toda a exportação**. A cada frame de fala ele inseria todos os itens de `composeEditorV6FaceReplacements` nele. Essa composição já possui um LRU de **32 MiB de caracteres** em `sceneFaceComposition.ts`, mas a inserção no mapa do worker podia manter referências a PNGs antigos *depois* da expulsão do LRU.

**Correção:** separar assets duráveis de assets de um frame:
- `src/renderer/src/features/editorV6/exportFrameAssets.ts`: lookup que prioriza assets da renderização atual, com fallback aos permanentes sem mutá-los.
- `exportWorker.tsx`: não inserir PNGs faciais ou cabelo temporários em `assetsById`; manter somente as referências de frame. Os atlas faciais de transição explicitamente reutilizáveis ainda podem ser guardados por ID.
- `tests/editor-v6/exportFrameAssets.test.ts`: verifica 1.000 frames sintéticos, IDs reaproveitados, mudança das imagens por frame e tamanho constante do mapa de assets permanentes.

**Resultado esperado:** o número de PNGs retidos **pelo registro permanente do worker** deixa de crescer com o número de frames. **Não foi medido** impacto em RSS, heap ou GPU. Outros caches do browser continuam existindo.

### 3.2 Canvas de transição do cabelo reaproveitado

`composeMotionHairFrame` alocava um novo canvas na resolução nativa do personagem para cada amostra de pose, reencodando PNG e reduzindo canvas a 1×1 no fim. Agora reutiliza **um canvas scratch por worker**, limpa antes de cada frame, redimensiona somente se as dimensões mudarem e libera no evento `pagehide`.

O desligamento também libera os backing stores dos canvases de warp e dos canvases de composição de cabelo, em complemento ao descarte de texturas e buffers WebGL que já existia.

**Resultado esperado:** menos alocações de superfícies grandes e menos pressão sobre garbage collector/Chromium. **Não há medição que permita afirmar quantos MiB ou ms foram economizados.**

### 3.3 Não resolver a mesma cena de cabeça duas vezes

O cálculo dos percursos de âncora física da cabeça já resolvia a cena de cada quadro em `ensureHeadPaths`; `headAnchorAtFrame` resolvia a mesma cena novamente por personagem. Agora utiliza o elemento já resolvido, preservando o mesmo cálculo de pivôs, crop, espelhamento e transição.

**Resultado esperado:** menos trabalho redundante com múltiplos personagens. Precisa de benchmark comparativo para quantificar.

## 4. O que ainda não foi feito

- **Não** foi implementado compositor boca-only; requer teste com alpha e arquitetura de camadas. O recorte retangular atual continua existindo nesta rodada.
- **Não** foi provada queda ou estabilização da RAM durante exportação longa. O trabalho feito elimina uma fonte concreta de retenção, mas a memória deve ser medida por processo.
- **Não** foi executado localmente Electron/FFmpeg no computador do usuário por este orquestrador. Os arquivos foram atualizados no repositório remoto; apenas CI hospedada e Codex no PC podem fazer esse aceite. **Não declarar passes de testes ainda não obtidos.**
- A CI do commit inicial do roadmap `0354c065` tinha uma falha do manifesto pinado do FFmpeg (404). O Codex deve restaurar essa cadeia verificada sem forçar `latest` ou atualizar uma instalação local existente de maneira destrutiva.

## 5. Pesquisa técnica

- Electron recomenda medir uso de recursos por processo e não transferir trabalho pesado ao Main sem propósito: [Performance](https://www.electronjs.org/docs/latest/tutorial/performance), [app.getAppMetrics](https://www.electronjs.org/docs/latest/api/app#appgetappmetrics).
- `globalCompositeOperation` oferece `destination-in`, `destination-out`, `source-over`, mas a escolha exige testes RGBA para não deixar fantasma da boca anterior: [MDN Canvas composite](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/globalCompositeOperation).
- `ImageBitmap.close()` libera recursos gráficos *quando* este tipo for adotado: [MDN ImageBitmap.close](https://developer.mozilla.org/en-US/docs/Web/API/ImageBitmap/close). A API não elimina por si só buffers de `HTMLCanvasElement` ou `HTMLImageElement`.
- `Canvas.toDataURL` por quadro pode causar overhead de PNG/Base64 e retenção transitória; é um candidato ao profiling do worker. Não substituir pelo `Blob` sem plano de ciclo de vida e testes do `SceneSurface`.
- Manifesto FFmpeg antigo apontava a tag `autobuild-2026-10-20-13-08`, que retornou 404. A API de releases do mantenedor expôs uma release **mensal de 31/10/2026** sob tag `autobuild-2026-10-31-12-59` e asset LGPL 8.1 `ffmpeg-n8.1.3-27-g8dca1586f4-win64-lgpl-8.1.zip`, digest `sha256:d4c2a42673917b4a97104a3e9f082729a9730796b98664e37c0b7eba6c6c613d`. É **candidato** a pinagem futura, não foi baixado, executado ou verificado quanto a encoders/licença dentro do ZIP nesta rodada. Preservar compatibilidade com instalação antiga do usuário.

## 6. Plano de validação obrigatório no próximo ciclo

1. `npm run typecheck`, `npm run audit:architecture`, `npm run test:editor-v6` (inclui o teste novo), testes de exportação/cabelo/face e `npm run build`.
2. Depois de restaurar o FFmpeg pinado na CI, executar `npm run test:editor-v6:hair-motion-export`, `npm run test:editor-v6:export` e `npm run test:editor-v6:face-export-silent` em Electron/FFmpeg real.
3. Exportar **no perfil sintético** 30 s, 2 min e 5 min com 1/4/8 personagens, fala e cabelo ligados/desligados e com diferentes transições.
4. Comparar heap JS, RSS/private bytes, GPU e FFmpeg, pico/platô por quadro e liberação ao finalizar/cancelar/fechar. Comparar baseline anterior quando reproduzível e controlar warm-up. Medições com jogo ativo são **sob carga concorrente**, não puras.
5. Fazer fixture RGBA com cabelo e pele atravessando a área antiga da boca; avaliar máscara/camada da boca real antes de alterar snapshots persistidos ou o contrato facial.

## 7. Continuidade

- [Roadmap de excelência V4](ROADMAP_V4_EXCELENCIA.md), especialmente os novos P0 **3A (boca somente como asset)** e **3B (RAM da exportação)**.
- [Prompt de execução da rodada seguinte](CODEX_RODADA_02_V4_BOCA_CABELO_RAM.md).
- [Exportação e limitações atuais](EXPORTACAO.md).

**Sem mudanças na prévia de cabelo do Editor V6: somente exportação MP4 opt-in.**

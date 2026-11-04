# Editor V6 — Rodada 14 · Pincel facial único no bake de transições

**Data:** 2026-11-04. **Branch:** `Dev-V2`. **Base:** `24eca34274b53760dc5668a805ca174beb747e6a`.

## Gargalo identificado

Cada amostra de transição com cabelo precisava de dois resultados do mesmo renderer: (a) imagem corporal completa, usada para recorte e atlas; (b) camadas `behindFace / face / inFrontOfFace`, usadas pelo compositor experimental do cabelo.

O caminho anterior invocava `paintPreparedFace` duas vezes por amostra, uma vez por `renderToCanvas` e outra por `renderLayersToCanvas`. A função facial resolve e pinta componentes como olhos, sobrancelhas, boca, pupilas, expressões e acessórios. Para 11 transições de até sete amostras, esse trabalho podia repetir dezenas de vezes. **A contagem de chamadas é conclusão do código, não uma medição em segundos.**

## Implementação

- `editorV6CharacterRenderer.ts`: novo `renderToCanvasWithLayers`. Prepara o rosto no canvas de face uma única vez e desenha as três camadas em ordem no buffer corporal completo, usando as mesmas proporções/transformações da saída normal. O renderizador tradicional continua inalterado para preview e demais chamadas.
- `motion/bakeMotion.ts`: somente `captureLayerAtlases` da exportação usa o método de dupla saída. O bake comum do Editor/Fabricador continua chamando `renderToCanvas` como antes. Continuidade de rig, boca isolada, escala, recortes e ordenação preservadas.
- `motion.browser.ts`: compara **cada canal RGBA** do método legado e do método de dupla saída, nos modos `idle` e `talk` de uma fixture Electron com corpo e boca sintéticos.
- `editor-v6-parity.yml`: executa esse teste em Electron **Windows x64** antes da matriz de cabelo, vídeo e pixels MP4. Não utiliza Linux.

## Riscos e aceitação

A composição separada de camadas pode arredondar alpha de maneira diferente do desenho direto em alguns sprites semitransparentes. Este risco é deliberadamente testado com **RGBA nativo exato** e com paridade de pixels/MP4 Windows. Se a CI acusar diferença, não enfraquecer a comparação; reverter o caminho rápido e investigar uma solução com draw commands compartilhados que mantenha a mesma ordem de blend.

Nenhuma alteração no preset armazenado no Fabricador, cache de reexportações, documentos do usuário, áudio, FPS, taxa de bits ou prévia normal.

**Resultado temporal:** ainda não medido no `Editor V6 06` do Windows 11 AMD. Medir frio e quente no benchmark existente antes de declarar ganhos. O efeito esperado é reduzir a quantidade de processamento facial em cada primeiro export, não aproveitar exportações passadas.

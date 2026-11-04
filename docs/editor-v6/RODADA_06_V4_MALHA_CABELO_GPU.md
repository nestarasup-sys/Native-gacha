# Editor V6 — Rodada 06 · Malha do cabelo mais barata (CPU + WebGL)

**Data:** 03/11/2026 (Brasil; commits UTC de 04/11). **Branch:** `Dev-V2`.  
**Continuidade da [Rodada 05](RODADA_05_V4_RETOMADA_BENCHMARK.md).**  
**Escopo:** otimização matemática da malha compartilhada e do renderer **exclusivo do export**, sem trocar física 120 Hz, pixels de origem, resolução, presets ou animação na prévia normal do Editor V6.

## Achado verificável na implementação

A malha usa **24 colunas × 32 linhas**: isso significa `(24+1) × (32+1) = 825` vértices por peça de cabelo, atualizados a cada quadro de exportação.

Antes:
- `createHairMotionMeshPositions()` alocava um `Float32Array` novo com **1.650 floats** (6.600 bytes) a cada chamada. O renderer copiava essa matriz para outro `Float32Array` persistente antes de `gl.bufferSubData`.
- Para cada um dos 825 vértices, chamava `hairMotionOffset(state, v, anchor)`, apesar de **`v` ser idêntico em todas as 25 colunas da mesma linha**.
- `exportHairMeshRenderer.ts` chamava `gl.getParameter(MAX_TEXTURE_SIZE)` e `gl.getParameter(MAX_VIEWPORT_DIMS)` **para cada peça/quadro**, embora esses limites sejam estáveis durante a vida do contexto WebGL usado no worker.

Isso é trabalho repetido no hot path, independente de quantos personagens ou presets existam.

## Alterações publicadas nesta rodada

### 1. Spring offset por linha, sem alterar a geometria

Arquivo: `src/renderer/src/characters/hairMotionMeshGeometry.ts`.

Foi introduzido `fillHairMotionMeshPositions(destination, state, settings, intensity, phase, columns, rows)`, que:
- escreve diretamente no buffer já alocado;
- calcula o deslocamento vertical **uma vez por linha** e o reutiliza nas colunas;
- mantém a fórmula original de `flutter` (dependente de `u`, `v`, tempo e fase);
- preserva a mesma ordem matemática usada para os valores `Float32` e os limites de deslocamento;
- valida tamanho/forma do buffer para evitar geometrias silenciosamente incompletas.

No perfil padrão, as chamadas de `hairMotionOffset` por peça/quadro caem de **825 para 33 (96% a menos nesse cálculo específico)**. Isso **não** representa redução de 96% do tempo total da malha nem da exportação; o shader, os senos, WebGL/DOM, captura e FFmpeg continuam tendo trabalho próprio.

`createHairMotionMeshPositions()` permanece como API pública para a prévia no Fabricador; ele aloca e delega ao mesmo algoritmo, evitando divergência entre prévia do Fabricador e exportador.

### 2. Buffer reaproveitado no worker

Arquivo: `src/renderer/src/features/editorV6/exportHairMeshRenderer.ts`.

Em vez de `resources.positions.set(createHairMotionMeshPositions(...))`, o worker preenche `resources.positions` diretamente e manda o mesmo buffer via `gl.bufferSubData`.

**Economia estrutural por chamada de renderização:** evita uma alocação de ~6,4 KiB e a cópia JS de 1.650 floats. O driver/WebGL ainda pode copiar o buffer para a GPU; não há alegação de zero-copy com GPU.

### 3. Limites da GPU uma vez por contexto

O renderer agora consulta `gl.MAX_TEXTURE_SIZE` e `gl.MAX_VIEWPORT_DIMS` durante `createResources()`. Cada render subsequente verifica dimensões usando os números armazenados, sem consultar o driver novamente. O renderer já rejeitava perda de contexto, de modo que não aceita indevidamente uma restauração sem recriar recursos.

A API [WebGL getParameter](https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/getParameter) define essas capacidades. `gl.bufferSubData` segue sendo usado para atualizar um buffer existente: [MDN bufferSubData](https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/bufferSubData).

### 4. Testes de paridade

`tests/editor-v6/hairMotionMeshGeometry.test.ts` mantém uma cópia independente da **fórmula antiga** como referência. Testa igualdade de **cada valor Float32** contra o código otimizado para:
- cabelo ligado/desligado;
- intensidades 0, 17, 75, 100 e 150;
- fases negativas, zero e positivas;
- malhas de resolução padrão e reduzidas;
- buffer reutilizado depois de vários valores de tempo;
- rejeição de dimensões inválidas.

Esse teste protege o cálculo da malha, **mas não substitui o teste Electron/FFmpeg de WebGL, alpha, transições e cabelo real**. A CI foi acionada, mas o resultado do HEAD deve ser verificado depois dos commits finais.

## Critério de aceitação real

Esta rodada ataca um gargalo concreto de CPU e chamadas WebGL, preservando a geometria por fórmula. **Nenhuma medição de FPS/segundos do projeto Editor V6 06 foi executada aqui**, pois o projeto pessoal não existe no repositório remoto.

Ao validar no PC:
1. Comparar imagens RGBA/capturas e MP4 da mesma cena com Preset 2 (normal, espelhado, transição, boca e vários personagens).
2. Comparar a contribuição em `hairCompositionMs`, tempo médio de render por frame, `captureMs`, `ffmpegWriteMs` e tempo total **incluindo preparo do bundle**.
3. Repetir 300 quadros com cache frio e quente e observar a taxa de exportação ponta a ponta.
4. Se a maior parte do tempo continuar em pintura/captura/codificação, **não** declarar o trabalho concluído; investigar cache de camadas estáticas, pipeline sem `capturePage` ou composição dinâmica direta **com testes de pixel**, como descrito em [CODEX Rodada 05](CODEX_RODADA_05_V4_EXPORT_10_15S.md).

**Meta vigente:** 10 s de MP4 em 10–15 s, com dois personagens e Preset 2; **não atingida nem comprovada** nesta rodada. Evitar rebaixar resolução, FPS, nitidez, boca ou movimento capilar para melhorar números.

**Cabelo animado permanece somente no MP4 exportado.**

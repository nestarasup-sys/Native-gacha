# Editor V6 — Rodada 09 · Catálogo de imagens apenas do quadro visível

**Branch:** `Dev-V2`. **Base:** `f3098be1bd15c5340de61befefdc6edf580f2fa4`.
**Escopo:** pipeline de composição facial e assets do exportador, preservando renderização do preview e dados pessoais.

## Gargalo estrutural

Com cabelo animado, mesmo quando só dois personagens aparecem, o worker executava a cada quadro:
- reconstrução de `Map(project.assets)` na composição facial;
- materialização de `[...assets, ...additions]` mesmo quando não havia composição;
- um segundo `Map` de todos os assets para a resolução da cena;
- passagem do catálogo inteiro a `SceneSurface`, que criava mais um mapa no React.

O custo de catálogo era proporcional ao número de assets do documento, em vez do número de imagens realmente usadas no quadro. Essa conclusão é sobre a complexidade do código; **não representa benchmark em segundos**.

## Alterações

1. `sceneFaceComposition.ts`: aceita índice imutável de base e opção `additionsOnly` específica do worker. O contrato público anterior continua padrão. Quadros sem substituição facial retornam imediatamente, sem criar promises/cópias de array de catálogo.
2. `exportWorker.tsx`: prepara o índice de catálogo uma vez na inicialização; mantém o cache durável de atlas independente; fornece apenas os assets faciais recém-criados ao registro do quadro.
3. `exportFrameAssets.ts`: `selectEditorV6RenderableAssets` seleciona fundo/elementos/mouthPatch por camada, evita IDs repetidos, respeita o asset atualizado do quadro e não altera os mapas.
4. O pré-carregamento de imagens e o `SceneSurface` passam a receber apenas as imagens resolvidas para a camada atual, sem modificar `SceneSurface`, renderização, comportamento da prévia ou cache do Fabricador.
5. Testes com catálogo sintético de 1.504 assets comparam o **SVG integral** do caminho antigo e novo nas três camadas, além de testar substituição de IDs, deduplicação, ausência de assets e compatibilidade da composição facial.

## Segurança de dados e critérios

- Nenhum asset do usuário é apagado ou escrito. O índice de base mantém referências aos objetos originais, não duplica strings base64. Atlas transitório continua restrito ao quadro ou ao cache durável explícito.
- A renderização ainda exige imagens decodificadas antes da captura; o token do Chromium, áudio, FFmpeg, 30 FPS, ordem visual, transparência, boca e físico do cabelo permanecem como antes.
- Resultados em SVG e testes MP4 sintéticos devem ser verificados na CI. **O ganho de tempo real da exportação não foi medido no projeto pessoal** e a meta de até 15 segundos ainda precisa ser comprovada por benchmark isolado.

# Ciclo 19 — Presets DEV portáteis, rosto-base e PT

Branch de trabalho: `feature/model-source-editor` · PR #5 (draft). **Não fazer merge na `main` sem autorização.**
Esta entrega é para **Windows**: testes Node/TypeScript e Electron GUI Windows; Linux não é critério de aceite.

## Regra de domínio

O Presets DEV autoriza **21 atuações faciais**, não a aparência visual definitiva de nenhum personagem.

- **Fabricador / Presets DEV**: escolhe os PNGs de referência apenas para compor/visualizar movimentos; armazena variações relativas de olhos, sobrancelhas, pupilas, nariz e boca. Não edita a biblioteca do Customizador.
- **Customizador**: conserva autoridade dos PNGs, composição, cores, opacidade, posições, tamanhos e escala de cada rosto.
- **Studio / Video Studio**: resolve `personagem.base + preset.portableMotion + direção (normal|PT) + ajustes próprios de cena`. Sempre começa da base, nunca acumula a transformação da expressão anterior.
- **Normal**: olhar **à direita**. **PT**: *a mesma emoção*, olhar **à esquerda**. O estado `activeExpressionGaze` é um campo opcional do ator na cena. Não cria uma segunda expressão, não modifica o rascunho do Presets DEV e não toca nos PNGs.
- **Blink/Talk**: seguem a lógica de olho fechado / boca aberta do próprio personagem. Efeitos de expressão aplicam-se sobre sua composição; nariz e paletas conservam opacidade/cor do personagem.

## Portabilidade

`portableMotion` é um campo **opcional** e versionado em cada preset (`version:1`). Guarda somente movimentos normalizados por largura/altura de cada parte (`dx/dy`), escala relativa (`sx/sy`), rotação incremental e inversão de imagem, por camada.

Para pupilas, os movimentos são medidos em **dimensões do olho**, não no PNG da pupila. Ao aplicar a outro rosto, a medida vem dos **assets do personagem destino**. Assim o resolvedor não precisa reabrir imagens da autoria quando o movimento portátil já existe.

`referenceTransforms`, `selections`, `transforms` e schemaVersion:1 seguem legíveis e mantidos, para não perder modelos/expressões existentes. O modo antigo ainda é aceito quando não há movimento portátil; nesse caso, a falta de um asset de autoria é diagnosticada de forma explícita. A conversão é feita ao salvar/publicar expressões no DEV, **não como migração automática na leitura**.

Se um asset não puder fornecer métrica, movimentos portáteis existentes da mesma composição permanecem intactos; o sistema não inventa medidas, não apaga a biblioteca nem substitui automaticamente o JSON.

## PT

`resolvePresetPupilGaze` é uma função pura compartilhada com a prévia do Presets DEV e com a composição de Studio/Video.

O deslocamento horizontal de uma pupila é derivado da amplitude da expressão original relativa à base do personagem, com inversão de sentido conforme direção, espelhamento do asset direito e `flipX` do olho. Deslocamentos muito pequenos recebem uma amplitude padronizada de 16% da largura do olho; tamanho, posição vertical e rotação permanecem. Alternar normal ↔ PT não muda o preset nem acumula deslocamentos.

## Prévia no Presets DEV

Botão **Testar em personagem** abre diálogo somente leitura. Mostra lado a lado a base do personagem do Customizador e o preset aplicado por meio do mesmo `buildStudioExpressionAppearance`, `buildStudioExpressionTransforms` e `renderSavedCharacter` do Studio. Seleciona somente personagens que compartilham o slot de modelo compatível. Não salva PNG, Customizador ou cenas.

## Arquivos

- `src/shared/portableExpression.ts`: compilação, validação e aplicação de movimento independente do asset e direção PT.
- `src/shared/fabricator.ts`: campo `portableMotion` opcional no preset.
- `src/shared/studio.ts`: estado opcional `activeExpressionGaze` nos elementos.
- `ExpressionPresetWorkspace.tsx`: compilação durante salvar individual/lote e prévia PT sem tocar em transforms autorados.
- `ExpressionCharacterPreview.tsx`: teste com personagem real em diálogo não destrutivo.
- `studioExpressionTransforms.ts`: único resolvedor comum de Studio e Video Studio, incluindo fallback legado.
- `StudioPage.tsx`, `VideoStudioEditor.tsx`: aplicam e restauram Normal / PT com mesmo preset e base.
- `tests/expression-portable-gaze.test.mjs`: regressões com duas faces e PNGs de autoria intencionalmente indisponíveis, 21 expressões, alternância PT repetida, cores e base imutáveis.
- `visualUiCapture.ts`: testa ações PT e o diálogo na interface real Electron para Windows.

## Compatibilidade / critérios de aceite

1. Personagens com dois conjuntos de face diferentes preservam seus próprios assets/cores/transformações-base.
2. 21 expressões podem ser aplicadas sem recuperar os PNGs antigos quando possuírem `portableMotion`.
3. Normal é olhar à direita; PT é a mesma expressão olhando à esquerda. Alternar repetidamente não muda dados e persiste na cena.
4. Studio e Video Studio usam o mesmo resolvedor tanto na aplicação quanto na recomposição após abertura/revisão dos assets.
5. Presets legados sem movimento portátil seguem legíveis; ausência de referência gera erro recuperável e nenhuma migração destrutiva.
6. TypeScript, testes de refatoração e Electron GUI Windows aprovados no HEAD final, além de validação humana posterior na instalação pessoal.

**Limites:** o teste sintético Windows não substitui uma conferência estética com os PNGs pessoais do usuário, sobretudo em olhos espelhados e bocas com variantes ausentes. A prévia não é mecanismo de conversão cross-model: permite escolher personagens do mesmo slot de modelo para preservar compatibilidade. Não editar fontes pessoais para tentar corrigir uma projeção no Studio.

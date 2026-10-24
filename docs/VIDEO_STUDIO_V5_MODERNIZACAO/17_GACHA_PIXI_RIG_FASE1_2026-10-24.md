# Video Studio — fase 1 do Gacha Rig Runtime / PixiJS (24/10/2026)

**Branch:** `Main-desenvolvimento`. **Objetivo:** substituir trabalho repetido de preparar poses por sprites e texturas persistentes, preservando a interface, a composição visual autoral, a timeline e os documentos existentes.

## Entrega 1 — runtime Pixi com partes persistentes

O módulo `src/renderer/src/features/videoStudio/pixiGachaPoseRig.ts` define `PixiGachaPoseRig`, isolado por uma pequena interface compatível com a API do PixiJS v8 (`Container`, `Sprite`, `Texture.from`). Ele recebe `PoseArtwork` criado pelo motor atual e usa **`mixPoseArtwork` canônico** para atualizar poses e juntas, incluindo rotação de caminho curto. Texturas são identificadas pelo `part.dataUrl`; cada peça mantém sua identidade `Sprite` durante a animação. Ordem das camadas e peças ocultas seguem as mesmas regras de `characterRenderer.renderArtwork`. Se a ordem não mudou, não refaz a scene tree.

A fonte permanece read-only; não grava presets, poses, projetos ou assets.

**Esta fase ainda NÃO substitui o desenho principal no editor**, pois a composição exata inclui skin tone/tingimentos, roupas e acessórios, cabelo atrás/à frente, máscaras dos olhos/PT, boca e efeitos faciais. Mudar a preview padrão antes de preservar tudo isso seria uma regressão visual. O runtime Pixi é **o componente real inicial**, mas é mantido como protótipo isolado enquanto ocorre a paridade de pixels.

PixiJS foi instalado pelo usuário na máquina local, mas **o pacote ainda não está registrado no `package.json`/`package-lock.json` versionados** nesta primeira fatia; os testes de contrato usam uma porta tipada, sem baixar dependências de GPU na CI. Antes de integrar o runtime ao bundle de produção, será necessário versionar os manifests npm com o lock sincronizado para garantir que `npm ci` funcione.

## Ganho imediato no editor legado

`TransitionRenderer` usa agora `fromPose === toPose` em qualquer transição só facial, mesmo quando `from` e `to` são estados diferentes da timeline. O cache persistente prepara corpo/roupas/cabelo **uma vez para a aparência autoral inicial e, se necessária, uma segunda vez para a aparência autoral final**. A interpolação facial, pupilas/máscaras e efeitos continuam renderizadas em cada frame com a aparência intermediária. Antes, a simples mudança de preset acionava até 14 preparações do corpo inteiro. O cache inclui versão `character.updatedAt` para evitar reutilizar arte antiga após edições.

Transições com **mudança real de pose** continuam usando o compositor canônico 2D até a paridade com GPU. Não alterar exportação sem o oráculo visual.

## Validação

- `tests/video-studio-pixi-pose-rig.test.cjs`: 14 atualizações de pose com apenas dois sprites e duas texturas, ordenação, visibilidade, identidade, descarte, rotações e mudanças de imagem.
- `tests/video-studio-next-gacha-prepared-renderer.test.cjs`: cache de pose/roupa/cabelo em preset facial, preservação de bases de face legadas, versão do personagem, render dinâmico.
- `npm run bench:video:pixi-rig` **somente em PC com PixiJS instalado e GPU WebGL2**: comparação visual Canvas/GPU sobre arte sintética em diferentes progressos, estatística de sprites/texturas, medição indicativa. Não usa arquivos do usuário.
- Gates de CI: `npm run test:video:next`, `npm run typecheck`, `npm run build` em Windows/Ubuntu; testes de exportação sintética.
- Medir FPS e paridade em personagens reais no Windows, incluindo múltiplos personagens, traços PT, olhos normais, mascara/oclusão, cabelo/roupa; VRAM/memória, diferenças de pixel por frame, perda de contexto GPU e fallback.

## Próximas fatias

1. Versionar Pixi em manifests npm com `package-lock.json` sincronizado.
2. Criar camada GPU de roupas/cabelo/pele, face e máscaras; manter mesmo recorte, tamanho, ordem de camadas e textura.
3. Introduzir modo experimental de preview com A/B, fallback para Canvas em contexto ausente/perdido; nunca mudar o visual silenciosamente.
4. Extrair camada de render para Worker/OffscreenCanvas e depois supervisor Electron.
5. Usar avaliação de frame compartilhada entre preview e export para provar paridade temporal.

**Não declarar ganho numérico antes de medir** num computador real.

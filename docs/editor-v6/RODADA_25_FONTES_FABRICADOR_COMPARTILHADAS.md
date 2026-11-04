# Rodada 25 — Fontes Fabricador compartilhadas na primeira exportação

**Data:** 04/11/2026 · **Branch:** Dev-V2 · **Objetivo:** reduzir IPC do Fabricador ao preparar os materiais de cabelo de múltiplas poses do mesmo personagem.

## Alteração

Antes a fase de cabelo chamava `resolveSavedCharacterSource` separadamente para cada grupo `personagem + pose`. Cada resolução buscava novamente o modelo-base no Fabricador, inclusive quando diversos grupos usavam o mesmo `modelSlot`.

Agora `createEditorV6HairSourceBatch` coalesce dentro de **uma única exportação**:
- Leitura do modelo bruto por `modelSlot`.
- Leitura da pose bruta por `modelSlot + poseSlot`.
- Requisições paralelas aguardam a mesma Promise. Falhas não ficam presas no batch.
- Cada personagem ainda passa por `resolveSavedCharacterSource` **individualmente**, com suas proporções, contornos de pele, torso, gênero, corpo e geometria. Não é permitido reutilizar geometria final de outro personagem.
- `poseSlot=null` continua usando o modelo-base, sem consulta de pose. `poseSlot=undefined` mantém a semântica do resolvedor original.
- O batch e suas referências são descartados ainda durante a preparação; nenhuma fonte é guardada entre exportações.

## Validação

Teste `hairSourceBatch.test.ts` verifica múltiplas poses, múltiplos personagens, base-modelo, outra slot, requests concorrentes, falhas e nova exportação. A CI Windows valida TypeScript, suíte Editor V6 e MP4 offscreen com comparação visual sintética.

**Não atribuir ganho de tempo sem benchmark real no PC Windows 11/AMD**, projeto 300 frames e Preset 2 válido numa cópia isolada. O foco é reduzir chamadas redundantes de IPC, sem alterar quadro, pixel, FPS ou encoder.

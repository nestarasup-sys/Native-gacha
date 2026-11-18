# Auditoria técnica — Native Gacha / Editor V6 / branch `Dev-V2`

**Data da análise:** 2026-11-05  
**Repositório:** https://github.com/nestarasup-sys/Native-gacha/tree/Dev-V2  
**Commit examinado:** `448e9dc76082279d7f02d6f47416e9f22b25312b`  
**Natureza:** revisão estática de código, contratos, testes e documentação via GitHub. **Não foram executados build, Electron, testes locais, importação real nem renderização. Nenhum arquivo do repositório foi alterado.**

## 1. Decisão arquitetural

Recomendo **não reutilizar diretamente o JSON V13.1** no Editor V6 e **não instruir a IA a inventar os PNGs/IDs do projeto**. Construir uma interface de importação em duas fases:

1. A IA gera um **JSON de intenções de react**, versionado, portátil e enxuto. Ele contém texto literal, IDs/referências quando conhecidos, tempos e decisões dramáticas, poses e orientação desejada.
2. **O Editor V6 compila** esse plano para `EditorV6Document`: resolve personagens e mídia cadastrados, gera snapshots faciais/corporais através do renderizador real, converte tempos para 30 fps, valida com Zod, apresenta uma prévia e grava como projeto novo pela persistência existente.

Como fonte complementar, criar mais tarde uma ação **“Enviar roteiro ao Editor V6”** no módulo Roteiros. Esse módulo já armazena `RoteiroDocument` com IDs de personagens/vídeos e informações de cena.

## 2. Mapa do aplicativo, confirmado no código

- **Stack:** Electron + React/TypeScript + Vite; store Zustand/Immer; Zod para validação; FFmpeg/FFprobe para vídeo.
- **Domínios independentes:** Fabricador gera recursos e presets; Customizador mantém os personagens; Roteiros/Base de Vídeos organiza mídia e fala; Editor V6 mantém timeline e snapshots de cenas.
- **UI V6:** `src/renderer/src/features/editorV6/EditorV6Page.tsx` compõe biblioteca de projetos e editor. Página da biblioteca tem “Criar” e cartões; editor possui Narrador, Fala, Pensamento, Selecionar vídeo, Importar áudio, Exportar MP4 etc. **Não há botão de importação de projeto JSON V6** na UI inspecionada.
- **Contrato nativo:** `src/shared/editorV6.ts`, `src/shared/editorV6Schema.ts`.
- **Timeline/resolução:** `src/shared/editorV6TimelineCore.ts`, `src/shared/editorV6TimelineScene.ts`, `src/shared/editorV6TimelineEdits.ts`.
- **TALK/BLINK:** `src/shared/editorV6FaceSchedule.ts`.
- **Presets:** `src/renderer/src/features/editorV6/EditorV6PresetPanel.tsx`, `src/renderer/src/characters/sceneFaceActions.ts`.
- **Snapshots:** `src/renderer/src/features/editorV6/faceModeAssets.ts`, `useEditorV6FacePreview.ts`, `characterSnapshotRefresh.ts`, `src/renderer/src/characters/editorV6CharacterRenderer.ts`.
- **Armazenamento:** `electron/domains/editorV6/documentPersistence.ts`, `paths.ts`.
- **IPC de projeto:** `electron/domains/editorV6/primaryIpc.ts`, `fileIpc.ts`, `src/shared/editorV6IpcChannels.ts`, `electron/preload.ts`.
- **Mídia:** `src/renderer/src/features/editorV6/editorV6MediaCommands.ts`, `electron/domains/editorV6/exportIpc.ts` (vínculo com Base de Vídeos), `src/shared/editorV6VideoComposition.ts`.
- **Roteiros:** `src/shared/roteiros.ts`, `src/renderer/src/features/baseVideos/baseVideosAiImport.ts` e `BaseVideosPage.tsx`.

## 3. Contrato V6 e divergências do V13.1

| Tema | Editor V4 / V13.1 | Native Gacha V6 (`Dev-V2`) | Conversão necessária |
|---|---|---|---|
| Versão raiz | `schema_version: 3` | `schemaVersion: 1` | Não copiar raiz; compilar novo documento |
| Conteúdo | `timeline[]` com `type` | `timeline.tracks[]` e `elements[]` | Elementos + blocos por trilha |
| Personagem persistente | `character_tracks` | track `character` com `blocks[].state` | Estados completos por beat |
| Tempo | segundos em `start`/`at`; visual em frames | `startFrame`, `durationFrames` inteiros, fps=30 | `ceil(t×30)` em beats causais |
| Posição | pixels 1920×1080 | x/y/tamanho em **% relativos ao centro** | converter e testar visualmente |
| Mídia | path `assets/tiktoks/NN.mp4` | `mediaId` UUID e `libraryVideoId` opcional | mapear Base de Vídeos ou importar arquivo real |
| Fundo | path `assets/backgrounds/...` | `backgroundAssetId` que aponta para imagem real em `assets` | mapear/importar fundo |
| Expressão | nomes como `surpresa` | preset com ID de catálogo + snapshots faciais | resolver preset existente e renderizar |
| PT | `pt confusa` | `activeExpressionGaze: 'left'|'right'` | direção espacial + recomposição facial |
| Pose | `POSE 1/2/3` | `poseSlot: number|null` cadastrado no Fabricador | slot real, sem assumir três |
| TALK | `use_talk: true` em `dialogue` | fala em track `speech` dispara TALK pelo `characterId` | criar fala ligada + snapshots compatíveis |
| Pensamento | `thought` | track `thought` (sem TALK automático) | criar elemento ligado ao pensador |
| Reações coletivas | fronteiras de 5+ personagens | fronteiras correspondentes em tracks `character` | uma atualização de estado por personagem pertinente |
| Comments pós-MP4 | cauda permitida | comment vinculado a vídeo não pode exceder `parent` | desanexar diálogo quando durar além do vídeo ou evoluir o contrato |
| Intro/card/loading | tipos V4 próprios | sem equivalentes tipados diretos no contrato V6 | composição de narrador/fundo ou implementação específica; não prometer GIF nativo |

**Schema real:** `EditorV6Document` inclui `schemaVersion:1`, UUIDv4, nome, datas, campos de fundo, `assets[]`, `media[]?`, `elements[]`, `timeline:{fps:30,durationFrames,tracks[],knownElementIds?}`. As trilhas são `video/speech/thought/character/object/audio`, com blocos `{id, elementId?, label, startFrame, durationFrames, state?, background?, characterId?, mediaId?, mediaInFrame?, mediaLayout?, parentBlockId?, relativeStartFrame?}`. A validação Zod usa IDs UUIDv4, 30 fps, limites de 200 faixas, 1.000 elementos, 5.000 imagens, 500 mídias e até 1.000 blocos por faixa. Fonte: `src/shared/editorV6Schema.ts`.

## 4. Como a atuação realmente funciona

### 4.1 Visual persistente

`normalizeEditorV6Timeline` ajusta cada bloco da faixa de personagem para persistir até o próximo início. `editorV6ClipAtFrame` usa o último bloco do personagem para resolver o estado. O beat de reação é, portanto, **novo bloco na trilha `character`**, com `state` completo, e não o `character_tracks` externo do V13.1.

### 4.2 TALK/BLINK

`editorV6FaceSchedule.ts` calcula os intervalos de fala lendo exclusivamente as faixas `speech` não ocultas e não silenciadas, com `characterId` válido. Durante esses intervalos, o rosto seleciona `talk` ou `talk-blink` se existem `faceModeAssetIds` correspondentes. Pensamentos não ativam fala. A propriedade `use_talk` do V13.1 **não é um campo necessário no documento V6**. A geração de imagens de fala deve usar `faceModeAssets.ts`/renderizador existente, não inventar um arquivo PNG.

### 4.3 PT

O botão `pt` do painel de expressões seleciona `activeExpressionGaze:'left'` para o preset correspondente; o normal é `'right'`. A lógica que aplica o preset carrega seu conteúdo no Fabricador e gera transformações faciais. Importador deve preservar a emoção, trocar somente a orientação quando apropriado e refazer snapshots. **PT não é string mágica de expressão**. A direção `left` é pupila para esquerda, não rotação física de corpo. Implementar cuidado com posições e targets reais na sala.

### 4.4 Troca de pose

`poseSlot` indexa as poses reais persistidas do Fabricador. Um ciclo de 15 s em que só uma pessoa muda pose continua viável, mas exige inventário de slots por personagem e geração de snapshots corretos para cada estado. Seleção aleatória deve ter **semente determinística** no JSON de intenções para reproduzir o mesmo projeto em nova importação.

### 4.5 Movimento automático de 250 ms e causalidade

`docs/editor-v6/ANIMACOES.md` descreve transições de pose/expressão preparadas nos 250 ms **anteriores** ao próximo bloco, quando habilitadas. Para o pico de reação causado por um instante exato no vídeo, esse movimento pode antecipar informação visual. Soluções: `motionEnabled:false` para fronteiras de surpresa causal, ou mover a conclusão da transição para `gatilho + 250 ms`, conforme direção criativa; nunca antecipar o sentimento antes de ser mostrado.

## 5. Três incompatibilidades impeditivas de um importador ingênuo

1. **Identificadores e imagens.** `EditorV6Element.kind='character'` exige `characterId` de Customizador e `assetId` de imagem real cadastrada. `editorV6DocumentSchema` valida referências cruzadas. Nome isolado, `POSE 2`, `sorrindo` ou path V4 não satisfazem o contrato.
2. **Manifesto de disco não é JSON portátil.** `documentPersistence.ts` grava `editorV6.json` separado das imagens, em `assets/backgrounds|characters|objects/<uuid>.png`; ao ler, hidrata `dataUrl` e valida a existência de mídia local. Importar somente o manifesto interno de outra máquina, sem os assets, falhará.
3. **Cauda de comentários.** Validação e normalização impõem que comentários com `parentBlockId` caibam no bloco de vídeo. Reações pós-clipe devem existir como `speech` ou `thought` **sem parent**, com `startFrame` absoluto e duração integral, para manter a regra criativa da V13.1. Não prolongar artificialmente o vídeo além do `sourceFrames`.

**Outro cuidado:** o fluxo Roteiros/Base de Vídeos pode tratar `durationFrames` do catálogo usando 60 quadros por segundo no reconhecimento, enquanto o Editor V6 é fixo em 30 fps. Converter por segundos (ou revalidar via FFprobe), **não copiar número de frames entre sistemas**.

## 6. O que já existe e pode ser reaproveitado

### 6.1 Importador de roteiro por IA — já existe, mas em outro módulo

O arquivo `src/renderer/src/features/baseVideos/baseVideosAiImport.ts` implementa `NYMI_IMPORTABLE_SCRIPT_V1`, com `validateAiImport` e `createRoteiroFromAiImport`. `BaseVideosPage.tsx` tem o botão “↑ Importar roteiro da IA” (filtro `.json`), preview/validação e criação de Roteiro. Esse importador usa `videoId` e `characterId` da biblioteca real; guarda abertura, falas e pensamentos, mas **não gera timeline V6 com atuação, poses e PT**. Portanto, o botão pedido para V6 é trabalho novo; ele não deve duplicar literalmente todo o parser nem alterar o formato existente sem versionamento.

### 6.2 Dados estruturados de Roteiros

`RoteiroDocument` já traz `characterIds`, fundo opcional, abertura, TikToks com vídeos vinculados por ID, descrições, `sceneEndSeconds`, 1ª/2ª reações e falas/pensamentos com `textPortuguese` e `startAt?`. Uma ação “Enviar ao Editor V6” eliminaria redigitação e permitiria conhecer o elenco e os clipes antes de construir atuação.

### 6.3 Vincular vídeos sem cópia

`linkEditorV6LibraryVideo(projectId,libraryVideoId)` já foi implementado em `electron/domains/editorV6/exportIpc.ts`, e o front já usa o comando na seleção da Base de Vídeos. O projeto referencia a mídia existente pelo UUID e o protocolo `gacha-editor-media://library/...` resolve a fonte. **Não duplicar 20 MP4s** se já estiverem cadastrados e disponíveis.

### 6.4 Preview/exportação

`SceneSurface` renderiza a cena em SVG; FFmpeg e capturas têm integração; as bibliotecas de snapshots faciais e histórico do V6 já existem. Reusar os mesmos algoritmos de renderização evita prévia diferente da exportação.

## 7. Solução recomendada: formato de intercâmbio `NYMI_EDITOR_V6_REACT_V1`

**Nome e estrutura abaixo são proposta de implementação, NÃO formato já aceito pela branch.**

```json
{
  "format": "NYMI_EDITOR_V6_REACT_V1",
  "title": "Reação ao futuro de FYN",
  "fps": 30,
  "scene": { "backgroundLibraryId": "UUID-LOCAL-SE-DISPONIVEL", "stageLayout": [] },
  "cast": [
    { "ref": "dante", "characterId": "UUID-REAL-DO-CUSTOMIZADOR", "name": "Dante Valença", "side": "left" }
  ],
  "videos": [
    { "ref": "tt01", "libraryVideoId": "UUID-REAL-DA-BASE", "startSeconds": 16.0, "sceneEndSeconds": 7.0 }
  ],
  "utterances": [
    { "id": "s001", "videoRef": "tt01", "speakerRef": "dante", "kind": "thought", "startSeconds": 23.0, "durationSeconds": 3.6, "text": "Exemplo apenas." }
  ],
  "acting": [
    { "atSeconds": 20.45, "characterRef": "dante", "expression": "surpresa", "gaze": "front", "posePreference": 2, "motion": "cut" }
  ],
  "poseRandomSeed": "reacao-fyn-001"
}
```

**Regras contratuais do formato proposto:** texto sempre literal (sem reescrita/tradução automática); `startSeconds` definido de maneira inequívoca (absoluto ou relativo com atributo explícito); IDs de mídia/personagem resolvidos durante prévia; percentuais e snapshots calculados pelo app; erros em referência não convertidos silenciosamente para outros personagens; `acting` avalia TODOS nos picos e segunda reação desacelera; `scene_end` inicia primeira fala/pensamento; transições causais não surgem antes do beat; pose de um personagem a cada 15 s e abertura variada conforme inventário; saída deve estar validada no schema nativo depois de renderizar.

Pode-se usar um JSON sem IDs conhecidos acompanhado de um **mapa de vinculação** na interface. Se os IDs forem fornecidos pelo módulo Roteiros, dispensar remapeamento por nome.

## 8. Arquivos para modificar, em ordem

1. **Contratos de intercâmbio**: adicionar `src/shared/editorV6Import.ts` e `src/shared/editorV6ImportSchema.ts` com formatos versionados e funções de auditoria. Não trocar `schemaVersion:1` do documento nativo.
2. **Conversão pura**: adicionar módulo `src/shared/editorV6ImportPlan.ts` ou `src/renderer/src/features/editorV6/import/compilePlan.ts` para tempo, mapeamento de beats, comentários e verificação de limites. Evitar importar páginas React em `shared`.
3. **Resolver recursos e montar snapshots**: serviço próprio `src/renderer/src/features/editorV6/import/` que usa APIs de Customizador/Fabricador e compositor V6 existente. Separar planejamento dos renderizados; limitar concorrência e deduplicar imagens por estado.
4. **IPC de seleção segura de JSON**: adicionar método em `src/shared/editorV6.ts` `EditorV6DesktopApi`, canal em `src/shared/editorV6IpcChannels.ts`, bridge em `electron/preload.ts`, handler em `electron/domains/editorV6/fileIpc.ts` ou módulo de importação dedicado registrado por `electron/main.ts` (origem validada, tamanho limitado, sem path arbitrário pelo renderer). É possível usar `<input type=file>` para leitura JSON no renderer, mas handlers do app já seguem a fronteira Electron.
5. **UI**: botão **“Importar JSON”** na biblioteca em `EditorV6Page.tsx` ao lado de “Criar” e um modal de prévia. Extrair módulo/hook para evitar ampliar a página; mostrar elenco, vídeos, contagens, duração, mapeamentos, ausências e avisos antes do commit.
6. **Persistência**: gravar como novo projeto usando `saveEditorV6Project()` depois de validar o documento hidratado; aproveitar publicação transacional. Importações de mídia/recursos em lote precisam de rollback caso falhem e não podem sobrescrever projeto existente por padrão.
7. **Ação Roteiros → V6** (segunda fase): criar um adaptador de `RoteiroDocument` para o mesmo plano de intercâmbio, usando IDs que já estão armazenados.
8. **V14**: derivar V13.1, preservar todas as regras criativas e substituir os contratos V3/V4 por formato de intercâmbio versionado, com anexo do mapeamento nativo V6.

## 9. Fluxo UX sugerido

Biblioteca Editor V6: **[Criar] [Importar JSON]** → selecionar `.json` → verificar formato (`NYMI_EDITOR_V6_REACT_V1`, `NYMI_IMPORTABLE_SCRIPT_V1`, V13 legado ou manifesto nativo) → validar texto/contagens/referências → vincular personagens e vídeos ausentes → **prévia não destrutiva** → “Criar projeto importado” → renderizar os assets necessários → validar `editorV6DocumentSchema.safeParse` → salvar transacionalmente → abrir na timeline.

Se o usuário importar o arquivo V13 antigo, oferecer **“Conversão legado experimental”**, com diagnóstico daquilo que não pode ser convertido automaticamente. Não prometer equivalência plena de cards, loading GIF ou intro sem implementar tais recursos.

## 10. Critérios de aceite e testes

- **Fidelidade textual:** todos os textos de fala e pensamento iguais à origem, por comparação de strings; sem `.trim()` que mude texto autoral silenciosamente (a importação AI existente faz `trim`, então reavaliar em novo formato).
- **Contagem:** 20 vídeos, elenco, 69 ou mais textos de fixture, duração e ordem preservados; não inventar refs faltantes.
- **Timing:** `scene_end` no primeiro frame >= marca, sem 0,6s extra; sem TALK em `thought`; 1ª reação no auge, 2ª na descompressão; comments fora da duração do vídeo mantidos, mas sem `parentBlockId`.
- **Atuação:** faixa por personagem, sem gaps de estado, PT entra/sai por audiência real, sem ouvintes reagindo a pensamentos; emoção preservada na volta do PT.
- **Poses:** escolha diversificada na abertura, um ator por intervalo de 15 s, pose disponível, sequência reproduzível com seed.
- **Assets:** todo `assetId` aponta para snapshot real; `faceModeAssetIds` verificáveis; cada preset/pose existe; cada mídia existe e cabe em `sourceFrames`.
- **Causalidade:** transição animada não prenuncia gatilho; exportação corresponde à prévia nos frames limítrofes.
- **Segurança:** arquivos JSON grandes/invalidos não são executados; caminhos arbitrários e travessia bloqueados; importação em projeto novo; sem perda em falha.
- **Teste ida-e-volta:** importar → salvar → fechar → reabrir → comparar timeline/textos/assets → exportar clipe de teste.
- **Regressões:** `tests/editor-v6/editorV6Timeline.test.ts`, `tests/base-videos-ai-import.test.mjs`, testes novos de conversor/media/PT/cauda, `npm run typecheck`, `npm run audit:architecture`, testes e build no Windows/Electron quando disponíveis.

## 11. Limitações da análise

Esta auditoria verificou o **código estático da branch Dev-V2** e os contratos da área envolvida. Não foi feita inspeção manual dos 1.331 itens do Git nem execução completa; portanto “análise completa” significa **cobertura ponta a ponta do fluxo pedido**: UI → estado/tipos → timeline → personagens/poses/expressões/TALK → mídia → IPC → persistência → renderização/exportação → testes. Não foi feita validação de um projeto real no Windows nem benchmark da máquina do usuário. O status combinado do commit consultado retornou `statuses:[]`, o que **não prova CI aprovado ou reprovado**.

## 12. Fontes diretas

- [Editor V6 Page](https://github.com/nestarasup-sys/Native-gacha/blob/Dev-V2/src/renderer/src/features/editorV6/EditorV6Page.tsx)
- [Modelos V6](https://github.com/nestarasup-sys/Native-gacha/blob/Dev-V2/src/shared/editorV6.ts)
- [Schema Zod](https://github.com/nestarasup-sys/Native-gacha/blob/Dev-V2/src/shared/editorV6Schema.ts)
- [Timeline Core](https://github.com/nestarasup-sys/Native-gacha/blob/Dev-V2/src/shared/editorV6TimelineCore.ts)
- [Face Schedule](https://github.com/nestarasup-sys/Native-gacha/blob/Dev-V2/src/shared/editorV6FaceSchedule.ts)
- [Presets](https://github.com/nestarasup-sys/Native-gacha/blob/Dev-V2/src/renderer/src/features/editorV6/EditorV6PresetPanel.tsx)
- [Face actions](https://github.com/nestarasup-sys/Native-gacha/blob/Dev-V2/src/renderer/src/characters/sceneFaceActions.ts)
- [Persistência V6](https://github.com/nestarasup-sys/Native-gacha/blob/Dev-V2/electron/domains/editorV6/documentPersistence.ts)
- [Importação IA já existente em Base de Vídeos](https://github.com/nestarasup-sys/Native-gacha/blob/Dev-V2/src/renderer/src/features/baseVideos/baseVideosAiImport.ts)
- [Botão AI já existente em Base de Vídeos](https://github.com/nestarasup-sys/Native-gacha/blob/Dev-V2/src/renderer/src/features/baseVideos/BaseVideosPage.tsx)
- [Roteiros](https://github.com/nestarasup-sys/Native-gacha/blob/Dev-V2/src/shared/roteiros.ts)
- [Vincular mídias](https://github.com/nestarasup-sys/Native-gacha/blob/Dev-V2/electron/domains/editorV6/exportIpc.ts)
- [Guia de animações V6](https://github.com/nestarasup-sys/Native-gacha/blob/Dev-V2/docs/editor-v6/ANIMACOES.md)
- [Regras internas de mudanças](https://github.com/nestarasup-sys/Native-gacha/blob/Dev-V2/AGENTS.md)
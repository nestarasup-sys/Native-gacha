# Pesquisa 01 — Arquitetura geral e integrações do Native Gacha

**Status:** **PESQUISADA NO CÓDIGO / VERIFICAÇÃO DE RUNTIME PENDENTE**  
**Data:** 06/11/2026 · **Repositório:** `nestarasup-sys/Native-gacha` · **Base:** `Dev-V2@c636ff03c80274eabed7892dc9d5fa0e8ad025c5`.  
**Escopo:** arquitetura real de UI, processos, contratos, propriedade de dados e consumidores em Fabricador, Customizador, Studio, Editor V6, Roteiros, Base de Vídeos, bibliotecas, armazenamento, renderização e exportação.

> **Como ler:** [CÓDIGO] é inspeção estática no commit indicado; [FONTE OFICIAL] é documentação da tecnologia; [RELATO] é observação do usuário; [HIPÓTESE] é proposta; [A CONFIRMAR] exige runtime/inspeção adicional. Nenhum tempo de exportação foi medido por esta pesquisa.

## 1. Perguntas que esta rodada precisa responder

1. Quem possui o dado visual, quem salva a instância, quem projeta a cena e quem prepara pixels?
2. Onde o caminho UI → estado → preload/IPC → domínio → persistência/consumidor passa de um módulo a outro?
3. Quais recursos são snapshots de projeto e quais são referências de biblioteca vivas?
4. Como um personagem produzido no Fabricador chega à timeline e ao MP4 do V6?
5. Onde Chromium/Canvas/WebGL realmente entra, onde termina e como o FFmpeg recebe pixels?
6. Qual arquitetura preserva segurança, integridade e qualidade enquanto tentamos acelerar o exportador?

## 2. Método e representatividade

**[CÓDIGO]** A API GitHub da branch retornou árvore recursiva **não truncada** com **1.311 arquivos**. A leitura aprofundada dirigiu-se aos pontos de entrada, contratos, arquivos de domínio, fontes de personagem, preview e exportador, e foi complementada pela auditoria publicada em `docs/editor-v6/PESQUISA_CHROMIUM_REFACTOR_EDITOR_V6_2026-11-06.md`. **Não** se afirma leitura manual de cada um dos 1.311 arquivos. Sem checkout da máquina, não foi possível verificar `git status` local ou perfis dos projetos do usuário.

| Área | Quantidade de arquivos da árvore | Uso metodológico |
|---|---:|---|
| `src/` | 575 | UI React, contratos e personagens |
| `electron/` | 175 | Main, preload, IPC, repositórios e worker/export |
| `tests/` | 341 | Gates e cenários existentes |
| `docs/` | 117 | Histórico e baselines antes desta rodada |
| `scripts/` | 81 | Diagnósticos e benchmarks |
| `src/renderer/src/features/fabricator/` | 213 | Produção visual |
| `src/renderer/src/features/customizer/` | 62 | Instâncias e aparências |
| `src/renderer/src/features/editorV6/` | 80 | Editor V6 |
| `src/renderer/src/features/studio/` | 21 | Cena Studio |
| `src/renderer/src/features/baseVideos/` | 15 | Base de vídeos |
| `src/renderer/src/features/roteiros/` | 10 | Roteiros |

Essas contagens descrevem **tamanho estrutural**, não qualidade, complexidade ou calor do código.

### Código de referência para reprodução desta análise

Os caminhos abaixo são relativos à raiz do repositório. Leitores devem revisar o commit real antes de reusar conclusões.

- `AGENTS.md` e `package.json`: limites de ownership, pacotes e scripts.
- `electron/main.ts`: composição dos serviços e inicialização.
- `electron/preload.ts`, `electron/editorV6ExportPreload.ts`, `electron/editorV6MotionPreload.ts`: bridges de confiança separadas.
- `src/renderer/src/ui/App.tsx`, `src/shared/applicationRoutes.ts`: páginas e rotas.
- `electron/domains/fabricator/`, `customizer/`, `studio/`, `editorV6/`, `roteiros/`, `baseVideos/`, `mediaLibrary/`: domínios.
- `src/renderer/src/characters/`: resolução e composição compartilhada.
- `src/shared/editorV6.ts`, `editorV6TimelineScene.ts`, `editorV6Schema.ts`: documento, cena e validação.
- `src/renderer/src/features/editorV6/`: página, timeline, preview e exportações.
- `electron/dataPlatform.cjs`, `domainFileSystem.cjs`, `electron/domains/storage/`: persistência e controle de referências.
- `electron/domains/editorV6/exportRunner.ts`, `exportWorkers.ts`: fluxo de frames e FFmpeg.

## 3. Stack real e topologia de execução

### 3.1 Tecnologias declaradas

**[CÓDIGO — package.json]** Electron `^45.1.0`; React e React DOM `^19.2.0`; React Router `^8.4.0`; Zustand `^5.0.16`; Immer `^11.2.9`; Zod `^4.6.7`; better-sqlite3 `^13.0.3`; Sharp `^0.35.5`. Build: electron-vite, Vite, electron-builder, esbuild, TypeScript e Vitest.

**Limitação:** os ranges do package.json não confirmam a versão efetiva dos executáveis no Windows. Chromium é embutido no Electron; FFmpeg é disponibilizado separadamente pela distribuição da aplicação. Investigar `process.versions` e `ffmpeg -version` no EXE empacotado, não inferir pelo range npm.

### 3.2 Organização dos processos

```text
Native Gacha (Windows)
|
+-- Electron Main: electron/main.ts
|    +-- serviços de domínio + validação
|    +-- SQLite/CAS/JSON, arquivos, protocolos de mídia
|    +-- register*Handlers, origens confiáveis, filas de gravação
|    +-- jobs e subprocessos FFmpeg / ffprobe
|
+-- Janela interativa React (Chromium)
|    +-- src/renderer/src/ui/mountApp.tsx → App.tsx/HashRouter
|    +-- Fabricador / Customizador / Studio / V6 / Roteiros / Biblioteca
|    +-- window.desktop via preload.ts/contextBridge
|
+-- Renderizador de movimento (BrowserWindow oculta)
|    +-- editorV6MotionPreload.ts
|    +-- carrega fonte/poses/catálogos por IPC
|    +-- Canvas e atlas das transições
|
+-- Renderizador de exportação (BrowserWindow offscreen)
     +-- editorV6ExportPreload.ts
     +-- exportWorker.tsx: cena em frame absoluto
     +-- SVG/Canvas/WebGL → capturePage bitmap
     +-- Buffer BGRA → FFmpeg → MP4
```

**[CÓDIGO]** `electron.vite.config.ts` define entradas de Main, três preloads e HTML independente `editor-v6-export.html`; `src/renderer/src/main.tsx` ainda possui entradas específicas para bake/stress. A janela de UI não é o worker de exportação. `electron/application/mainWindow.ts` e `electron/domains/editorV6/exportWorkers.ts` usam `contextIsolation:true`, `nodeIntegration:false` e `sandbox:true`.

**[FONTE OFICIAL]** [Electron Process Model](https://www.electronjs.org/docs/latest/tutorial/process-model) distingue main/renderer/preload e IPC; [Electron Security](https://www.electronjs.org/docs/latest/tutorial/security) recomenda isolamento, validação do sender, CSP, controle de navegação e permissões. A presença de flags **não comprova** a segurança de cada handler; isso precisa de análise própria.

### 3.3 Entrada da UI e rotas

**[CÓDIGO]** `src/renderer/src/ui/App.tsx` usa imports lazy e React Router. `src/shared/applicationRoutes.ts` declara as rotas:
- `/customizar`, `/estudio`, `/editor-v6`, `/editor-v6/library`;
- `/editor-v7` (código coexistente, sem presumir paridade do V6);
- `/roteiros`, `/base-videos`, `/logs-dev`, `/fabricador-dev`;
- `/opcoes` é rota legada redirecionada para Logs DEV.

`src/renderer/src/ui/mountApp.tsx` instancia StrictMode e HashRouter. **[A CONFIRMAR]** fluxo de entrada de cada página até todas as operações e listeners, porque a leitura nesta rodada priorizou as fronteiras críticas do V6.

## 4. Propriedade dos dados entre módulos

### 4.1 Contrato de ownership

**[CÓDIGO — AGENTS.md]** Fabricador = catálogo-fonte; Customizador = instâncias e personalizações; Studio = documento/cena; Editor V6 = projeto/timeline. Serviços devem usar IDs/contratos estáveis e definir quando o vínculo é vivo, snapshot ou híbrido.

| Proprietário | Fonte/serviço verificado | Forma de dado | Consumidores/risco |
|---|---|---|---|
| Fabricador | `modelSource.ts`, `modelCatalog.ts`, `posePersistence.ts`, `hairStorage.ts`, `wardrobePersistence.ts`, `faceStorage.ts` | Modelo/pose e imagens em catálogos e manifests versionados | Customizador, Studio, V6, bake |
| Customizador | `repository.ts`, `service.ts`, `src/shared/customizer.ts` | Personagem salvo em biblioteca JSON, referências e aparência | Renderizadores de personagem, Studio/V6 |
| Studio | `documentPersistence.ts`, `primaryIpc.ts` | `studio.json` + imagens de cena/snapshots | Edição de cena e integrações |
| V6 | `documentPersistence.ts`, `editorV6.ts` | `editorV6.json`, assets, timeline, mídia | Preview, exportador, índices de referência |
| Biblioteca de vídeo | `videoLibraryStore.ts`, `mediaFileResponse.ts` | Catálogo JSON, arquivos e IDs | Base de Vídeos, V6, Roteiros |
| Roteiros | `roteiros/repository.ts` e `service.ts` | SQLite e referências de biblioteca | Planejamento, exportação e links |
| Base de Vídeos | `baseVideos/repository.ts` e `service.ts` | SQLite, categorias e IDs de vídeo | Biblioteca de vídeo |
| Infra | `dataPlatform.cjs`, `domainFileSystem.cjs`, `storage/*` | SQLite, CAS e arquivos com transação | Todos |

**Cuidado:** a existência de `studio.json` e `editorV6.json` demonstra projetos com manifestos próprios; **não** permite concluir que todo campo de aparência é sempre snapshot, ou que mudanças no Fabricador sejam automaticamente propagadas. Esse contrato é tópico de pesquisa mais aprofundada.

### 4.2 Fabricador — fonte original do personagem

**[CÓDIGO]** `electron/domains/fabricator/modelSource.ts` publica slot validado com journal e backup; `modelCatalog.ts` lê fontes canônicas e respeita compatibilidade; `posePersistence.ts` salva poses/rascunhos e imagens; `wardrobePersistence.ts` e `hairStorage.ts` mantêm conjuntos de roupas e cabelo, identificadores e assets; `faceStorage.ts` e catálogos de face atendem expressões.

**Ponto de arquitetura:** se um personagem usa cabelo posterior e rosto numa pose, a origem pode depender de vários manifestos/arquivos de domínio. Transformar todo personagem em um PNG sem guardar a identidade dessas fontes gera risco de cache visual antigo.

**Investigação pendente:** saber a granularidade de revisão e invalidação de cada asset (modelo, pose, roupa, máscara, face, cabelos, head shape e tint); verificar alteração de fonte enquanto V6 está aberto.

### 4.3 Customizador — instância do personagem e integridade de referências

**[CÓDIGO]** `electron/domains/customizer/repository.ts` lê e escreve `customizer/characters/characters.json`, com fila e protocolo compatível `*.tmp`/backup; `service.ts` valida personagens e pode verificar referências de roupa, estilos de cabelo, faces e poses, coordenando alteração de referência.

**[CÓDIGO]** `src/renderer/src/characters/characterSourceResolver.ts` decide modelo/pose e impede emparelhar cached source de outro slot. `editorV6CharacterRenderer.ts` resolve fontes, paleta, camadas e roupas. Essa região é uma dependência real do exportador.

**Implicação:** não criar cache apenas por `character.id`. O fingerprint precisa refletir ao menos o conjunto de fontes visuais que efetivamente influenciam o quadro. Critérios e custo de hashing devem ser medidos, e snapshots legítimos não podem ser substituídos silenciosamente.

### 4.4 Studio — outro consumidor do renderer compartilhado

**[CÓDIGO]** `electron/domains/studio/documentPersistence.ts` publica `studio.json` e assets. `primaryIpc.ts` valida origem do renderer e coordena referências de poses antes das gravações. `src/renderer/src/characters/sceneCharacterProjection.ts` é uma função compartilhada por recursos de cena, e distingue IDs de personagem e assinatura de seleção de expressões.

**Risco:** mudanças no compositor de rosto, cabelo, roupa, alpha ou escala usadas pelo V6 podem alterar resultados do Studio ou Customizador. Toda refatoração em `src/renderer/src/characters/` deve testar consumidores cruzados.

### 4.5 Roteiros, Base de Vídeos e bibliotecas

**[CÓDIGO]** `electron/domains/roteiros/service.ts` usa repository SQLite, fila de gravação e funções que recolhem referências de vídeo/fundo/GIF; valida novas referências antes de salvar. `baseVideos/service.ts` usa `better-sqlite3`, categorias, metadados e coordena exclusão/publicação de vídeos com checagens de referência. `mediaLibrary/videoLibraryStore.ts` administra catálogo de mídia, arquivos, hashes e operações pendentes.

**[CÓDIGO]** `mediaLibrary/mediaFileResponse.ts` implementa stream, `HEAD` e `Range` HTTP 206. O protocolo `gacha-editor-media` no domínio V6 autoriza mídias por IDs e manifesta paths; é a fronteira que deixa `<video>`/`<audio>` acessar a biblioteca com seek. A produção de MP4 usa os caminhos resolvidos no Main/FFmpeg, **não depende da decodificação HTML** para todo conteúdo.

**Consequência:** é incorreto propor copiar todas as mídias para o documento V6 ou trocar o protocolo por `file://` sem entender referências, custos e segurança. Não remover checks de exclusão para simplificar performance.

## 5. Fluxo completo e concreto do V6

### 5.1 Modelo e timeline

**[CÓDIGO]** `src/shared/editorV6.ts` declara `EditorV6Document`, assets, mídia, elementos, tracks (personagem, fala, pensamento, objeto, vídeo, áudio) e valores padrão. `src/shared/editorV6TimelineScene.ts` oferece `resolveEditorV6SceneAtFrame(document, frame)` e resolução de fundo; `editorV6Schema.ts` valida contratos. `EditorV6Page.tsx` coordena a tela e ações.

`EditorV6Timeline.tsx` possui `TimelineRows` memoizado, janela horizontal visível e cálculo de transições. `useEditorV6Playback.ts` usa relógio lógico com `requestAnimationFrame` e subscrição externa. Portanto, **não** presumir que toda a árvore React re-renderiza em cada tick por causa do relógio; o código já tenta impedir isso.

### 5.2 Preview e apresentação

**[CÓDIGO]** `EditorV6PlaybackScene.tsx` resolve a cena por frame, prepara patches faciais quando necessário e passa resultado para `SceneSurface.tsx`. Esta renderiza SVG e tem camada HTML de vídeo; também possui `ExportRasterCanvas` e `foreignObject` para assets rasterizados no caminho de export.

Separação arquitetural desejável (sem prometer ganho):

```text
EditorV6Document → TimelineIndex → ResolvedScene(frame)
                               ├── PreviewPresenter: input/seek/DOM/HTML video
                               └── ExportPresenter: frame absoluto, pixels, encoder
```

Os dois consumidores precisam de semântica única (pose, boca, rosto, fundo, layer order), mas podem ter backends diferentes **apenas se a paridade for demonstrada**.

### 5.3 Persistência do V6

**[CÓDIGO]** `useEditorV6DocumentPersistence.ts` coordena salvamento da UI/flush; `electron/preload.ts` chama `createEditorV6Invoker`, que usa canais de `src/shared/editorV6IpcChannels.ts`; `electron/domains/editorV6/primaryIpc.ts` valida sender e coordena gravação; `documentPersistence.ts` normaliza timeline, valida schema e chama `assetTransaction.ts` para publicar assets/manifestos; caminho de projeto vem de `electron/domains/editorV6/paths.ts` como `studios/Editor V6/editorV6-{id}`.

**[CÓDIGO]** `useEditorV6CharacterSources.ts` observa atualização do Customizador, foco/visibilidade e revisões de catálogos para identificar fontes visuais alteradas. Logo, uma proposta de cache persistente não pode se limitar a `updatedAt` genérico: precisa respeitar as identidades específicas já modeladas.

### 5.4 Exportação completa

**[CÓDIGO]** O botão `EditorV6ExportPanel.tsx` define perfil padrão `1920×1080`, `turbo:true`, `forceTurbo1080:true`, `encoder:'cpu'`, `mouthLoop:true` e `hairPoseReactionOnly:true`, `hairPosteriorOnly:true`. O caminho chama `runEditorV6ExportCommand` e pode executar `prepareEditorV6HairMotionBundle` **antes** do job principal.

```text
EditorV6ExportPanel.tsx
  → editorV6ExportCommands.ts (snapshot/opções/preparo cabelo)
  → window.desktop.editorV6.startEditorV6Export
  → electron/preload.ts / editorV6IpcChannels
  → electron/domains/editorV6/exportIpc.ts
  → exportRunner.ts
       + carrega personagens
       + prepareMotions.ts / motionIpc.ts (bakes)
       + prepara mouthLoop por partes quando necessário
       + exportWorkers.ts (BrowserWindow oculta/offscreen)
            → exportWorker.tsx desenha SceneSurface por quadro
            → webContents.capturePage + token de pintura
            → bitmap Buffer BGRA
       + FFmpeg H.264 (rawvideo por stdin), overlay e áudio conforme cena
       + concat e validação por ffprobe
       + publicação MP4 + relatório
```

**[CÓDIGO]** `exportRunner.ts` mede fases, compõe partes e verifica MP4. `exportWorkers.ts` usa `capturePage` e token de pintura para evitar stale frame. Se o export contém vídeo sobreposto, o caminho pode renderizar fundo e foreground separadamente antes de filtrar vídeo. O tempo relevante para usuário é **clique→MP4 validado**, e não apenas `exportRunner.report.milliseconds` quando há hair prep anterior.

### 5.5 Cabelo posterior — integração não isolada

**[RELATO]** O usuário comparou o mesmo vídeo de 10 segundos: cerca de **50s com cabelo animado** versus **9s com cabelo estático** (redução aproximada de 82%). O relatório bruto A/B não foi recuperado nesta rodada.

**[CÓDIGO]** `src/shared/hairMotionEngine.ts` tem `HAIR_MOTION_SIMULATION_HZ=120` e `HAIR_MOTION_OUTPUT_FPS=30` para a simulação genérica; no perfil de reação de pose há ``sampleHairMotionPoseReaction``, reação analítica de aproximadamente **29 quadros ativos** após transição. **Isto não é vídeo intermediário de 120 FPS.**

**[CÓDIGO]** `editorV6HairMotionPreparation.ts` usa ``prepareSavedCharacterRenderer`` para original e sem cabelo, com material/face/crop, antes do export. `exportWorker.tsx` contém ``composeHairFrame`` e passa raster de cabelo ao compositor, enquanto `exportHairMeshRenderer.ts` calcula a malha. A rota pode envolver WebGL→Canvas2D→SVG/`foreignObject`→`capturePage`.

**[CÓDIGO]** `motion/hairBakeBatch.ts` dispensa bakes adicionais sem cabelo quando `hairPoseReactionOnly=true`. Portanto **não** se deve alegar que um segundo bake de transições completas seja a causa obrigatória dos 41s nesse perfil.

**[HIPÓTESE]** O custo excessivo pode surgir da preparação duplicada e/ou composição integral de personagem em muitos frames, mesmo com cabelo parado. A hipótese mais prática é separar texturas de corpo/face e a **camada RGBA posterior**, renderizando só reação/crop com oclusão correta. Um vídeo transparente completo é uma forma possível de sidecar, mas codec/decodificação não eliminam o custo de gerar os frames no primeiro export; primeiro testar overlay/canvas/ROI.

## 6. Persistência e integridade: o que é realmente heterogêneo

**[CÓDIGO]** `electron/dataPlatform.cjs` cria `database/catalog.sqlite`, registra domínios, objetos e referências. `electron/domains/storage/catalogSchema.cjs` define `CATALOG_SCHEMA_VERSION=18`, `journal_mode=WAL` e `synchronous=FULL`. `contentAddressedStore.cjs` guarda objetos em `media/objects/sha256`; `domainFileSystem.cjs` externaliza imagens e conserva arquivos lógicos sob domínios. `keyedOperationQueue.ts` serializa operações por chave. `pendingPersistenceIpc.ts` executa flush renderer antes do Main.

**[FONTE OFICIAL]** [SQLite WAL](https://www.sqlite.org/wal.html): leitores concorrentes e um escritor, com checkpoints e durabilidade que não devem ser alterados por uma otimização gráfica sem causalidade medida.

**Implicações:**
- Não tudo é SQLite; há catálogo, arquivos, CAS, manifolds JSON, snapshots e caminhos físicos.
- Não mudar IDs, hashes ou revisão de asset de forma isolada; Studio/V6/Roteiros/Base de Vídeos podem guardar referências a esses recursos.
- Migração sem recuperação e rollback é risco de perda de trabalho.
- Um cache de pixels derivado de fonte é diferente do dado persistido canônico do usuário.

## 7. O que já está bom e deve ser preservado

1. Prévia e timeline possuem RAF/clock e virtualização; não eliminá-los para fazer refatoração cosmética.
2. A UI usa preload restrito, e os workers de export/motion têm bridges próprias; não expor Node/SQLite ao renderer.
3. Salvamentos possuem fila, transações de assets, recuperação e validação.
4. Bibliotecas de mídia usam Range e referências, evitando necessidade de copiar tudo para cada projeto.
5. Exportação mede fases, valida H.264/frames e emendas; preservar os gates.
6. O modo padrão de cabelo já elimina alguns bakes de transição redundantes.
7. A camada `src/shared` oferece funções puras de cena/timeline e contratos usados por mais de uma parte do app.

## 8. O que está incompleto ou é dívida de investigação

| Pergunta | Evidência atual | Lacuna / consequência |
|---|---|---|
| O que consome os 41s a mais do cabelo? | [RELATO] 50→9 e funções do prep | Falta A/B com relatórios de fases e builds iguais |
| Quando snapshots do V6 ficam stale? | useEditorV6CharacterSources e revisões | Falta matriz completa de alterações de modelo/pose/roupa/face |
| Material de personagem é preparado mais de uma vez? | normal/sem cabelo no hair prep | Falta contagem em job real por recurso e cache |
| Chromium ou PNG/base64 é gargalo? | SVG/Canvas/WebGL/capturePage em cadeia | Falta tracing detalhado GPU/CPU/readback |
| FFmpeg CPU é relevante no total? | rawvideo BGRA → libopenh264 | Falta medição do encode isolado sob mesma entrada |
| Qual é a versão executada do Chromium? | Range electron no package.json | Falta `process.versions.chrome` do EXE Windows |
| A/B no projeto real está automatizado? | benchmark script tem título de outro fixture | Precisa harness multi-projeto seguro sem remover proteção |
| A alteração no character renderer altera Studio? | Consumidores compartilhados | Falta golden RGBA cruzado, preview e export |

## 9. Protocolo executável da próxima rodada

### A. Leitura técnica segura — sem perfil de usuário

```powershell
git branch --show-current
git log -1 --format="%H %s"
git status --short
rg -n "prepareSavedCharacterRenderer|composeHairFrame|capturePage|resolveEditorV6SceneAtFrame" src electron
rg -n "editorV6CharacterSourceRevision|timelineSnapshot|libraryVideoId|assetTransaction" src electron
rg -n "register.*Handlers|assertTrustedSender|contextBridge" electron
```

### B. Gates estáticos e regressão (somente em ambiente habilitado)

```powershell
npm run typecheck
npm run audit:architecture
npm run build
npm run test:editor-v6:quick
npm run test:editor-v6:hair-motion
npm run test:editor-v6:export
npm run test:character-flow
npm run test:geometry
npm run test:roteiros
npm run test:base-videos
```

**[NÃO EXECUTADO]** Comandos acima são plano de teste e podem depender de Windows/build. Não afirmar que passaram. Antes de utilizar qualquer script, confirmar existência e efeito em `package.json`.

### C. A/B capilar real (só com cópia autorizada)

Seguir `experimentos/EXP-001-CABELO-ON-OFF.md`. Mesmo snapshot e condições para ON/OFF, 300 frames a 30 FPS, resolução e encoder iguais, 3 corridas por condição, total desde clique. Registrar preparo de cabelo, motion bake, raster, capture, FFmpeg, validação e cache. Se nenhuma diferença persistir após controle do ambiente, reclassificar a hipótese; se persistir, atribuir ao estágio medido. Não interpretar soma de duas lanes paralelas como total do usuário.

## 10. Fontes oficiais e data de consulta

| Fonte primária | URL | Uso nesta rodada |
|---|---|---|
| Electron — Process Model | https://www.electronjs.org/docs/latest/tutorial/process-model | Main, preload, renderer, IPC |
| Electron — Security | https://www.electronjs.org/docs/latest/tutorial/security | Sender, sandbox, contextIsolation, CSP |
| Electron — Offscreen Rendering | https://www.electronjs.org/docs/latest/tutorial/offscreen-rendering | Bitmap CPU/shared GPU texture; não prometer ativação |
| Chromium — RenderingNG architecture | https://developer.chrome.com/docs/chromium/renderingng-architecture | Estágios e invalidação; API interna NÃO disponível ao app |
| SQLite — Write-Ahead Logging | https://www.sqlite.org/wal.html | Limites de concorrência/durabilidade |
| FFmpeg — Documentation | https://ffmpeg.org/documentation.html | Base para pesquisa 11; suporte real do binário pendente |

**Consulta:** 06/11/2026. Fontes "latest" não provam API presente no build instalado. **Sem** pesquisa linha a linha do Chromium/FFmpeg upstream — essa é investigação por interface pública, invariantes e integração com o app.

## 11. Conclusões e decisões desta primeira pesquisa

**[CÓDIGO]** O Editor V6 não é uma unidade isolada: o fluxo de pixels depende do Fabricador, Customizador e renderer compartilhado, os documentos dependem do Main/IPC/persistência e as mídias dependem de bibliotecas e protocolos. Consequentemente, qualquer reestruturação deve ter **contratos de compatibilidade entre módulos**.

**[HIPÓTESE PRIORITÁRIA]** Atacar o caminho de cabelo, porque o A/B relatado revelou a maior diferença de tempo observada, antes de reescrever Chromium/FFmpeg. O experimento precisa separar preparo, composição, capturas e encode; não supor que o simulador 120Hz seja culpado.

**[DECISÃO DE PROCESSO]** Pesquisas 02–16 aprofundarão tecnologias/domínios com evidência específica. Spikes são isolados e não substituem produção até benchmark, paridade de pixels, verificação de dados e ADR aprovada.

**[A CONFIRMAR]** Versões runtime Windows, matching de todas as referências/snapshots, perf real, consumo de VRAM/CPU, compatibilidade do backend alternativo e métricas do `editor v6 06`.

## 12. Próximos estudos conectados

- [02 Chromium/RenderingNG](02-CHROMIUM-BLINK-VIZ-SKIA.md): provar se estágios de raster/capture são gargalo.
- [06 Fabricador](06-FABRICADOR-MODELOS-POSES-ROUPAS.md) e [07 Customizador](07-CUSTOMIZADOR-PERSONAGENS-E-REUSO.md): revisão/ownership de pixels.
- [10 Cabelo, face e boca](10-ANIMACAO-CABELO-FACE-BOCA.md): A/B ON/OFF, ROI e reação por evento.
- [11 FFmpeg e áudio](11-EXPORTADOR-FFMPEG-CODECS-AUDIO.md): saída e sincronia.
- [13 Persistência](13-PERSISTENCIA-SQLITE-CAS-CACHE.md): integridade/compatibilidade.

**Registro:** o que foi lido é real; o que falta medir segue explicitamente pendente.

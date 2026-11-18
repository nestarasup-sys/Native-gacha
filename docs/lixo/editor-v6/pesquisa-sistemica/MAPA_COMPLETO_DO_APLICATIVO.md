# Mapa completo do aplicativo — fronteiras, produtores e consumidores

**Status:** mapa inicial derivado da Pesquisa 01 em `Dev-V2` / `c636ff03`; **não** representa inspeção semântica exaustiva das 1.311 implementações.

## Fluxo por processo

```text
Electron main (electron/main.ts)
  ├─ Serviços, repositórios, validação, dados, sistema de arquivos
  ├─ IPC de Fabricador / Customizador / Studio / Roteiros / bibliotecas / V6
  ├─ Criação de janelas de trabalho (UI e renderizadores ocultos)
  └─ Jobs de exportação / processos FFmpeg + ffprobe
       │
       ├─ preload.ts / window.desktop (APIs permitidas)
       │      └─ React HashRouter → páginas de recursos
       │
       ├─ editorV6MotionPreload.ts → BrowserWindow de bake
       │      └─ carregar catálogo → renderizar poses → atlas
       │
       └─ editorV6ExportPreload.ts → BrowserWindow export
              └─ resolver cena → SVG/Canvas/WebGL → captura BGRA
                      └─ FFmpeg → partes H.264 → MP4 final
```

## Responsabilidades dos domínios

| Área | Proprietário / entrada de dados | Consumidores e acoplamentos importantes | Fonte concreta |
|---|---|---|---|
| Fabricador | Origem de modelos, poses, articulações, peças, roupas, cabelo e face | Customizador, Studio e V6 por fontes/catálogos | `electron/domains/fabricator/`, `src/shared/fabricator.ts` |
| Customizador | Personagens com escolha de modelo, proporções, roupas, face e referências de cabelo | Renderizadores compartilhados, Studio, V6 e fluxos de Roteiros | `electron/domains/customizer/service.ts`, `repository.ts` |
| Camada compartilhada de personagens | Resolve fontes e desenha roupas, pele, olhos, boca, face, cabelo | Customizador, Studio, V6, bake de movimento | `src/renderer/src/characters/` |
| Studio | Documento de cena, assets/snapshots, cast e atualizações | Editor V6 compartilha conceitos e renderizadores; validar todos os consumidores | `electron/domains/studio/` e `src/shared/studio.ts` |
| Editor V6 | Documento/timeline, snapshots, prévia, mídia, movimentos, exportação | Fabricador, Customizador, bibliotecas, Electron/FFmpeg | `src/shared/editorV6.ts`, `electron/domains/editorV6/` |
| Bibliotecas compartilhadas | Vídeo, áudio, fundo, objeto e referências por ID | V6, Roteiros e Base de Vídeos | `electron/domains/mediaLibrary/`, `electron/domains/editorV6/mediaLibrary.ts` |
| Roteiros | Documentos, vínculos de personagens, cenas/referências de vídeo e assets | Biblioteca, Customizador/fluxos de exportação de personagens | `electron/domains/roteiros/service.ts` |
| Base de Vídeos | Metadados de mídia, categorias, publicação | Usa biblioteca compartilhada e fila de escrita relacionada a Roteiros | `electron/domains/baseVideos/service.ts` |
| Persistência | SQLite, DomainFileSystem/CAS, arquivos JSON e transações | Todos os produtores/consumidores | `electron/dataPlatform.cjs`, `electron/domains/storage/` |
| Opções e Logs DEV | Backup, migrações, manutenção e diagnóstico | Segurança de dados, mensurabilidade, ciclo de vida | `electron/domains/storage/*Ipc.ts` |
| Editor V7 | Contratos e exportação separados | Coexistência de rotas e IPC; integração exata a pesquisar | `src/shared/editorV7.ts`, `electron/domains/editorV7/` |

## Sequências críticas

### Personagem e revisão visual

```text
Fabricador/modelSource + poses/wardrobe/hair/face
     → catálogos, versões, referências verificadas
Customizador (personagem + aparência + IDs)
     → characterSourceResolver
     → editorV6CharacterRenderer / preparedCharacterMaterials
     ├─ prévia / snapshots de pose / cast do V6
     ├─ bakeMotion (atlas)
     └─ hairMotionPreparation (partes/camada posterior)
          → exportWorker + SceneSurface → captura → FFmpeg
```

Toda otimização de material deve responder: a referência é **viva**, **snapshot**, ou mista? O que invalida a textura após pose, cor, cabelo, roupa, olhos e fonte mudarem? Ver `useEditorV6CharacterSources.ts`, `editorV6CharacterSourceModel.ts` e `editorV6CharacterSourceEvents.ts`.

### Salvamento do V6

```text
UI → useEditorV6DocumentPersistence
   → window.desktop.editorV6.saveEditorV6Project
   → preload / createEditorV6Invoker
   → primaryIpc (origem/validação/fila)
   → documentPersistence (normalização e refs)
   → assetTransaction (manifesto + assets)
   → editorV6.json e arquivos do projeto
```

Não migrar para outro backend sem verificar snapshots, recuperação e leitores existentes.

### Importação de mídia / preview / export

```text
Biblioteca de mídia
   → catálogo + ID + autorização de referência
   → protocolo gacha-editor-media + mediaFileResponse com HTTP Range
   ├─ <video>/<audio> no Chromium para prévia
   └─ caminho físico validado para FFmpeg na exportação
```

Duas rotas de decodificação e sincronização; refatorar preview não garante paridade com export. `mediaFileResponse.ts` responde HEAD, Range 206 e stream.

### Exportação

```text
ExportPanel → exportCommands → preparação de cabelo (pré-job)
   → exportIpc → exportRunner
      ├─ getCharacters
      ├─ prepareExportMotions / motionIpc / cache
      ├─ prepareExportMouthLoops (conforme fala/segmentos)
      ├─ exportWorkers (BrowserWindow offscreen + capturePage)
      ├─ FFmpeg H.264 / filtros vídeo / áudio
      └─ ffprobe / validação de partes, junção, publicação
```

O tempo do botão até MP4 validado deve incluir a preparação do cabelo **anterior** ao início do job Main.

## Pontos de corte arquiteturais candidatos

1. Resolução pura de cena / índice de timeline separados da apresentação.
2. Identidade estável e versionada de recursos de personagem; camadas preparadas por fonte.
3. Composição RGBA do cabelo posterior por evento, sem recompor corpo/face à toa.
4. Ponte controlada frame→buffer→encoder com frameId/ordem e fluxo limitado.
5. Repositórios/persistência continuam nos donos do dado; renderização não escreve no banco.

**[HIPÓTESE]** Esses cortes podem reduzir duplicidade. **Não há evidência ainda** de que transformá-los em módulos por si só melhore o tempo medido.

## Inspeção dinâmica pendente

- Medir custo de IPC ao carregar catálogo/poses/roupa/cabelo para motion workers.
- Identificar referências vivas vs snapshots nos casos reais de Studio, V6 e Roteiros.
- Verificar integridade de referências quando fonte muda durante projeto aberto.
- Separar tempo prep cabelo, bake movimento, raster, captura, escrita FFmpeg e validação com mesma fixture.
- Fazer mapa de importadores/chamadores com `rg` **no checkout local**, além do mapeamento estático remoto deste estudo.

Detalhamento completo e arquivo por arquivo: [Pesquisa 01](pesquisas/01-ARQUITETURA-GERAL-E-INTEGRACOES.md).

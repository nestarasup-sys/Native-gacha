# Editor V7 — pesquisa, arquitetura e execução

**Estado:** export V7 inicial comprovado; evolução do editor segue em aberto — 05/11/2026
**Responsável técnico:** Codex  
**Relação com o V6:** iniciativa paralela. O V7 não substitui, migra nem altera projetos V6 até haver compatibilidade e critérios de aceitação demonstrados.

## Missão

Projetar e construir uma nova área de edição audiovisual com um núcleo previsível, renderização substituível e exportação mensurável. A tecnologia será escolhida por experimento e compatibilidade real com o aplicativo, não por novidade. O resultado deverá manter qualidade de imagem, animação consistente, áudio sincronizado, recuperação segura e formatos interoperáveis.

Este é o documento vivo de pesquisa e engenharia do V7. Registrar aqui hipóteses, fontes, decisões, experimentos, resultados e commits. Diferenciar sempre fatos observados, hipóteses e decisões provisórias. Não declarar desempenho ou qualidade sem evidência reproduzível.

## Restrições do projeto

- O V6 permanece funcional e dono dos documentos e exports existentes enquanto o V7 amadurece.
- Preservar IDs, referências de personagem, mídia, poses e assets; vínculo com as áreas Fabricador, Customizador e Studio deve ser explícito e não duplicar catálogos.
- Nenhum teste funcional de exportação pode usar outro projeto que não **“Teste de Importação — Personagens do Pacote”**. Usar fixtures sintéticas para testes de domínio, parser e renderer sempre que possível.
- Não modificar ou limpar dados reais para experimento; manter backups verificáveis quando um teste exigir gravação.
- Não reduzir resolução, FPS, duração, precisão temporal ou qualidade para melhorar benchmark.
- V7 deve ter gates pequenos e rápidos de desenvolvimento, além de validação final em 20 s, 40 s e timeline inteira no projeto autorizado. Repetições não são padrão para cada iteração: repetir somente em gates de estabilidade e resultado final.
- Commits locais pequenos após validações pertinentes; sem push/publicação.

## Descoberta concluída nesta sessão

### Mapa inicial do V6

- A rota de interface está registrada em `src/shared/applicationRoutes.ts`; `src/renderer/src/ui/App.tsx` carrega a página V6 por importação lazy.
- O documento e contratos compartilhados ficam em `src/shared/editorV6.ts` e módulos `src/shared/editorV6*`.
- A resolução de cena por frame já está separada em `src/shared/editorV6TimelineScene.ts` e é consumida tanto pela reprodução quanto pelo worker de exportação. Isso é uma base útil a estudar, embora o formato e as dependências do V6 não devam ser copiados sem análise.
- Exportação é coordenada em `electron/domains/editorV6/exportRunner.ts`; workers Electron são criados em `exportWorkers.ts`. O renderer executa `renderEditorV6ExportFrame` por `executeJavaScript`, captura `paint` offscreen e envia quadros ao pipeline FFmpeg.
- Há custos e contratos em várias fronteiras: processo principal, `WebContents` isolada, IPC, captura bitmap/readback, composição de camadas, codificação e mux. A investigação do V7 deverá medir cada fronteira separadamente.

### Hipóteses de tecnologia — ainda não aprovadas para produção

1. **Núcleo em TypeScript puro:** documento versionado, tempo em ticks inteiros, operações e resolução determinística de cena sem Electron, React, DOM ou filesystem. Isso facilita testes, undo, migração e renderers alternativos.
2. **Renderer escolhido para o primeiro corte: Sharp/libvips no processo principal:** já é dependência do app, rasteriza um SVG canônico sem janela de captura e evita round-trip de renderer por frame. WebGPU fica como candidato de comparação posterior, não dependência da primeira exportação.
3. **Exportador do primeiro corte: FFmpeg por stdin raw RGBA:** seleciona encoder H.264 por capability probe, transmite um frame por vez com backpressure e valida contagem, tamanho, taxa e codec via ffprobe. WebCodecs continua como hipótese alternativa para benchmark posterior, sem bloquear export.
4. **Composição sem captura/readback de Chromium:** o primeiro backend entrega diretamente um buffer RGBA do libvips ao encoder. Textura compartilhada offscreen do Electron segue fora do caminho crítico e é experimental; não será adotada sem benchmark que prove benefício líquido.
5. **UI independente do backend:** timeline e comandos operam sobre contratos do domínio. Preview e export devem compartilhar a mesma avaliação de cena e a mesma semântica de frame.

## Pesquisa técnica inicial

| Opção | Vantagem potencial | Limite/risco | Experimento necessário |
|---|---|---|---|
| Canvas 2D | Simples, previsível e boa compatibilidade | Precisa de runtime browser e readback no caminho de export | comparar draw calls, transferência e fidelidade |
| WebGL2 | Amplo suporte e caminho conhecido | Estado implícito, custo de CPU e complexidade de batching | benchmark de composição vs libvips |
| WebGPU | API moderna, compute e pipelines explícitos | suporte depende de runtime/driver; recuperação e compatibilidade ainda precisam ser validadas | spike só se libvips ou CPU aparecer como gargalo mensurável |
| Sharp/libvips (corte atual) | Nativo no processo principal; API já instalada; entrada/saída de bytes e raster SVG | CPU; SVG complexo e composição de muitos assets podem dominar | medir tempo de render por frame, perfis de cenas e fidelidade no V7 real |
| `VideoEncoder` / WebCodecs | Encoder configurável em worker e potencial aceleração por hardware | não define container MP4; codecs disponíveis variam por dispositivo | medir `isConfigSupported`, saída, timestamp e mux com trilha de áudio |
| FFmpeg | Formatos e mux maduros; mantém caminho conhecido de áudio/vídeo | processo/cópias e disponibilidade de encoder hardware | usar como baseline e comparar entrada por pipe/memória |
| Electron offscreen/shared texture | integração direta com Chromium e potencial para compartilhar GPU | shared texture experimental; recursos limitados e liberação obrigatória | spike isolado com contagem de cópias, perdas e ciclo de vida |

### Fontes primárias consultadas

- [Electron `webContents` — offscreen paint e shared texture](https://www.electronjs.org/docs/latest/api/web-contents): textura compartilhada pode reduzir cópias GPU→CPU; a API é experimental, exige liberar a textura rapidamente e limita a quantidade simultânea.
- [Electron — Offscreen Rendering](https://www.electronjs.org/docs/latest/tutorial/offscreen-rendering): descreve o modo GPU/bitmap, software output e custo do readback. O modo GPU via bitmap não é automaticamente mais rápido.
- [Electron — `OffscreenSharedTexture`](https://www.electronjs.org/docs/latest/api/structures/offscreen-shared-texture): formato, dimensões, metadados e ciclo de vida de `release()`.
- [WebCodecs API (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API): disponível em Dedicated Workers e fornece encoder/decoder de baixo nível; suporte de codecs depende da plataforma.
- [WebCodecs — processamento de vídeo (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API/Video_processing_concepts): WebCodecs não faz demux/mux de container; saída MP4 precisa de muxer adicional ou FFmpeg.
- [Documentação FFmpeg](https://ffmpeg.org/documentation.html): referência de codecs, filtros, muxers e ferramentas para o baseline.

**Nota de atualização:** APIs de runtime, suporte de GPU e codecs variam com a versão instalada e hardware. Antes de cada decisão de implementação, registrar versão Electron/Chromium, SO, GPU/driver e resultado da feature detection local. A consulta web não substitui isso.

## Proposta inicial de arquitetura

```text
Interface (timeline, inspector, preview)
                 │ comandos/consultas de domínio
                 ▼
Editor V7 Core (documento versionado, tempo inteiro, reducer/undo, scene evaluator)
             ┌───┴─────────┐
             ▼             ▼
       Preview backend   Export pipeline
       WebGPU/WebGL      renderer worker → encoder → mux/áudio → validação
             └── contratos de assets por ID ──┘
```

Diretrizes para o desenho, sujeitas à investigação:

- **Tempo:** ticks inteiros com taxa explícita; nada de acumular `deltaTime` de relógio de parede para determinar o frame exportado. Conversões para segundos só nas bordas.
- **Documento:** schema com versão, migração explícita e conteúdo referenciado por IDs; salvar atomicamente e tolerar cancelamento/recuperação.
- **Cena:** avaliar qualquer frame diretamente a partir do documento + frame. Reproduzir e exportar o mesmo frame deve resultar no mesmo estado visual.
- **Animação secundária:** estado inicial e eventos com identidade/ordenação explícitas; amostragem determinística por frame e sem reinício provocado por ciclo de vida do renderer.
- **Render backend:** interface estreita para carregar assets, renderizar um frame e liberar recursos. Não expor handles WebGPU/Electron ao core ou ao documento.
- **Exportação:** pipeline limitado por memória, filas com backpressure, timestamps derivados do tick, cancelamento e relatório de fase. Separar render, readback/transfer, encode, mux e validação.
- **Qualidade:** golden frames, testes de continuidade, cobertura de eventos, SSIM/diferença e inspeção de movimento; especificar tolerância antes de aceitar backend alternativo.
- **Observabilidade:** benchmark acompanha máquina/runtime, cache frio/quente, tamanho da cena, duração, taxa, resolução, medianas e percentis; comparação A/B usa o mesmo conteúdo autorizado.

## Critérios de aceitação do V7

1. Abrir, editar, salvar, fechar e reabrir um documento V7 sem perda de mídia, IDs, ordem, estado ou referências.
2. Preview e export do mesmo índice de frame são visualmente equivalentes dentro da tolerância definida.
3. Export determinístico: mesmo documento, backend e configuração geram timestamps, contagem de frames e movimento reproduzíveis.
4. Áudio e vídeo validados com `ffprobe`, sem drift e com cancelamento/erro recuperável.
5. Animação de cabelo não reinicia ao trocar frame, estado da UI ou lote do worker; continuidade e reação cobertas por testes e amostras visuais.
6. Sem regressão de qualidade; explicar diferenças entre encoder/backend e manter caminho de fallback suportado.
7. Gates curtos durante desenvolvimento e exportações autorizadas de 20 s, 40 s e timeline completa antes de considerar migração.
8. Demonstrar resultado frente ao V6 usando o mesmo projeto autorizado, máquina e configuração; tempo total e fases reportados sem excluir preparo/finalização silenciosamente.

## Plano de execução vivo

| ID | Estado | Trabalho | Saída / gate |
|---|---|---|---|
| V7-001 | concluído | Criar espaço de documentação e mapear fronteiras V6 | Este documento; mapa inicial com evidência de código |
| V7-002 | próximo | Inventariar modelo de documento, tempo, comandos, undo e assets de V6; separar contratos reutilizáveis dos legados | Matriz de propriedade e proposta de schema V7 |
| V7-003 | pendente | Registrar runtime local (Electron/Chromium, GPU, encoders) e construir capability probe isolado | Relatório JSON reprodutível, sem exportar projeto real |
| V7-004 | concluído | Criar contrato puro V7, schema v1, conversão frame/tick e avaliador absoluto da cena | `src/shared/editorV7.ts`; 5 testes determinísticos |
| V7-005 | concluído (primeira fatia) | Implementar compositor nativo por SVG/libvips + stream FFmpeg com backpressure e validação ffprobe | Export real 1080p H.264 do projeto autorizado; sem `WebContents` ou IPC por frame |
| V7-006 | parcial | Escolher renderer/encoder inicial; áudio e comparação WebGPU/WebCodecs continuam pendentes | H.264 AMF passou capability probe; MP4 validado por ffprobe; sem trilha de áudio nesta versão |
| V7-007 | parcial | Integrar rota, preview SVG, camadas, keyframes de transformação e painel de exportação V7 | `/editor-v7` compõe/exporta; salvar/reabrir projetos e importar timeline ainda pendentes |
| V7-008 | em andamento | Ampliar importação do documento V6 autorizado, movimento e mídia; medir duração e qualidade em vídeo | Primeiro gate real de 1 s passou; próximos gates: 20 s, 40 s, timeline completa |

**Próxima ação concreta:** converter o documento inteiro (timeline, mídia e estados visuais) do projeto autorizado em camadas/keyframes V7, incluir composição de fala/áudio e então repetir os gates de 20 s, 40 s e timeline integral. O export atual é uma cena estática derivada do estado inicial do projeto e não demonstra ainda continuidade de cabelo.

## Registro de alterações e evidências

### 05/11/2026 — início

- Confirmado repositório `Dev-V2`, HEAD `d143a2001d412544a66a6e285fd58ad0749413f1`; sem alterações locais antes deste arquivo.
- Mapeados rota lazy, módulos compartilhados, avaliador de cena, coordenação de export e worker offscreen do V6.
- Consultadas documentações primárias do Electron, WebCodecs e FFmpeg; registrado que shared texture é experimental e WebCodecs não muxa MP4.
- Nenhum código de produto, projeto de usuário, dado ou exportação foi alterado nesta etapa.
- Verificação executada: leitura do estado do Git e inspeção estática dos contratos/caminhos citados. Testes de produto não se aplicam a esta primeira nota documental.
- Commit documental criado: `3d33f594` (`docs(editor-v7): start architecture research notebook`).

### 05/11/2026 — núcleo e primeira fatia de exportação

- Criado `src/shared/editorV7.ts`: schema versionado, assets validados, intervalos half-open, frame-rate racional e resolução absoluta por tick. Nenhuma API de UI, Electron ou filesystem foi importada pelo núcleo.
- Adicionado `tests/editor-v7/core.test.mjs` e comando `npm run test:editor-v7:core`.
- Criada cena SVG canônica em `src/shared/editorV7Svg.ts`; preview e compositor consomem a mesma resolução absoluta e composição de layers.
- Criado backend de rasterização com Sharp/libvips e runner que faz capability probe H.264, envia RGBA diretamente ao stdin do FFmpeg com backpressure e valida todos os frames/resolução/FPS/codec usando ffprobe.
- Integrada rota `/editor-v7`, navegação, contrato de preload/IPC com validação do remetente, cancelamento, progresso, destino via diálogo e participação no encerramento seguro do aplicativo.
- Adicionados keyframes de transformação interpolados por tick no core e controles para adicionar/editar keyframes no V7.
- Resultado: 7/7 testes do core; 2/2 testes do renderer; `npm run typecheck`, `npm run build`, `npm run audit:architecture` e teste de modelo de rotas (2/2) passaram. O audit examinou 705 arquivos sem violações.
- Export V7 real do projeto autorizado, via `npm run export:editor-v7:authorized`: backup com `verified=true` e 285 hashes de arquivo verificados; cena de 4 imagens/4 assets; 30/30 frames; 1920×1080 a 30 FPS; H.264 AMF; `ffprobe` validou codec, dimensões, taxa e contagem.
- Primeira versão de rasterizador SVG por quadro (data URL inline) levou 5,34 s ponta a ponta para 30 frames. A implementação otimizada decodifica/pré-rasteriza overlays, mantém cache LRU de até 96 MiB e transmite só o recorte visível das camadas; a última execução fechou em 2,31 s ponta a ponta (1,90 s no runner), 57% abaixo da primeira amostra. Render: 1,50 s; backpressure FFmpeg: 208 ms. Essa execução coincidiu com o build e teve disputa de CPU; tempos incluem início do encoder, mas não seleção humana do destino. Não extrapolar para o projeto completo.
- O primeiro MP4 foi inspecionado visualmente: personagens e fundo aparecem sem distorção evidente. Essa inspeção não substitui comparação SSIM com o V6 nem valida animação/cabelo.
- Saída verificada com H.264 High, BT.709 e `video_track_timescale=30000`: `out/editor-v7-stress/runs/2026-11-05T11-43-14-136Z-10152/authorized-project-v7.mp4`; SHA-256 `0e75a64604ba0a16499de88e6e7d62dd26cc4f1033dd38e75e10aec7c54ce5bf`; 322.076 bytes. O relatório `authorized-project-v7-report.json` acompanha encoder, hashes, fases, frames e bytes.
- Limitações conhecidas: essa conversão inicial carrega as quatro imagens da cena base e repete o quadro por 1 s; não importa ainda timeline, cabelo, texto/falas, áudio ou vídeo. A interface permite importar imagens, posicionar/tamanho/rotação/opacidade, criar keyframes e exportar MP4; ainda não salva documentos entre sessões.
- A primeira fatia de export está comprovada; V7 não está pronto para substituir V6 e a evolução continua.
- Verificações finais desta fatia: 7 testes de core, 2 de renderer, 2 de rotas; `npm run typecheck`, `npm run audit:architecture` e `npm run build` passaram. Export autorizado final validado por `ffprobe`; inspeção visual do frame exportado confirmou a composição de quatro personagens e fundo.
- Commit da implementação e da primeira exportação: `ed3fed15` (`feat(editor-v7): export MP4 through libvips pipeline`).

### 05/11/2026 — correção de inicialização do preload

- Ao investigar a tela em branco, o renderer mostrou `window.desktop` indefinido e a primeira exceção ocorreu em `CustomizerPage` ao acessar `window.desktop.customizer`.
- Causa confirmada no bundle: `electron/preload.ts` importava `editorV7IpcChannels` do módulo `editorV7.ts`, que também importa `zod`; o build externalizava isso como `require("zod")`. Preload sandboxed do Electron não pode carregar essa dependência externa, então falhava antes de chamar `contextBridge.exposeInMainWorld`.
- Os nomes de canal foram extraídos para `src/shared/editorV7IpcChannels.ts`, sem dependências runtime; o preload importa os canais desse módulo e os tipos do core como type-only.
- Verificação: `npm run build` passou; o bundle `out/preload/preload.cjs` já não contém `require("zod")` e conserva os cinco canais V7. `npm run typecheck` passou. `npm run dev` abriu sem repetir a exceção `window.desktop` indefinido.
- A falha do benchmark V6 às 12:16 foi efeito dessa mesma falha de preload; não chegou a preparar cabelo nem exportar quadros, portanto não mede o V6. O benchmark 40 s continua pendente.

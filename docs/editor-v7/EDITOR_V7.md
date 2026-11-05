# Editor V7 — pesquisa, arquitetura e execução

**Estado:** descoberta arquitetural iniciada — 05/11/2026  
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
2. **Renderer em WebGPU (candidato principal):** testar disponibilidade real na versão Electron empacotada, diferenças por GPU/driver, readback e imagens de referência. Deve haver fallback WebGL/Canvas ou estratégia explícita se a cobertura não for aceitável.
3. **Exportador em worker:** avaliar `VideoFrame`/`VideoEncoder` (WebCodecs) e medir transferência/cópias; manter FFmpeg como alternativa de codificação/mux e referência de compatibilidade. Nenhuma escolha de encoder é final.
4. **Composição sem volta desnecessária à CPU:** avaliar render-targets e transferência direta; a textura compartilhada offscreen do Electron é experimental e depende de ciclo de vida rigoroso. Não se presume zero-copy apenas pelo nome da API.
5. **UI independente do backend:** timeline e comandos operam sobre contratos do domínio. Preview e export devem compartilhar a mesma avaliação de cena e a mesma semântica de frame.

## Pesquisa técnica inicial

| Opção | Vantagem potencial | Limite/risco | Experimento necessário |
|---|---|---|---|
| Canvas 2D | Simples, previsível e boa compatibilidade | CPU e upload/readback podem limitar cenas grandes | baseline com cena determinística e custo por etapa |
| WebGL2 | Amplo suporte e caminho conhecido | Estado implícito, custo de CPU e complexidade de batching | comparar draw calls, upload, readback e fidelidade |
| WebGPU | API moderna, compute e pipelines explícitos | suporte depende de runtime/driver; recuperação e compatibilidade ainda precisam ser validadas | capability matrix + renderer de referência no Electron instalado |
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
| V7-004 | pendente | Especificar core puro e criar protótipo de scene evaluator + tempo em ticks | Testes unitários determinísticos com fixture sintética |
| V7-005 | pendente | Criar benchmark sintético de Canvas/WebGL/WebGPU e export worker | A/B por fase, SSIM e memória; não integrar UI ainda |
| V7-006 | pendente | Escolher renderer/encoder e validar mux de áudio | ADR com evidências de compatibilidade, fidelidade e velocidade |
| V7-007 | pendente | Integrar fluxo de documento e interface V7 isolados | Rota nova, persistência versionada e testes de ciclo de vida |
| V7-008 | pendente | Gate funcional no projeto autorizado e decisão de convivência/migração | 20 s → 40 s → timeline completa; sem alterar V6 automaticamente |

**Próxima ação concreta:** concluir V7-002 olhando os tipos e operações do documento V6, contratos das áreas que fornecem personagens/assets e testes de persistência existentes. A partir dessa matriz, definir o primeiro contrato V7 puro antes de criar componentes de interface.

## Registro de alterações e evidências

### 05/11/2026 — início

- Confirmado repositório `Dev-V2`, HEAD `d143a2001d412544a66a6e285fd58ad0749413f1`; sem alterações locais antes deste arquivo.
- Mapeados rota lazy, módulos compartilhados, avaliador de cena, coordenação de export e worker offscreen do V6.
- Consultadas documentações primárias do Electron, WebCodecs e FFmpeg; registrado que shared texture é experimental e WebCodecs não muxa MP4.
- Nenhum código de produto, projeto de usuário, dado ou exportação foi alterado nesta etapa.
- Verificação executada: leitura do estado do Git e inspeção estática dos contratos/caminhos citados. Testes de produto não se aplicam a esta primeira nota documental.
- Commit documental criado: `3d33f594` (`docs(editor-v7): start architecture research notebook`).

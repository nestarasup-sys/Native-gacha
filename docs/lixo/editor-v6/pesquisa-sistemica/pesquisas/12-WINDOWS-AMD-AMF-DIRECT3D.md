# Pesquisa 12 — Windows, AMD, AMF e Direct3D

**Status:** **ROTEIRO ABERTO — PESQUISA PROFUNDA NÃO EXECUTADA.**  
**Criado:** 06/11/2026 · **Base:** `Dev-V2@c636ff03` · **Pré-requisito:** [Pesquisa 01](01-ARQUITETURA-GERAL-E-INTEGRACOES.md).

> Este arquivo define a investigação que falta fazer. Os links de código foram verificados na árvore do repositório; isso **não** significa que a tecnologia foi estudada profundamente ou que houve benchmark.

## Pergunta de pesquisa

Existe um caminho de framebuffer D3D/AMF mais rápido que captura BGRA CPU no Windows 11 e que empacota com segurança?

## Caminhos reais do aplicativo a percorrer

- [`electron/domains/editorV6/exportRunner.ts`](../../../../electron/domains/editorV6/exportRunner.ts)
- [`electron/domains/editorV6/exportWorkers.ts`](../../../../electron/domains/editorV6/exportWorkers.ts)
- [`electron/domains/editorV6/exportIpc.ts`](../../../../electron/domains/editorV6/exportIpc.ts)
- [`scripts/video-studio/prepare-ffmpeg-lgpl.ps1`](../../../../scripts/video-studio/prepare-ffmpeg-lgpl.ps1)

Para cada caminho: localizar importadores/chamadores, dono do dado, fonte do recurso, prévia, exportação, efeitos sobre Studio/Customizador/Fabricador e alterações persistidas. Conferir as chamadas no HEAD **e no checkout local**, não apenas no commit de base.

## Rodada de investigação obrigatória

1. [ ] **[CÓDIGO]** Identificar driver AMD e encoder FFmpeg realmente presentes no EXE.
2. [ ] **[CÓDIGO + FONTE OFICIAL]** Investigar D3D11/texture handle, sincronismo, cópia CPU, ciclo de vida e release.
3. [ ] **[EXPERIMENTO]** Benchmark do mesmo MP4 com codec hardware e configuração visual comparável.
4. [ ] Inspecionar versões, APIs e limitações do binário Windows real.
5. [ ] Analisar alternativas, custo de migração, paridade visual, dados, riscos e rollback.
6. [ ] Publicar resultados negativos e pendências, e atualizar `MATRIZ_DE_OPORTUNIDADES.md`.

## Fontes oficiais candidatas (a confirmar na pesquisa)

- https://gpuopen.com/advanced-media-framework/ — **fonte a verificar em profundidade na rodada 12; compatibilidade com o build ainda não comprovada**.
- https://learn.microsoft.com/en-us/windows/win32/medfound/media-foundation-architecture — **fonte a verificar em profundidade na rodada 12; compatibilidade com o build ainda não comprovada**.
- https://www.electronjs.org/docs/latest/tutorial/offscreen-rendering — **fonte a verificar em profundidade na rodada 12; compatibilidade com o build ainda não comprovada**.

**Regra:** não afirmar que a pesquisa desses sites está concluída só porque a URL consta aqui. Registrar páginas lidas, data, trecho relevante e vínculo com o código.

## Gate de teste e critério de conclusão

Portátil Windows validado no PC real, zero vazamentos, qualidade e redução total.

### Risco que não pode ser ignorado

Não considerar CI Windows Server nem presença da GPU como prova de AMF disponível.

## Integração com o plano

Abrir tarefas no [plano executável](../PLANO_EXECUTAVEL.md) somente após demonstrar o comportamento no código, registrar o que pode melhorar e propor experimento falsificável. Um resultado sem benchmark **não** autoriza refatoração em produção.

**Primeiro próximo passo:** completar a leitura dos arquivos acima, registrar chamadas cruzadas e classificar [CÓDIGO]/[FONTE OFICIAL]/[HIPÓTESE]/[A CONFIRMAR]/[MEDIDO].

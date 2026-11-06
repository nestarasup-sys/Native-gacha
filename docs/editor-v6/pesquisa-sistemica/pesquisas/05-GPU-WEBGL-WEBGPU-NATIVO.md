# Pesquisa 05 — GPU, WebGL, WebGPU e nativo

**Status:** **ROTEIRO ABERTO — PESQUISA PROFUNDA NÃO EXECUTADA.**  
**Criado:** 06/11/2026 · **Base:** `Dev-V2@c636ff03` · **Pré-requisito:** [Pesquisa 01](01-ARQUITETURA-GERAL-E-INTEGRACOES.md).

> Este arquivo define a investigação que falta fazer. Os links de código foram verificados na árvore do repositório; isso **não** significa que a tecnologia foi estudada profundamente ou que houve benchmark.

## Pergunta de pesquisa

Um framebuffer de composição final manteria corpo/cabelo/face na GPU sem copiar em cada quadro? O Windows AMD suporta o recurso no Electron empacotado?

## Caminhos reais do aplicativo a percorrer

- [`src/renderer/src/features/editorV6/exportHairMeshRenderer.ts`](../../../../src/renderer/src/features/editorV6/exportHairMeshRenderer.ts)
- [`src/renderer/src/characters/hairMotionMeshGeometry.ts`](../../../../src/renderer/src/characters/hairMotionMeshGeometry.ts)
- [`electron/domains/editorV6/exportWorkers.ts`](../../../../electron/domains/editorV6/exportWorkers.ts)

Para cada caminho: localizar importadores/chamadores, dono do dado, fonte do recurso, prévia, exportação, efeitos sobre Studio/Customizador/Fabricador e alterações persistidas. Conferir as chamadas no HEAD **e no checkout local**, não apenas no commit de base.

## Rodada de investigação obrigatória

1. [ ] **[CÓDIGO]** Verificar WebGL1 vs WebGL2 realmente disponível e MAX_TEXTURE_SIZE.
2. [ ] **[CÓDIGO + FONTE OFICIAL]** Estudar texture upload, framebuffer, sampling, readPixels, fence e context loss.
3. [ ] **[EXPERIMENTO]** Avaliar WebGPU/Dawn, D3D11 e texture sharing sem presumir compatibilidade.
4. [ ] Inspecionar versões, APIs e limitações do binário Windows real.
5. [ ] Analisar alternativas, custo de migração, paridade visual, dados, riscos e rollback.
6. [ ] Publicar resultados negativos e pendências, e atualizar `MATRIZ_DE_OPORTUNIDADES.md`.

## Fontes oficiais candidatas (a confirmar na pesquisa)

- https://developer.mozilla.org/en-US/docs/Web/API/WebGL2RenderingContext/fenceSync — **fonte a verificar em profundidade na rodada 05; compatibilidade com o build ainda não comprovada**.
- https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API — **fonte a verificar em profundidade na rodada 05; compatibilidade com o build ainda não comprovada**.
- https://gpuopen.com/ — **fonte a verificar em profundidade na rodada 05; compatibilidade com o build ainda não comprovada**.

**Regra:** não afirmar que a pesquisa desses sites está concluída só porque a URL consta aqui. Registrar páginas lidas, data, trecho relevante e vínculo com o código.

## Gate de teste e critério de conclusão

Prova em 30/150 frames com paridade e medição CPU/GPU, driver e VRAM.

### Risco que não pode ser ignorado

Não trocar pipeline de produção por WebGPU experimental sem implementação completa de roupas/texto/vídeo.

## Integração com o plano

Abrir tarefas no [plano executável](../PLANO_EXECUTAVEL.md) somente após demonstrar o comportamento no código, registrar o que pode melhorar e propor experimento falsificável. Um resultado sem benchmark **não** autoriza refatoração em produção.

**Primeiro próximo passo:** completar a leitura dos arquivos acima, registrar chamadas cruzadas e classificar [CÓDIGO]/[FONTE OFICIAL]/[HIPÓTESE]/[A CONFIRMAR]/[MEDIDO].

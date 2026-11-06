# Pesquisa 11 — Exportador, FFmpeg, codecs e áudio

**Status:** **ROTEIRO ABERTO — PESQUISA PROFUNDA NÃO EXECUTADA.**  
**Criado:** 06/11/2026 · **Base:** `Dev-V2@c636ff03` · **Pré-requisito:** [Pesquisa 01](01-ARQUITETURA-GERAL-E-INTEGRACOES.md).

> Este arquivo define a investigação que falta fazer. Os links de código foram verificados na árvore do repositório; isso **não** significa que a tecnologia foi estudada profundamente ou que houve benchmark.

## Pergunta de pesquisa

Quais fases gastam tempo real desde o clique até MP4 e quais formatos/filtros/encoders preservam 1080p30 com áudio e sobreposição?

## Caminhos reais do aplicativo a percorrer

- [`electron/domains/editorV6/exportRunner.ts`](../../../../electron/domains/editorV6/exportRunner.ts)
- [`electron/domains/editorV6/exportIpc.ts`](../../../../electron/domains/editorV6/exportIpc.ts)
- [`electron/domains/editorV6/exportWorkers.ts`](../../../../electron/domains/editorV6/exportWorkers.ts)
- [`src/shared/editorV6Export.ts`](../../../../src/shared/editorV6Export.ts)
- [`src/shared/editorV6VideoComposition.ts`](../../../../src/shared/editorV6VideoComposition.ts)

Para cada caminho: localizar importadores/chamadores, dono do dado, fonte do recurso, prévia, exportação, efeitos sobre Studio/Customizador/Fabricador e alterações persistidas. Conferir as chamadas no HEAD **e no checkout local**, não apenas no commit de base.

## Rodada de investigação obrigatória

1. [ ] **[CÓDIGO]** Inspecionar rawvideo BGRA por stdin, filtros, partes Turbo, concat e validar FFprobe.
2. [ ] **[CÓDIGO + FONTE OFICIAL]** Discriminar encoder CPU padrão, auto/hardware, áudio, PTS, range de frames e seam.
3. [ ] **[EXPERIMENTO]** Comparar custo de encoder vs geração de frames e finalização em mesmas condições.
4. [ ] Inspecionar versões, APIs e limitações do binário Windows real.
5. [ ] Analisar alternativas, custo de migração, paridade visual, dados, riscos e rollback.
6. [ ] Publicar resultados negativos e pendências, e atualizar `MATRIZ_DE_OPORTUNIDADES.md`.

## Fontes oficiais candidatas (a confirmar na pesquisa)

- https://ffmpeg.org/ffmpeg.html — **fonte a verificar em profundidade na rodada 11; compatibilidade com o build ainda não comprovada**.
- https://ffmpeg.org/ffmpeg-filters.html — **fonte a verificar em profundidade na rodada 11; compatibilidade com o build ainda não comprovada**.
- https://ffmpeg.org/ffmpeg-formats.html — **fonte a verificar em profundidade na rodada 11; compatibilidade com o build ainda não comprovada**.

**Regra:** não afirmar que a pesquisa desses sites está concluída só porque a URL consta aqui. Registrar páginas lidas, data, trecho relevante e vínculo com o código.

## Gate de teste e critério de conclusão

MP4 H.264 íntegro, 150/300 frames, sem alteração visual, áudio e cancelamento intactos.

### Risco que não pode ser ignorado

Não otimizar encode removendo mídia/áudio, nem misturar GPU/CPU entre grupos A/B.

## Integração com o plano

Abrir tarefas no [plano executável](../PLANO_EXECUTAVEL.md) somente após demonstrar o comportamento no código, registrar o que pode melhorar e propor experimento falsificável. Um resultado sem benchmark **não** autoriza refatoração em produção.

**Primeiro próximo passo:** completar a leitura dos arquivos acima, registrar chamadas cruzadas e classificar [CÓDIGO]/[FONTE OFICIAL]/[HIPÓTESE]/[A CONFIRMAR]/[MEDIDO].

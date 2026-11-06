# Pesquisa 06 — Fabricador, modelos, poses e roupas

**Status:** **ROTEIRO ABERTO — PESQUISA PROFUNDA NÃO EXECUTADA.**  
**Criado:** 06/11/2026 · **Base:** `Dev-V2@c636ff03` · **Pré-requisito:** [Pesquisa 01](01-ARQUITETURA-GERAL-E-INTEGRACOES.md).

> Este arquivo define a investigação que falta fazer. Os links de código foram verificados na árvore do repositório; isso **não** significa que a tecnologia foi estudada profundamente ou que houve benchmark.

## Pergunta de pesquisa

Qual o contrato de fonte (versão/IDs/poses/roupas) necessário para preparar um personagem uma única vez e nunca aplicar cache antigo?

## Caminhos reais do aplicativo a percorrer

- [`electron/domains/fabricator/modelSource.ts`](../../../../electron/domains/fabricator/modelSource.ts)
- [`electron/domains/fabricator/modelCatalog.ts`](../../../../electron/domains/fabricator/modelCatalog.ts)
- [`electron/domains/fabricator/posePersistence.ts`](../../../../electron/domains/fabricator/posePersistence.ts)
- [`electron/domains/fabricator/wardrobePersistence.ts`](../../../../electron/domains/fabricator/wardrobePersistence.ts)
- [`electron/domains/fabricator/hairStorage.ts`](../../../../electron/domains/fabricator/hairStorage.ts)
- [`electron/domains/fabricator/faceStorage.ts`](../../../../electron/domains/fabricator/faceStorage.ts)

Para cada caminho: localizar importadores/chamadores, dono do dado, fonte do recurso, prévia, exportação, efeitos sobre Studio/Customizador/Fabricador e alterações persistidas. Conferir as chamadas no HEAD **e no checkout local**, não apenas no commit de base.

## Rodada de investigação obrigatória

1. [ ] **[CÓDIGO]** Traçar publicações e recuperação de slots, poses, rascunhos, hair/workspace, roupas e face.
2. [ ] **[CÓDIGO + FONTE OFICIAL]** Verificar consumidores reais dos IDs, read/write e revisões visuais.
3. [ ] **[EXPERIMENTO]** Encontrar pontos seguros para pré-compilar materiais sem gravar duplicatas de personagens.
4. [ ] Inspecionar versões, APIs e limitações do binário Windows real.
5. [ ] Analisar alternativas, custo de migração, paridade visual, dados, riscos e rollback.
6. [ ] Publicar resultados negativos e pendências, e atualizar `MATRIZ_DE_OPORTUNIDADES.md`.

## Fontes oficiais candidatas (a confirmar na pesquisa)

- https://nodejs.org/api/fs.html — **fonte a verificar em profundidade na rodada 06; compatibilidade com o build ainda não comprovada**.
- https://www.electronjs.org/docs/latest/tutorial/process-model — **fonte a verificar em profundidade na rodada 06; compatibilidade com o build ainda não comprovada**.

**Regra:** não afirmar que a pesquisa desses sites está concluída só porque a URL consta aqui. Registrar páginas lidas, data, trecho relevante e vínculo com o código.

## Gate de teste e critério de conclusão

Golden character em Customizador/Studio/V6 e integridade após editar fonte e reiniciar.

### Risco que não pode ser ignorado

Não apagar slots, sobrescrever imagens ou mexer em migrações sem backup validado.

## Integração com o plano

Abrir tarefas no [plano executável](../PLANO_EXECUTAVEL.md) somente após demonstrar o comportamento no código, registrar o que pode melhorar e propor experimento falsificável. Um resultado sem benchmark **não** autoriza refatoração em produção.

**Primeiro próximo passo:** completar a leitura dos arquivos acima, registrar chamadas cruzadas e classificar [CÓDIGO]/[FONTE OFICIAL]/[HIPÓTESE]/[A CONFIRMAR]/[MEDIDO].

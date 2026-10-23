# Video Studio V5 — Reconstrução integral da arquitetura

**Decisão ativa (23/10/2026):** reconstruir **integralmente a arquitetura interna do Video Studio**. Não basta “otimizar o editor antigo”. A nova fundação deve conter editor/domínio, timeline, SceneEvaluator, renderizador Gacha, MediaService/AV clock, scheduler, orçamento de memória, supervisão de processos, preview, export e persistência, com **substituição progressiva e aposentadoria da orquestração experimental**.

**Ler primeiro:** [12 — Plano diretor da reconstrução integral e pesquisa das seis prioridades](./12_REAVALIACAO_RECONSTRUCAO_MLT_SKIA_2026-10-23.md). O nome do arquivo `12` é histórico e foi mantido para preservar links; **não significa que MLT/Skia foram escolhidos**.

## Política de reconstrução

- **Arquitetura nova é obrigatória; tecnologias específicas não.** Electron + React continuam a direção de UI. FFmpeg/libav, MLT, GES, Canvas, PixiJS, Skia, Blend2D e C++ entram **somente** após comparação de paridade/Windows/custo/licenças.
- **Código antigo = oráculo, algoritmo ou adaptador temporário, nunca arquitetura final.** Reaproveitar `StudioDocument v1`, SceneIR, semântica normal/PT, pose, fala, blink, infraestrutura de export/FFmpeg e testes quando eles satisfizerem contratos e budgets novos. Não reescrever tudo cegamente; também não deixar o `VideoStudioEditor.tsx` como centro permanente.
- **Nenhuma perda de dados:** preservar personagens, roupas, poses, expressões, PNGs, textos, áudios, vídeos, bibliotecas e projetos v1. Migrações somente aditivas, testadas com cópias e com rollback. Fabricador, Customizador, Studio Principal, Roteiros e Base de Vídeos fora de escopo.
- **Robustez e testes obrigatórios:** RAM/VRAM/processos/decoders medidas; filas e memória orçadas; recovery de falha da engine; preview/export coerentes; 12/24/48 atores e até 4 vídeos sob stress, 15–30 min de **animação variável**, AV/PTS e Windows offline. O teste histórico de 15 min com frame estático após 301 **não valida essa carga**.
- **Nenhuma promessa de “10×” sem benchmark.** A meta é capacidade/confiabilidade, fidelidade e fluidez mensuradas em hardware real, com degradação de preview quando necessário.
- **Branch autorizada:** exclusivamente `nestarasup-sys/Native-gacha` → `feature/model-source-editor`. `main` e `refactor/shared-character-core` **não** podem ser alteradas, mescladas ou receber release sem autorização explícita. PR #5 permanece rascunho até aprovação.
- **Estado:** pesquisa e especificação. O novo motor **não foi implementado** por esta revisão de documentação.

## Ordem de leitura

1. **[12 — Reconstrução integral, contratos, roadmap N0–N10, gates e seis investigações](./12_REAVALIACAO_RECONSTRUCAO_MLT_SKIA_2026-10-23.md)** — fonte atual da decisão arquitetural.
2. [00_PLANO_DIRETOR.md](./00_PLANO_DIRETOR.md) — visão histórica de produto.
3. [11_PESQUISA_OPEN_SOURCE_E_FECHAMENTO_EXPORTADOR.md](./11_PESQUISA_OPEN_SOURCE_E_FECHAMENTO_EXPORTADOR.md) — pesquisa anterior de engines e fechamento do exportador.
4. [02_ARQUITETURA_CANONICA.md](./02_ARQUITETURA_CANONICA.md) — SceneIR, frame/render/audio e contratos já estudados.
5. [04_LAB_E_GATES.md](./04_LAB_E_GATES.md) — laboratório histórico e cenários anteriores.
6. [05_DECISOES_ADR.md](./05_DECISOES_ADR.md) — ADRs anteriores, sujeitos à nova meta.
7. [06_BACKLOG_DE_EXECUCAO.md](./06_BACKLOG_DE_EXECUCAO.md) — tarefas anteriores, não equivalentes ao roadmap N0–N10.
8. [03_MIGRACAO_E_DADOS.md](./03_MIGRACAO_E_DADOS.md) — integridade, asset refs e CAS.
9. [07_MODOS_DE_EXPORTACAO.md](./07_MODOS_DE_EXPORTACAO.md) — variantes `animated` / `static-characters`.
10. [08_ARQUITETURA_EXTENSIVEL_E_RECONSTRUCAO.md](./08_ARQUITETURA_EXTENSIVEL_E_RECONSTRUCAO.md) — abstrações propostas historicamente.
11. [10_RELEASE_CHECKLIST.md](./10_RELEASE_CHECKLIST.md) — critérios de release a complementar com os gates da reconstrução.
12. [01_ESTUDO_DE_MOTORES.md](./01_ESTUDO_DE_MOTORES.md) — motores avaliados anteriormente.
13. [09_MISSAO_CODEX_AUTONOMA.md](./09_MISSAO_CODEX_AUTONOMA.md) — briefing histórico de execução, não autorização de mudança de branch.

**Precedência em conflitos:** integridade de dados e semântica real > gates/decisões do documento 12 > texto histórico. Qualquer instrução de docs antigos para escrita em `G-V5/master-desenvolvimento` deve ser tratada como **obsoleta**.

## Estrutura-alvo resumida

`StudioDocument/AssetManifest → ProjectRepository + EditorCore/CommandBus → SceneCompiler/Evaluator → FramePlan → ResourceBudgeter/Scheduler + GachaRenderer + MediaService → PreviewTransport / ExportService → verificador e publish atômico`.

A interface React apresenta estado e edita; não controla bitmap/decoder como parte do histórico. O autor dos estados Gacha é único por frame. A engine pesada é supervisionada e tem limites de recursos.

## Gates de conclusão

1. **Nova arquitetura real**, sem execução crítica dependente do monólito experimental;
2. **Fidelidade Gacha** total: PT L/R, pose, expressão, fala, blink, balão, transições e z-order;
3. **Projetos v1 íntegros** no roundtrip, incluindo compatibilidade com assets e undo/redo;
4. **Memória limitada e recuperação** em projetos grandes e falha injetada de processo isolado;
5. **Preview, áudio/PTS e MP4 final corretos**, sem frames faltando ou output parcial;
6. **Stress animado e embalagem Windows offline**, com CI/benchmarks registrados;
7. **Aceite do criador e autorização explícita** de merge/release.

Um reparo de OOM no código antigo **não satisfaz** por si só o gate 1. O roadmap técnico **N0–N10** do documento 12 é o plano de execução ativo.

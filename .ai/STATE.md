# Estado da intervenção — 2026-10-30

- **Repositório:** `nestarasup-sys/Native-gacha`
- **Base inspecionada:** `Dev-V2` em `b1f728a91abafbb394b2c5610ebdd77c2ef0df1c`
- **Branch proposta:** `chore/docs-curation-dev-v2-20261030` (PR direcionado a `Dev-V2`)
- **Escopo desta etapa:** navegação de docs, arquivamento não destrutivo, registro técnico para agentes; **sem alterar código de runtime, banco, perfis ou mídia**.

## Situação e limitações

- `README.md` indicava dois links ausentes sob `docs/architecture/`: `PLANO_GITHUB_E_PROXIMOS_PASSOS.md` e `README_LEGADO_2026-10-22.md`.
- Os scripts BAT apontam para `Main-desenvolvimento`; **não foram modificados** para evitar trocar implicitamente a branch oficial do usuário.
- Documentos `CICLO_*`, relatórios e registros de incidente/aceite são históricos e foram separados de ADRs e contratos.
- Este registro **não comprova** execução local de `npm ci`, testes, Electron gráfico, build ou benchmark. O acesso deste ciclo foi por API do GitHub, sem checkout executável.
- Verificação estática da árvore Git: 57 Markdown examinados, nenhum link relativo quebrado encontrado. Workflow Quality executou a etapa de links; duas asserções de testes de Roupas DEV falharam por expectativas antigas, e estão sendo corrigidas com regressão comportamental.
- Próxima etapa: confirmar CI do novo HEAD e retomar melhorias do produto por fatias pequenas com testes reproduzíveis.

## CI observada no PR #7 (SHA `f55a097d`)

- Ubuntu Core: **sucesso** (testes de refatoração, geometria, typecheck e build).
- Linux Quality: verificação de links e 608 testes principais passaram; **falha pré-existente** em orçamento arquitetural: `WardrobeWorkspace.tsx` com ~726 linhas supera o máximo de 630. Investigação: [issue #8](https://github.com/nestarasup-sys/Native-gacha/issues/8). Não elevar o limite para ocultar o desvio.
- Windows Core: testes de refatoração e geometria passaram, mas workflow antigo chamava `test:video:next`, script ausente. Substituído na proposta por `test:editor-v6` (suíte existente). CI da nova configuração pendente; não declarar validação Windows completa antes de passar.

## Rodada de engenharia 2026-10-30 — código e validação

- PR #7: `WardrobeWorkspace.tsx` reduzido de 726 para 589 linhas, mantendo o orçamento arquitetural de 630 linhas. O problema estrutural da issue #8 está corrigido na branch de proposta, mas ainda requer aceite visual.
- Fluxos extraídos: `wardrobeImportOperations.ts`, `wardrobeSleeveCut.ts`, `wardrobePoseActions.ts`, `wardrobeWorkspaceModel.ts`.
- Proteções adicionadas: guarda por geração e identidade do worker, bloqueio de publicação tardia após troca de seleção, liberação de `ImageBitmap` e limite de 50 MB/32 milhões de pixels para importações diretas de grades.
- **Verificado no SHA `740cc271`:** Quality Linux passou completamente, incluindo 611 testes principais, checker de links, auditoria arquitetural, budget, typecheck e build. Core Ubuntu também passou; Core Windows ainda não havia concluído na escrita deste registro.
- **Limites:** não executado teste gráfico de importar/cortar/salvar/abrir Roupas DEV com fixtures no Windows. A verificação de pixels para grades ocorre após `createImageBitmap` e não garante pico de memória nulo.

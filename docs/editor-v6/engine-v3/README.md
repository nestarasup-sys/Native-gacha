---
id: V6-ENGINE-INDEX
tipo: indice
status: ativo
branch: Dev-v3
atualizado: 2026-11-20
---

# Native Gacha — Engine de exportação do Editor V6 (Dev-v3)

**Fonte principal do plano de reconstrução da exportação no Editor V6.**
Não é V7, não substitui a UI de autoria e não promete um resultado de desempenho antes da medição.
A arquitetura pode mudar por evidência. A documentação é curta, versionada e verificável.

> **Contrato com o usuário:** prévia leve, com somente piscadas como animação automática do personagem.
> Todo o restante da animação é produzido no **export MP4**. O motor offline pode substituir
> integralmente o pipeline antigo de render, cabelo, boca e partes internas da timeline.
> Preservar resultado visual, edição de projetos existentes, dados e integridade do MP4.

## Ordem de leitura (pessoa ou IA)

| Ordem | Arquivo | Finalidade |
| --- | --- | --- |
| 0 | [ESTADO.md](ESTADO.md) | fase atual, próximo passo, bloqueios e evidências |
| 1 | [PLANO-1.0.md](PLANO-1.0.md) | missão, limites, contrato de produto e arquitetura-alvo |
| 2 | [PLANO-1.1.md](PLANO-1.1.md) | fases F0–F8, entregáveis e gates G0–G8 |
| 3 | [PLANO-1.2.md](PLANO-1.2.md) | IR, tempo, poses, boca, cabelo, recursos e render |
| 4 | [PLANO-1.3.md](PLANO-1.3.md) | fixtures, paridade, benchmark, migração e rollback |
| 5 | [DECISOES.md](DECISOES.md) | decisões adotadas, propostas e condições de revisão |
| 6 | [INSTRUCOES-IA.md](INSTRUCOES-IA.md) | protocolo enxuto para continuar com agentes |

Para começar a **executar**: ler `ESTADO`, `INSTRUCOES-IA` e **somente o plano correspondente ao gate atual**.
Consultar os demais conforme dependência. Não é necessário reler o histórico inteiro a cada mudança.

## Este plano x documentação anterior

- [Documentação ativa antiga do Editor V6](../atual/README.md): **evidências e benchmarks históricos da Dev-V2**.
- [Pesquisa e resultados anteriores](../atual/PESQUISA-1.1.md): medições e experimentos que não devem ser repetidos sem motivo.
- [Execução anterior](../atual/EXECUCAO-1.1.md): escopo de testes reais e precauções de dados.
- [Direção anterior da Dev-v3](../atual/DEV-V3-DIRECAO.md): primeira rodada de correções; agora **histórica**, não plano principal.
- [AGENTS.md da raiz](../../../AGENTS.md): regras de segurança e engenharia do repositório.
  - A referência da raiz a `Dev-V2` é anterior a esta tarefa. **Para esta iniciativa, usar apenas `Dev-v3`**, conforme autorização explícita do usuário.

**Prioridade em caso de conflito:** instrução mais recente do usuário > segurança e integridade dos dados >
decisões aceitas aqui > planos experimentais anteriores. Sem exceção para ações destrutivas em dados reais.

## Como o conteúdo é marcado

- `[DEC-001]`: decisão versionável, justificativa em `DECISOES.md`.
- `[INV-01]`: invariante que não pode regredir.
- `[F0]`/`[G0]`: fase e seu gate de saída.
- `[FIX-01]`: fixture de regressão.
- `[EXP-HAIR]`: experimento com hipótese e descarte.
- `[BENCH]`/`[CUTOVER]`: protocolos de validação e adoção.
- `status` no front matter: estado do **documento**, não certificado de teste aprovado.

Estados de gates usados em `ESTADO.md`: `PENDENTE`, `EM_ANDAMENTO`, `BLOQUEADO`, `VALIDADO`, `DESCARTADO`.
Só marcar `VALIDADO` após testes/artefatos verificáveis.

## Regra de manutenção

1. **Não criar um Markdown por prompt**. Git guarda mudanças; testes e relatório guardam resultados.
2. Atualizar `ESTADO.md` quando fase, gate, bloqueio ou próxima ação realmente mudar.
3. Atualizar `DECISOES.md` apenas em decisão arquitetural/contrato, com motivo e alternativa rejeitada.
4. Corrigir o `PLANO-1.x.md` dono do assunto quando a hipótese mudar; não duplicar versão inteira.
5. **300 linhas físicas no máximo por Markdown ativo**. Se a continuação for necessária, criar `PLANO-1.4.md`, `1.5` etc. e conectar no índice.
6. Código e testes têm precedência sobre qualquer relato não reproduzido.

## Primeiro trabalho a ser executado

**Fundação do Plano 1.0 concluída:** política de preview + IR v1 + render de uma cena V6 sintética via Sharp, com CI Windows aprovada. Ver [Plano 1.0](PLANO-1.0.md#10-estado-comprovado-da-fundação-10--20112026).
**Plano 1.1 em execução parcial:** CI Windows aprovou comparação SceneSurface SVG/librsvg, perfil 1080p sintético e timebase determinística 24/30. **Próximo foco F0/G0 e F1/G1:** capturar o mesmo frame pelo Chromium real, verificar fidelidade, cobertura de mídia e desempenho comparável. Nenhum gate F0–F8 está fechado.

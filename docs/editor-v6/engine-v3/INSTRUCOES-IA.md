---
id: V6-ENGINE-AI-HANDOFF
tipo: protocolo-de-continuacao
status: ativo
branch: Dev-v3
atualizado: 2026-11-20
---

# Instruções para IA/agente continuar o trabalho

Este arquivo é **roteiro de navegação**, não uma memória paralela do repositório.
Não produzir dezenas de `prompt.md` ou `sessao.md` para simular lembrança.
Os fatos ficam no código, no Git, nos testes e nos relatórios; `ESTADO.md` só aponta a próxima ação.

## Ordem obrigatória ao iniciar uma tarefa da engine

1. Conferir repositório `nestarasup-sys/Native-gacha`, branch **`Dev-v3`**, HEAD e alterações locais.
2. Ler `AGENTS.md` da raiz para segurança/contratos; a menção histórica a `Dev-V2` é substituída pela instrução atual do usuário para **`Dev-v3`**.
3. Ler [README.md](README.md), [ESTADO.md](ESTADO.md) e [DECISOES.md](DECISOES.md).
4. Ler **somente** a seção do `PLANO-1.x` necessária para o gate atual e os contratos importados.
5. Rastrear dependências reais pelo código: entrada -> documento/timeline -> serviço/IPC -> worker -> compositor -> FFmpeg -> arquivo.
6. Formular hipótese e teste mínimo antes de editar. Preferir **uma fatia vertical** sobre novas abstrações.
7. Trabalhar somente na branch Dev-v3 e nos arquivos estritamente necessários ao gate.
8. Verificar e revisar o diff antes de declarar pronto. Registrar comandos e resultados reais.
9. Atualizar `ESTADO.md` se o gate, bloqueio ou próxima ação mudar; `DECISOES.md` apenas se decisão mudar.

## Semântica dos marcadores

| Marcador | Interpretação | Arquivo dono |
| --- | --- | --- |
| `[DEC-XXX]` | escolha e justificativa | DECISOES.md |
| `[INV-XX]` | requisito invariável | PLANO-1.0.md |
| `[F0]` / `[G0]` | fase/gate e condição de saída | PLANO-1.1.md |
| `[FIX-XX]` | fixture de correção/paridade | PLANO-1.3.md |
| `[EXP-HAIR]` | candidatos e A/B de cabelo | PLANO-1.2.md |
| `[BENCH]` | comparação de performance | PLANO-1.3.md |
| `[CUTOVER]` | promoção/fallback | PLANO-1.3.md |
| `[NEXT-XXX]` | única próxima ação ativa | ESTADO.md |

`PENDENTE` = não executado. `EM_ANDAMENTO` = alteração em curso, ainda sem gate.
`BLOQUEADO` = impedimento reproduzível. `VALIDADO` = critérios cumpridos com evidência.
`DESCARTADO` = hipótese testada e rejeitada. Não inferir do nome da branch/commit que algo foi validado.

## Formato mínimo de uma mudança relevante

Antes de alterar:
- **Hipótese:** que custo/defeito se pretende remover e por quê.
- **Contratos afetados:** IDs de `DEC/INV/FIX`, API, UI e persistência.
- **Teste de falsificação:** que resultado mostraria que a hipótese não compensa.

Depois da alteração:
- **Implementação:** arquivos/commit e fluxo alterado.
- **Evidência:** comando, ambiente, fixture, número de frames, tempo/memória/qualidade quando aplicável.
- **Decisão:** manter, reverter, melhorar ou descartar.
- **Próxima ação única:** atualizar `ESTADO.md`.

Se não houver execução, usar **"pendente — não executado"**. Nunca inventar benchmark.
Não criar ata se Git/teste/relatório já contém essa informação.

## Restrições práticas

- A prévia fica sem animação pesada; **somente piscar** automaticamente. Não sugerir nova prévia de render por trecho sem nova decisão do usuário.
- V7 fora do escopo; estudos de alternativas devem servir o V6.
- O motor pode trocar implementação de cabelo, boca, atlas, timeline interna e renderer. O projeto salvo e os dados devem permanecer íntegros.
- Não copiar mídias pessoais para fixtures, não rodar exclusão/migração destrutiva, não usar `git reset --hard` nem forçar push.
- Não confundir "não ligo se falhar a experiência na Dev-v3" com autorização para perder dados de usuário.
- Não declarar sucesso porque o arquivo compilou; export precisa ser visual e funcionalmente validado.
- Não mover dezenas de componentes React enquanto um compositor externo nem consegue produzir o primeiro frame.
- Foco: medir, provar fatia vertical, reduzir o acoplamento do produto, cortar legado após aprovação.

## Quando dividir documentos

Cada Markdown ativo precisa ter **até 300 linhas físicas**.
Ao exceder, abrir uma continuação `PLANO-1.4.md`, atualizar o índice e a ligação da parte anterior.
Não replicar conteúdo inteiro de 1.0/1.1 em cada versão: cada parte é um capítulo, não changelog.
Preferir modificar 20 linhas do plano existente a criar outro arquivo para uma sessão.

## Encerramento de uma sessão

Conferir diff e branch, passar checks possíveis, fazer commit direcionado e entregar um resumo curto:
**o que foi feito; o que foi validado; o que falta; onde continuar**.
Se ainda não há implementação, dizer "planejamento"; se houver apenas harness, dizer "experimento".

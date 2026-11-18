# Rodada 21 — Auditoria dos botões de animação de cabelo

**Branch:** `Dev-V2`. **Escopo:** painel de exportação MP4, contratos de preset, seleção da categoria correta e suas combinações. Não altera a prévia do Editor/Fabricador.

## Controles revisados

| Controle | Comportamento verificado |
| --- | --- |
| Ativar animação de cabelo | Master switch. Com a opção desligada, nenhum preset/loop/reação exclusiva é enviado ao exportador; seletor de preset, edição e modo de movimento ficam indisponíveis |
| Animar apenas o cabelo posterior | Só a categoria `rearHair`, e nunca `backHair`/traseiro, rabo de cavalo, franja ou ahoge. O worker confere o identificador exato `rearHair:` além do grupo interno `front` |
| Balançar só o cabelo posterior após trocar de pose | Torna posterior-only obrigatório, dispara após fim da troca de `poseSlot`, volta ao repouso, sem vento/loop contínuo, e não dispara por expressões isoladas |
| Movimento do cabelo: física contínua | Física original, sem mudanças de algoritmo, se nenhum modo especial estiver ativo |
| Movimento do cabelo: loop 3/4 segundos | Vetores 90/120 frames; funciona com seleção posterior-only e pode animar demais partes caso posterior-only desligado. Incompatível com reação única |
| Preset / edição / salvar | Não grava o filtro posterior-only no Fabricador: é um filtro da exportação. Os cinco slots originais continuam. Slider/intensidade e enabled próprios do preset continuam os valores de origem, exceto a cópia destinada à exportação |
| Desativar reação única | Não restaura silenciosamente um loop antigo. O modo de movimento volta a física contínua ao ativar reação; o usuário pode selecionar loop manualmente depois |

## Correções

1. O botão posterior-only antes dependia somente do grupo interno `front`; agora a opção explícita `hairPosteriorOnly` cruza o IPC e o bundle, e a exportação bloqueia a animação de qualquer `piece.id` que não comece com `rearHair:`.
2. `poseReactionOnly` exige `posteriorOnly` em ambos os contratos; o IPC rejeita divergência entre bundle preparado e opções, além de incompatibilidade com loop.
3. Preset/edição e seletor de movimento desativados quando master switch desligado, sem mexer no estado salvo.
4. Ativar reação única zera o loop anteriormente escolhido; por isso o dropdown não fica mostrando um modo diferente do modo realmente exportado.
5. Matriz de combinações de controle validada em `tests/editor-v6/hairMotionLoop.test.ts`. A CI valida TypeScript, arquitetura, Vitest e MP4 offscreen sintético. Teste final com personagem real continua necessário.

**Atenção:** controle dos presets é por grupo `front/back/fringe`, que historicamente agrupa as cinco categorias autorais. O botão posterior-only agora reforça a seleção por categoria sem migrar o formato do preset. Não confundir `rearHair` com `backHair`.

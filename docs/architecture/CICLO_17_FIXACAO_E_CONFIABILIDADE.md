# Ciclo 17 — fixação de roupas, responsabilidades e validação (2026-10-22)

Branch **`feature/model-source-editor`**, PR #5 **draft**. Não integrar na `main` sem autorização.

## Fluxo de autoria preservado

1. **Modelos DEV**: importa e edita o original desmontado; identidade de cada PNG e os `sourceTransform` persistidos continuam sendo a referência.
2. **Roupas DEV**: encaixa cada roupa diretamente na parte correspondente da folha **original desmontada**. Ímã opcional aproxima bordas/centros durante o arraste; **não fixa** automaticamente.
3. **Fixar**: grava metadados `glue` opcionais (modo `fixed`, quadro da origem e binding relativo). **Soltar** remove a vinculação ativa sem deslocar X/Y/tamanho/rotação e sem modificar PNG.
4. **Poses DEV e Customizador**: roupagem fixa acompanha transformações do osso por `mapWardrobeComponentToPose` compartilhada; roupas legadas com `binding` continuam sendo suportadas. Peças explicitamente soltas não aparecem como se fossem fixadas no personagem.
5. **Studio / Video Studio**: consomem a mesma composição do personagem. Nenhum ajuste do Roupas DEV grava mutações nas poses ou cenas.
6. **Revisões de modelo**: quadro fonte divergente mostra `stale` e exige revisão/refixação. O vínculo original fica congelado até nova ação; não silenciosamente recalcado em um render.

## Arquivos e limites

- `src/shared/wardrobeGlue.ts`: status `loose/fixed/stale/orphan`, fixar, soltar, escolher alvo compatível.
- `src/shared/wardrobeMagnet.ts`: snap determinístico de X/Y por borda ou centro, sem mutação do corpo ou PNG.
- `src/shared/wardrobePoseAudit.ts`: checagem geométrica **somente leitura**, com resultados `ok/attention/incompatible`; não pretende avaliar esteticamente a roupa.
- `WardrobeGlueControls.tsx`, `WardrobeComparisonPreview.tsx`, `WardrobePoseAuditPanel.tsx` e hooks `useWardrobePoseAudit.ts` / `useWardrobeComparisonPose.ts`: UI e consultas desacopladas da página principal.
- `src/shared/wardrobePlacementModel.ts` + `CustomizerClothesAdjustmentPanel.tsx`: cor, visibilidade, seleção de lado/componente, transformações e painel de edição extraídos do Customizador.
- `electron/domains/fabricator/visualUiCapture.ts`: fluxo gráfico Windows sobre sandbox descartável para Soltar→Fixar→Salvar, ímã, comparação, varredura de poses e renderização das duas poses, com screenshots e dados de quadro/memória do processo renderizador.
- `tests/wardrobe-glue-crash-recovery.test.mjs`: encerra processo durante a gravação de PNG com journal e valida recuperação do estado anterior após novo processo, sem restaurar bibliotecas reais.

## Compatibilidade e segurança

- O campo `glue` é **opcional** no JSON do componente. Ausente = comportamento legado do `binding`.
- Regravação de metadados/encaixe de conjunto existente não reenvia os PNGs; conservação dos hashes é requisito.
- Falha de processo, interrupção durante escrita e recuperação por journal têm testes automatizados em perfis temporários. O teste **não simula a durabilidade física de flush/fsync/disco nem corte efetivo de energia**. Essa certificação exige outro ambiente e plano controlado.
- A instrumentação de FPS e memória mede o Chromium real do Electron no sandbox; amostragem curta, não uma garantia de FPS durante utilização contínua, nem medição de biblioteca pessoal.
- Avaliação visual humana em Windows instalado, com cópia segura de modelos/roupas reais, ainda é necessária para concluir o aceite pessoal. Não modificar nem recuperar PNGs potencialmente antigos sem backup verificável.

## Critérios de aceite automatizáveis

- `npm run audit:architecture`, `npm run test:refactor`, `npm run typecheck`, `npm run build`.
- Windows/Ubuntu CI e Electron GUI sintético com abertura, salvamento, comparação de duas poses, releitura e reinício.
- Testes de snapping, vínculos fixos/soltos/antigos, cor e visibilidade por lado, diagnósticos de todas as poses, preservação dos dados e journal sob falha.

**Não marcar como validado antes da conclusão dos workflows do HEAD final.**

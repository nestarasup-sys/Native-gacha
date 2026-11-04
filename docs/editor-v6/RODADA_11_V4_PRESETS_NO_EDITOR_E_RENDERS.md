# Editor V6 — Rodada 11 · Presets no exportador e plano de motor independente

**Data:** 04/11/2026. **Base:** `a36e6fc31199ec287d48a5ec3e10b5a772334044`. **Branch:** `Dev-V2`.

## Diagnóstico do Fabricador DEV

A área `HairAnimationWorkspace.tsx` atualmente tem 167 linhas de componente, mais a prévia física, carregamento de modelo, estilos e catálogo. A parte **persistente do preset**, porém, ocupa apenas cinco slots num array JSON do `localStorage`, chave `gacha-nymi:hair-animation-presets:v1`, com sete controles físicos e três grupos de camada.

A edição e escolha de preset não precisa de Fabricador, Customizador, renderização da prévia ou IPC de modelo. O custo de manter **uma segunda tela inteira** no Fabricador não se justifica para o fluxo rápido de exportar. Mas a prévia de laboratório do Fabricador é útil para testar física e cabelo em detalhe; eliminá-la agora seria regressão funcional.

**Decisão:** manter o Fabricador DEV como laboratório visual; editar os mesmos presets no **painel de exportação do Editor V6**, com controles compartilhados. Não migrar documentos nem alterar a origem dos dados.

## Implementação

1. `src/shared/hairMotionPresetControls.ts`: definição compartilhada de sete campos e limites da física e dos três nomes de camadas; o Fabricador também consome essa configuração para evitar divergência de comportamento.
2. `EditorV6HairPresetEditor.tsx`: edição dos campos físicos, enable/intensidade por camada, sem acoplar à prévia normal do editor.
3. `editorV6HairPresetStorage.ts`: salva apenas um slot após **reler** o array atual, normalizar valores e validar storage. Se o storage antigo está corrompido, não sobrescreve silenciosamente.
4. `EditorV6ExportPanel.tsx`: botões para criar/editar, salvar ou descartar. As alterações em rascunho podem ser usadas na próxima exportação sem publicação; o preset já salvo segue disponível em Fabricador DEV.
5. CSS isolado e testes render-to-static-markup/armazenamento. A prévia da timeline continua **sem cabelo animado**.

## Aceleração real versus organização

A mudança de UI não acelera o processo de geração do MP4. Ela reduz a navegação e torna a opção experimental diretamente utilizável no Editor V6. A otimização de velocidade da Rodada 10, por sua vez, depende de reexportações idênticas e ainda carece de benchmark A/B.

O plano para **acelerar o primeiro export** deixa de ser uma fixação em `capturePage` e passa a exigir avaliação de backends independentes; veja [ALTERNATIVAS_EXPORT_SEM_CHROMIUM_2026-11-04.md](ALTERNATIVAS_EXPORT_SEM_CHROMIUM_2026-11-04.md).

**Aceite:** verificar Electron/Windows, testes de Fabricador, presets lidos de ambas as telas, nenhum dado pessoal modificado, real MP4 com paridade e testes da Rodada 10. Não alegar a meta de 15 s sem medi-la em 300 quadros reais.

## Instrumento da mesma rodada

O script `scripts/editor-v6/spike-native-compositor.cjs` permite experimentar `sharp` fora do Chromium, com PNG RGBA de referência e relatório de diferença por pixel. Seus testes de parser, alpha e fixture sintética fazem parte de `npm run test:editor-v6`. **Não está ligado ao exportador de produção** e não altera o MP4.

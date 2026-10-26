# RETOMAR AQUI — animações do Editor V6

**PAUSADO por solicitação do usuário, em 26/10/2026, por falta de créditos.**
O usuário pediu para salvar imediatamente. Esta entrega é **WIP, não concluída nem validada**. Não informar que as animações estão prontas. Ler este documento antes de continuar.

## Pedido e interpretação

Animar trocas de pose e expressão por personagem, durante os **250 ms anteriores** ao início do próximo bloco. A transição termina no limite do próximo bloco. Os protótipos estão em `AnimatorWorkspace.tsx` e `FaceAnimatorWorkspace.tsx` no Fabricador Dev; servem como referência de comportamento, sem importar seus componentes no V6.

O usuário quer arquitetura própria do V6, desempenho máximo, integração com prévia e exportação. A 30 FPS, 250 ms são 7,5 quadros: manter a duração lógica exata e amostrar apenas quadros inteiros, sem simplesmente arredondar para oito.

## Base já concluída antes deste trabalho

- `b5a6f85`: SceneSurface comum, prévia por quadro e posicionamento na timeline.
- `f8c1ab1`: exportação Turbo 2×, dois Chromium ocultos, BGRA → FFmpeg, junção com cópia do vídeo, mixagem de áudio, relatórios, cancelamento e recuperação CPU. Testado com exportação real.
- CPU usa **libopenh264**, pois o FFmpeg LGPL incluído não contém libx264. Não substituir ou baixar binários sem necessidade.
- Antes deste WIP, passaram typecheck, build, 26 testes, teste real de MP4 e teste de superfície.

## Arquitetura escolhida para animação

**Preparar os intermediários em segundo plano, uma vez por revisão da transição, e guardar um atlas PNG no projeto.** Durante Play, seek e exportação, só selecionar um recorte desse atlas. Não executar composição de roupas/cabelo/rosto ou IPC de biblioteca a cada quadro.

- Interpolar peças, articulações, ângulos pelo menor caminho e transformações/efeitos faciais com smoothstep.
- Quando a imagem da peça/folha muda, trocar a seleção no meio da transição, como no protótipo. Não simular animação de pose com fade entre PNGs inteiros.
- Usar o renderizador canônico **dedicado ao V6** em `src/renderer/src/characters/editorV6CharacterRenderer.ts` para manter roupas, cabelos, olhos e efeitos consistentes.
- Preparação ocorre em uma janela Electron oculta, com fila serial, preload restrito a leituras de assets, cancelamento e resultado vinculado à revisão.
- Armazenar até sete intermediários em um atlas com orçamento aproximado de 8 MP. Liberar canvases de rigs após cada amostra.
- Dados prontos ficam no documento e continuam funcionando na exportação portátil sem consultar o Fabricador.
- Reutilização do exportador precisa incluir o recorte `motionSprite` na chave visual; isso já foi alterado.

## Código já escrito nesta sessão, AINDA SEM COMPILAR/TESTAR

### Contrato e resolução

- `src/shared/editorV6Motion.ts`: planos de transição, comparação pose/expressão, duração 250 ms, amostras por offset, fingerprint, detecção de atlas pendentes e aplicação de resultado.
- `src/shared/editorV6MotionInterpolation.ts`: interpolação própria do V6 para corpo, juntas, face e efeitos. Sem imports dos protótipos.
- `src/shared/editorV6.ts`: tipos `motionSprite` efêmero, `incomingMotion` nos blocos, `motionEnabled` por bloco/faixa, métodos IPC de preparação/cancelamento.
- `src/shared/editorV6Timeline.ts`: resolvedor estático separado do animado; índice de transições por personagem; recorte aplicado apenas no intervalo antecipado. Posicionamento usa estado estático, para não gravar um sprite transitório como pose. Pruning mantém atlas referenciados.
- `src/shared/editorV6Export.ts`: chave visual inclui `motionSprite`.
- `SceneSurface.tsx`: desenha recorte do atlas usando SVG aninhado; mesma saída para prévia/prints/exportação.
- `editorV6Schema.ts`: schemas de atlas, resultado e requisição; flags de animação. `motionSprite` proibido nos estados persistidos. Validar se todos os tipos e limites estão corretos.

### Preparação

- `src/renderer/src/features/editorV6/motion/bakeMotion.ts`: preparação canônica de rigs, cache de leituras, calibrações faciais implícitas, interpolação, recorte alpha, atlas e geometria de palco. Precisa de revisão/testes reais.
- `.../motion/bakeWorker.ts`: entrada do preparador oculto.
- `.../motion/useEditorV6Motion.ts`: hook com debounce, fila de um pedido por vez, cancelamento de revisão antiga, cache limitado, erro/repetir.
- `electron/editorV6MotionPreload.ts`: bridge de leituras `CharacterRenderAssetProvider` + payload/completion.
- `electron/domains/editorV6/motionIpc.ts`: serviço de fila, janela oculta, validação, cancelamento e drain.
- `electron.vite.config.ts`: novo preload.
- `src/renderer/src/main.tsx`: hash `#/editor-v6-transition-baker` executa preparador sem montar App. Essa estratégia usa o index.html já autorizado pelos handlers de leitura do Fabricador; o preload não expõe o desktop completo.
- `electron/main.ts`: registra serviço e cancela/aguarda preparações ao encerrar. Arrumar estilo de vírgula na lista `pendingWrites`.
- `electron/preload.ts` / `editorV6IpcChannels.ts`: API pública de preparar/cancelar.
- `editorV6CharacterRenderer.ts`: acrescentado `dispose()` ao retorno de `prepareSavedCharacterRenderer`, para liberar backing stores dos canvases na preparação. Conferir a assinatura alterada por script.

### Integração parcial na página

- `EditorV6Page.tsx` chama o hook e mostra andamento/erro/repetir.
- Play bloqueado enquanto há transições necessárias pendentes.
- Duplicação de projeto remapeia IDs de atlas e fingerprints para reutilizar imagens prontas.
- `EditorV6ExportPanel.tsx`: começou a detectar pendências e impedir `start()`, recebe `motionError`. **Ainda falta desabilitar o botão e mostrar motivo/progresso no painel.**

## Próximos passos obrigatórios

1. **Rodar `npm run typecheck` imediatamente.** Nenhuma compilação ou teste foi executado depois das alterações deste WIP. Corrigir tipos, principalmente `CustomizerFaceAppearance.transforms`, categorias faciais, assinatura de `dispose` e schemas.
2. Revisar `bakeMotion.ts`: calibração de overrides ausentes deve partir da posição real do catálogo, não de (0,0); peças/componentes discretos trocam no meio. Conferir efeitos, pupilas PT, boca, blink/talk e ausência de assets. Não animar blink/talk isolados como troca de preset.
3. Completar UI na `EditorV6Timeline.tsx`: habilitar/desabilitar animação por faixa de personagem e por bloco de destino; indicar os 250 ms antes da fronteira. O contrato já tem `motionEnabled`, mas **os controles ainda não foram escritos**.
4. Completar bloqueio visual do exportador e verificar no **main/exportRunner e exportIpc** se `missingEditorV6Motions(project, start, end)` está vazio antes de exportar. **Essas verificações no backend ainda não foram adicionadas.** Nunca exportar silenciosamente cortes estáticos quando a animação exigida está pendente.
5. Revisar `pruneEditorV6TimelineSnapshots`: atualmente retém `incomingMotion.assetId`, mesmo se a revisão ficou inválida. Limpar metadados/atlas sem referência ao invalidar a borda, preservando histórico e cache LRU. O resolvedor já ignora chave inválida.
6. Testar invalidadores: editar pose/expressão dos dois lados, mover/dividir/excluir/duplicar blocos, desfazer/refazer, ocultar/desativar faixa, período menor que 250 ms, primeira pose, personagens independentes, clone do projeto, reabrir JSON, exportação iniciando no meio da transição.
7. Acrescentar testes puros de tempo: início lógico em `destino - 7,5 quadros`, amostras inteiras de offsets -7…-1, estado final exato no limite, nenhuma transição para posição isolada, blink/talk isolados, materiais/revisões incompatíveis ou faixa desativada.
8. Criar teste real isolado Electron para a preparação com modelo/poses sintéticos e bridge de leituras mockada. NÃO usar ou modificar os projetos reais do usuário. Verificar movimento real de peça (não crossfade), expressão interpolada, orçamento do atlas, descarte de resultado obsoleto e liberação de canvases. Para expressão com pose fixa, esperar um único rig preparado; para pose variável, liberar cada rig após desenhar.
9. Estender testes de superfície e exportação para uma emenda Turbo dentro da animação: o sprite muda por quadro e não é indevidamente reaproveitado. Scripts existentes: `scripts/editor-v6/check-scene-surface.cjs` e `scripts/editor-v6/check-export.cjs`.
10. Executar `npm run typecheck`, `npm run test:editor-v6`, `npm run build`, `npm run test:editor-v6:surface`, `node scripts/editor-v6/check-export.cjs`, mais o teste de preparação novo. Evitar repetições sem mudanças/novos riscos.
11. Atualizar documentação em `docs/editor-v6` e salvar commit local final. Não publicar GitHub sem pedido.

## Pontos de atenção

- O resolvedor animado cria elementos efêmeros com `assetId` do atlas e `motionSprite`. **Nunca persistir esses elementos em blocos/poses.**
- A matriz de escala/recorte no bake foi escrita para coincidir com os PNGs estáticos já recortados do V6 nos dois extremos. Validar alinhamento com poses reais/sintéticas, espelhamento e rotação.
- Mudanças só de posição não devem disparar transição de pose. Mudanças de revisão/material atualmente são tratadas como corte, porque não existe snapshot completo de Customizer por estado.
- A interpolação usa peças/anchors e posições de juntas; ainda não foi adicionada uma solução nova de cinemática para corrigir eventuais gaps entre membros em rotações grandes. Avaliar com o protótipo e o rig real antes de prometer qualidade final.
- O serviço de preparação usa a sessão padrão para poder ler os assets pelos handlers já autorizados do index.html; não alterar permissões globais dessa sessão.
- Há uma modificação **preexistente** em `ABRIR_DESENVOLVIMENTO.bat`, alheia a este trabalho. Não sobrescrever nem incluir inadvertidamente no commit.
- Outras conversas podem editar o mesmo repositório. Conferir status/diff e fazer commits apenas dos arquivos desta tarefa (`git commit --only ...` é útil se houver alterações já staged de outro trabalho).

## Pedido do usuário que pausou

“pausa e salva tudo to sem credito, deixe um doc para voce ler e continuar, rapido”

Parar depois de salvar este WIP. Só retomar a implementação quando o usuário pedir.

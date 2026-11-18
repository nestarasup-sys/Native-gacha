# Zona de guerra — R33: agrupar 21 bakes por personagem

A investigação do relatório mostrou `21` bakes distintos, com `2` personagens. A preparação gera trabalho pesado em até duas lanes Electron, cada uma com caches temporários do modelo, roupas, rosto e renderizadores de extremidade (R32). Se as chamadas alternarem personagens, essas sessões são descartadas e materiais são recarregados.

## Implementação
`editorV6MotionBakeGroupOrder` ordena os índices por ID de personagem com ordem estável dentro de cada personagem; `prepareExportMotions` usa essa sequência para chamar `deps.bake`. A tabela de resultados continua indexada por posição ORIGINAL, preservando a reconstrução da timeline e do atlas de cada bloco, independentemente da ordem de conclusão. Nenhum estado persiste entre exportações e nenhuma transição deixa de ser gerada.

## Atenção
Com somente um personagem, a sequência é idêntica. Com dois personagens, as duas lanes podem processar o primeiro grupo em paralelo, depois o segundo. **Não se promete ganho** sem medir na CPU do Windows 11; o ganho real depende de quantas vezes a sessão de bake antes mudava de personagem. A R32 aumenta o valor potencial da afinidade porque reduz a criação de renderizadores de ponta dentro da mesma sessão.

Testes: ordem estável, dataset intercalado, nenhum dado mutado, Zero/single, e suíte de preparação existente; Windows CI de TypeScript, MP4 e motion-service Electron.
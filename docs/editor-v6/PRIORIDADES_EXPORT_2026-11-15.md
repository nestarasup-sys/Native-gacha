# Editor V6 — o que eu mudaria no export

**15/11/2026 · Dev-V2 · base 9683eb46.** Revisão do código e dos relatórios já registrados. As mudanças abaixo são propostas. Esta revisão não executou exportação, build ou testes.

## Ordem de implementação

| Prioridade | Mudança | Resultado esperado |
| --- | --- | --- |
| 1 | Validar destino e encoder antes da preparação pesada | Menos espera ao cancelar e falhas mais cedo |
| 2 | Reusar transições idênticas entre exportações | Menos preparação ao corrigir um trecho e exportar de novo |
| 3 | Limitar imagens e trabalhos simultâneos por bytes | Menor pico de memória em projetos longos |
| 4 | Reduzir a recriação de workers quando houver muitos trechos | Menos inicializações e menos decodificações repetidas |
| 5 | Atacar captura e codificação conforme o relatório | Ganho direcionado ao estágio dominante |

## 1. Validar cedo e congelar os dados da exportação

Hoje, com cabelo ligado, o painel já prepara o cabelo antes de chamar o IPC que escolhe o destino. No processo principal, a sondagem do encoder ocorre depois do preparo das transições. Eu faria um fluxo curto para validar intervalo, destino e encoder antes desses custos, com cancelamento desde o preparo. Uma autorização de exportação por job ligaria o destino e as opções ao snapshot validado. Abrir o diálogo cedo dispensa preparar cabelo quando o usuário desiste de salvar. [Comando do painel](../../src/renderer/src/features/editorV6/editorV6ExportCommands.ts), [IPC](../../electron/domains/editorV6/exportIpc.ts), [Orquestração](../../electron/domains/editorV6/exportRunner.ts).

O retorno à janela dispara atualizações do editor visível. O export recebe uma cópia do documento e usa janelas offscreen com throttling desativado. Isso dá motivo para investigar concorrência por recursos, mas não confirma atualização de personagem dentro do export nem explica o aumento visual entre expressões. Eu fixaria explicitamente a revisão das fontes usada pelo job e agruparia os refreshes de foco e visibilidade no editor. Para o salto de tamanho, compararia primeiro escala, âncora e recorte dos dois estados com os quadros intermediários. [Atualização de personagens](../../src/renderer/src/features/editorV6/useEditorV6CharacterSources.ts), [Janela de exportação](../../electron/domains/editorV6/exportWorkerWindow.ts), [API do Electron](https://www.electronjs.org/docs/latest/api/web-contents).

## 2. Reusar o que gera os mesmos pixels

O export recalcula atlas de transição e já agrupa transições iguais na execução atual. O escopo por job deixa um novo export frio. Eu separaria **a identidade do resultado** da **vida do job**: a chave do atlas incluiria os estados de origem e destino, revisões das imagens, amostras, modo de boca e versão do compositor. O job mantém suas próprias referências e limites. Conteúdo com origem desconhecida ou chave incompatível segue para preparo normal. Começaria pelas transições de pose e expressão. Boca e cabelo têm entradas e ciclos de vida próprios. [Preparação](../../electron/domains/editorV6/exportMotionPreparation.ts), [Agrupamento](../../electron/domains/editorV6/prepareMotions.ts), [Cache do preparador](../../electron/domains/editorV6/motionIpc.ts).

O ganho esperado é maior quando uma segunda exportação muda pouca coisa. No projeto longo, o ganho a frio depende mais de reduzir o conjunto de imagens carregadas e liberar resultados sem uso. Evitaria anexar indiscriminadamente atlas antigos da prévia ao documento de exportação.

## 3. Aplicar orçamento ao export inteiro

Com fala vinculada e loop de boca ligado, os trechos podem ter até 300 quadros. A boca já é preparada por trecho e o worker já recebe um recorte dos recursos. As transições são preparadas antes da renderização, e os seus resultados permanecem acessíveis no job. Eu manteria o planejamento global da timeline e faria a preparação/entrega dos atlas em janelas limitadas por bytes, com referências compartilhadas por conteúdo e liberação após o último trecho que as usa. A seleção por trecho precisa considerar transições que cruzam emendas e o estado anterior ao primeiro quadro. Onde houver Base64 duplicado comprovado, transportaria referências a arquivos temporários pelo protocolo restrito já existente. [Planejamento](../../electron/domains/editorV6/exportPlanning.ts), [Preparação por trecho](../../electron/domains/editorV6/exportPartRenderer.ts), [Recorte para o worker](../../electron/domains/editorV6/exportWorkerPayload.ts).

O orçamento precisa somar preparação facial, imagens decodificadas, buffers de captura e encoders ativos. Assim a concorrência pode cair de dois trechos para um quando o custo estimado for alto. Limitar só o número de workers ainda permite acumular imagens grandes. Eu preservaria o backpressure atual entre captura e FFmpeg, com no máximo um quadro seguinte adiantado. [Pipeline de quadros](../../electron/domains/editorV6/exportFramePipeline.ts), [Backpressure em streams do Node](https://nodejs.org/api/stream.html#buffering).

## 4. Manter workers quentes quando a inicialização pesar

Cada trecho abre e encerra seu worker. Se a soma de `workerStartupMs` e a decodificação inicial forem relevantes num relatório longo, eu usaria uma janela por posição de trabalho, reaproveitada apenas dentro do mesmo job. A troca de trecho manteria o frame absoluto, renovaria os recursos específicos do trecho e resetaria tokens e reaproveitamento de bitmap. Se a memória da janela só crescer, reciclar a janela é preferível a mantê-la indefinidamente. O MP4 de cada trecho pode continuar independente. [Agendador](../../electron/domains/editorV6/exportAttemptRenderer.ts), [Ciclo de vida por trecho](../../electron/domains/editorV6/exportPartRenderer.ts).

## 5. Manter a captura atual e usar os relatórios para decidir

O checkpoint de 14/11 registrou 60 quadros únicos em Full HD em **3,017 s**. `capturePage` somou **1,281 s**, conversão/cópia de bitmap **0,246 s** e escrita no FFmpeg **0,324 s**. A variante via evento `paint` fez **4,319 s** nessa execução. Houve paridade de pixels em amostras sintéticas separadas, inclusive em camadas. Esses números localizam custos e não projetam o ganho de um vídeo longo. Eu manteria `capturePage` como padrão e olharia primeiro para os readbacks obsoletos e o tempo para pintar o quadro correto. Textura compartilhada é uma aposta posterior: com um encoder que ainda recebe BGRA em pipe, o caminho precisa justificar onde economiza a transferência. [Checkpoint de 14/11](./ESTADO_CONTINUACAO_2026-11-14.md), [Renderização offscreen do Electron](https://www.electronjs.org/docs/latest/tutorial/offscreen-rendering).

Na entrega, o vídeo já é codificado por trecho e unido sem recodificar o H.264. Eu manteria a compatibilidade dos streams e a validação das emendas. Antes de mexer no codec, usaria o relatório para separar tempo de captura, espera de escrita, finalização e mixagem. [Finalização](../../electron/domains/editorV6/exportFinalization.ts), [Concat no FFmpeg](https://ffmpeg.org/ffmpeg-formats.html#concat).

## Primeira entrega que eu faria

Mover a validação de destino e encoder para antes do preparo, registrar o tempo entre clique e primeiro quadro e separar **transições solicitadas, únicas, reaproveitadas e rasterizadas** no relatório. Em seguida, introduzir o reuso por revisão. Isso dá visibilidade imediata para dois problemas diferentes: quanto tempo o usuário espera para começar e quanto trabalho o app repete ao exportar novamente.

Para o export longo, eu acrescentaria ao relatório marcos de preparo, publicação e fechamento, com picos por processo e bytes de temporários. O encerramento histórico `-36861` ainda não tem causa confirmada. Esses dados permitem aproveitar exportações que o usuário já faria, sem exigir uma nova rodada de benchmark para cada ajuste.

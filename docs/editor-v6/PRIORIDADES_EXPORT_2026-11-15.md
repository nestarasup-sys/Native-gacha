# Editor V6 — prioridades para renderização e boca no export

**15/11/2026 · Dev-V2.** Plano baseado no código, nos relatórios existentes e na observação de que a demora aparece depois das preparações iniciais. Sem novas exportações, builds ou testes nesta revisão.

## Regra de isolamento e limpeza

Cada export começa do zero. Nenhum atlas, imagem decodificada, worker ou resultado gerado deve ser reaproveitado de um export anterior. Dentro da mesma execução, dados temporários podem ser compartilhados entre trechos enquanto forem necessários. Ao concluir com sucesso, ficam apenas **o MP4 final e o relatório**.

O código já cria um escopo de memória por execução e tenta remover o candidato e a pasta temporária no encerramento. Eu usaria esse caminho como ponto único de limpeza para processos, janelas, referências em memória e arquivos de trabalho, inclusive em cancelamento ou falha. Encerramento abrupto pode impedir o cleanup. Nesse caso, a retomada deve identificar e limpar apenas temporários de jobs encerrados que o app consegue comprovar que criou. O relatório deve registrar falhas de limpeza. [Escopo do export](../../electron/domains/editorV6/exportRunner.ts), [Limpeza](../../electron/domains/editorV6/exportRunCleanup.ts).

## 1. Reduzir o custo da boca no caminho da renderização

Cada trecho prepara a boca antes de abrir o próprio worker. Quando há dois trechos ativos, o preparo de um pode competir com a captura e codificação do outro. A etapa já limita o tamanho dos atlas, mas esse limite não soma imagens decodificadas, captura BGRA e memória do encoder. [Renderização por trecho](../../electron/domains/editorV6/exportPartRenderer.ts), [Preparo de boca](../../electron/domains/editorV6/prepareMouthLoops.ts).

Eu faria nesta ordem:

1. **Indexar as falas e os estados faciais uma vez por export.** Para cada trecho, consultar apenas os intervalos que cruzam sua janela. Pular o preparo de boca em trechos sem fala elegível. Se a fase global da boca ou um estado visual cruza uma emenda, levar essa informação ao trecho seguinte.
2. **Separar as filas de boca e de renderização com um orçamento comum.** Enquanto um trecho renderiza, adiantar no máximo o seguinte, e só quando houver espaço no orçamento. Se os dois competirem, retardar o preparo seguinte. Liberar recortes que perderam seu último consumidor assim que o trecho fechar.
3. **Evitar transporte e decodificação repetidos.** Quando o mesmo recorte servir a trechos vizinhos do job atual, partilhar uma referência restrita ao job, com contagem por consumidor. Se o perfil apontar Base64 ou PNG como custo relevante, usar o protocolo de mídia já existente para entregar o recorte sem reinseri-lo no documento inteiro. [Recorte dos recursos do worker](../../electron/domains/editorV6/exportWorkerPayload.ts).

## 2. Diminuir o tempo por quadro no renderizador

O checkpoint de 14/11 registrou **3,017 s para 60 quadros sintéticos únicos em Full HD**. Nesse perfil, `capturePage` somou **1,281 s** e a escrita para o FFmpeg **0,324 s**. A variante via `paint` levou **4,319 s**. É uma amostra histórica, sem carga controlada, mas indica onde começar. [Checkpoint](./ESTADO_CONTINUACAO_2026-11-14.md).

- **Manter `capturePage` e reduzir capturas descartadas.** Priorizar a sequência desenho → pintura → token → captura. O checkpoint registrou sete readbacks obsoletos em 60 quadros. Manter o token como condição para aceitar a imagem, inclusive para as camadas de fundo e primeiro plano. [Captura](../../electron/domains/editorV6/exportFrameCapture.ts), [Renderização offscreen do Electron](https://www.electronjs.org/docs/latest/tutorial/offscreen-rendering).
- **Preservar reaproveitamento de quadros e camadas dentro do job.** Em cenas paradas, a composição idêntica já pode aproveitar o bitmap anterior. Qualquer ajuste deve incluir a amostra da boca, piscadas e transições na identidade visual. [Renderizador de quadros](../../src/renderer/src/features/editorV6/exportFrameRenderer.ts).
- **Só reaproveitar uma janela entre trechos do mesmo job se o startup pesar.** Hoje cada trecho abre e fecha sua janela. Se `workerStartupMs` e o carregamento inicial forem relevantes, manter a janela durante o job, trocar os recursos do trecho e resetar tokens e buffers. Destruir a janela no encerramento. [Agendador](../../electron/domains/editorV6/exportAttemptRenderer.ts), [Ciclo do trecho](../../electron/domains/editorV6/exportPartRenderer.ts).

## 3. Usar o relatório das exportações normais

Primeira entrega proposta: registrar **por trecho** o tempo em fila, preparo de boca, abertura do worker, captura, escrita e encerramento. Separar quantidade de estados faciais, bytes vivos e pico de memória dos bytes totais enviados. A duração somada de etapas em paralelo não é o tempo que o usuário esperou. Incluir também contagem de capturas descartadas e resultado da limpeza. [Métricas](../../electron/domains/editorV6/exportMetrics.ts), [Relatório](../../electron/domains/editorV6/exportReport.ts).

Com isso, os próximos ajustes podem ser escolhidos a partir de exports que o usuário já faria. Se boca e render competirem, ajustar primeiro o agendamento. Se a boca estiver pronta e a captura continuar pesada, focar no compositor. A junção já copia o H.264 sem recodificar. Preservar áudio, emendas e validação de saída. [Finalização](../../electron/domains/editorV6/exportFinalization.ts).

O retorno à janela aciona refreshes do editor visível. Isso pode disputar recursos com o export, mas ainda não vincula a atualização ao salto visual de tamanho entre expressões. Para esse sintoma, conferir escala, âncora e recorte nos quadros intermediários. [Refresh do editor](../../src/renderer/src/features/editorV6/useEditorV6CharacterSources.ts).

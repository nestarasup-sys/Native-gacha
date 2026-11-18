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

O JSON registra um resumo por tentativa em `attempts[].summary`. Use `wallMilliseconds` e `effectiveFramesPerSecond` para comparar tentativas. Os valores de `summedWorkerMilliseconds` medem trabalho agregado que pode se sobrepor. Captura de página e conversão do bitmap já estão incluídas no tempo de captura. A espera da escrita no FFmpeg inclui a contrapressão do pipe.

Os trechos registram o intervalo de saída, quadros previstos e escritos, dados brutos por quadro, camadas, clipes de vídeo sobrepostos, tempo e volume de preparação da boca, estado da etapa e erro quando aplicável. Uma tentativa interrompida pode conter trechos parciais. O campo `cleanup` registra o tempo e os erros de limpeza. A ausência desse campo indica que o relatório foi salvo antes da limpeza ou gerado por uma versão anterior.

Primeira entrega proposta: registrar **por trecho** o tempo em fila, preparo de boca, abertura do worker, captura, escrita e encerramento. Separar quantidade de estados faciais, bytes vivos e pico de memória dos bytes totais enviados. A duração somada de etapas em paralelo não é o tempo que o usuário esperou. Incluir também contagem de capturas descartadas e resultado da limpeza. [Métricas](../../electron/domains/editorV6/exportMetrics.ts), [Relatório](../../electron/domains/editorV6/exportReport.ts).

Com isso, os próximos ajustes podem ser escolhidos a partir de exports que o usuário já faria. Se boca e render competirem, ajustar primeiro o agendamento. Se a boca estiver pronta e a captura continuar pesada, focar no compositor. A junção já copia o H.264 sem recodificar. Preservar áudio, emendas e validação de saída. [Finalização](../../electron/domains/editorV6/exportFinalization.ts).

O retorno à janela aciona refreshes do editor visível. Isso pode disputar recursos com o export, mas ainda não vincula a atualização ao salto visual de tamanho entre expressões. Para esse sintoma, conferir escala, âncora e recorte nos quadros intermediários. [Refresh do editor](../../src/renderer/src/features/editorV6/useEditorV6CharacterSources.ts).

## Referência do Electron aplicada ao export

A instalação deste workspace usa Electron **45.3.1**. Os links abaixo apontam para a documentação oficial corrente. Os tipos da instalação também foram consultados para `capturePage`, sessões e textura compartilhada. A presença de uma API não comprova ganho nem paridade no Windows.

### Captura, pintura e GPU

| Página oficial | Aplicação no Editor V6 |
| --- | --- |
| [Offscreen Rendering](https://www.electronjs.org/docs/latest/tutorial/offscreen-rendering) | O evento `paint` sinaliza regiões alteradas e pode não ocorrer numa página parada. Um export determinístico precisa continuar usando o token de quadro. O modo por bitmap e o modo textura compartilhada têm custos de transferência diferentes. |
| [webContents](https://www.electronjs.org/docs/latest/api/web-contents#contentscapturepagerect-opts) | `capturePage(rect)` retorna um `NativeImage`. Medir espera por pintura, captura, readbacks rejeitados e conversão separadamente. `stayHidden` e `stayAwake` são opções independentes. Avaliar qualquer mudança de visibilidade junto do token e das duas camadas. |
| [BrowserWindow](https://www.electronjs.org/docs/latest/api/browser-window) | `backgroundThrottling` afeta animações, timers e a visibilidade percebida pela página. Os workers já o desativam e configuram 60 Hz de pintura. Essa taxa é do compositor offscreen, enquanto 24/30 FPS é a cadência do vídeo. Aumentar o limite de pintura não garante entrega mais rápida. |
| [nativeImage](https://www.electronjs.org/docs/latest/api/native-image#imagetobitmapoptions) | `toBitmap()` fornece uma cópia de pixels. O `subarray` que o V6 já usa evita outra cópia, mas não elimina a conversão do Electron. Em mudanças de caminho, manter dimensões, ordem de canais, alpha e espaço de cor. |
| [sharedTexture](https://www.electronjs.org/docs/latest/api/shared-texture) | A API é experimental e a origem precisa manter a textura válida enquanto há consumidores. Só vale estudar depois de identificar um caminho de Windows que consume a textura sem voltar a copiar todo quadro para BGRA antes do FFmpeg. |
| [GPU em app](https://www.electronjs.org/docs/latest/api/app#appgetgpufeaturestatus) | `getGPUFeatureStatus()` após `gpu-info-update` ajuda a contextualizar diferenças entre máquinas. A aceleração do compositor e o encoder escolhido pelo FFmpeg são diagnósticos separados. |

No código atual, a área capturada também contém a faixa do token. Com composição empilhada, a altura inclui duas camadas. Uma mudança de retângulo ou troca de bitmap por textura precisa manter esses limites. [Janela offscreen](../../electron/domains/editorV6/exportWorkerWindow.ts), [Captura](../../electron/domains/editorV6/exportFrameCapture.ts).

### IPC e preparo da boca

- **[Process Model](https://www.electronjs.org/docs/latest/tutorial/process-model)** e **[Performance](https://www.electronjs.org/docs/latest/tutorial/performance)**. O main coordena janelas, IPC e captura. Medir fila e tempo bloqueado ali para saber se a boca compete pela rasterização, pela montagem Base64, pelo transporte de dados ou pelo compositor. Evitar colocar CPU ou I/O síncrono pesado nesse processo.
- **[IPC](https://www.electronjs.org/docs/latest/tutorial/ipc)** e **[MessagePortMain](https://www.electronjs.org/docs/latest/api/message-port-main)**. Um canal dedicado pode separar controle de quadro e entrega de recursos, com confirmação, fila limitada e fechamento no cancelamento. A lista de transferência da API de main é de portas. Trocar o transporte sozinho não comprova ausência de cópias de buffers ou strings.
- **[UtilityProcess](https://www.electronjs.org/docs/latest/api/utility-process)**. Considerar para CPU pura medida, como transformação de dados ou compactação. Ele executa Node.js. O preparo facial atual que depende de DOM/Canvas continua precisando do ambiente de renderização.
- **[Context Isolation](https://www.electronjs.org/docs/latest/tutorial/context-isolation)**, **[Context Bridge](https://www.electronjs.org/docs/latest/api/context-bridge)** e **[Security](https://www.electronjs.org/docs/latest/tutorial/security#17-validate-the-sender-of-all-ipc-messages)**. Qualquer canal novo deve expor operações específicas no preload e validar remetente, job e dados no main. O protocolo de mídia é um ponto de integração para entregar atlas temporários sem abrir acesso arbitrário a arquivos. [Protocolo do worker](../../electron/domains/editorV6/exportWorkerMediaProtocol.ts).

### Memória, quedas e suspensão

- **[app.getAppMetrics](https://www.electronjs.org/docs/latest/api/app#appgetappmetrics)**, **[ProcessMetric](https://www.electronjs.org/docs/latest/api/structures/process-metric)** e **[MemoryInfo](https://www.electronjs.org/docs/latest/api/structures/memory-info)**. Consolidar a amostragem do Electron se for incluir CPU, pois novas chamadas reiniciam a janela dessa medição. Usar PID e horário de criação para atribuição interna. Os valores de memória vêm em KB. Separar working set e bytes privados, que não medem VRAM. O FFmpeg externo precisa de instrumentação própria.
- **[contentTracing](https://www.electronjs.org/docs/latest/api/content-tracing)**. Um trace curto e opt-in pode distinguir tarefas de pintura, rasterização e compositor quando as métricas por trecho não bastarem. Se usado, extrair o resumo para o relatório e descartar o trace temporário do job.
- **[render-process-gone](https://www.electronjs.org/docs/latest/api/structures/render-process-gone-details)** e **[child-process-gone](https://www.electronjs.org/docs/latest/api/app#event-child-process-gone)**. Registrar motivo, código, fase e trecho. O primeiro cobre renderers. O segundo ajuda a identificar GPU e processos auxiliares do Electron. Nenhum evento isolado explica o encerramento histórico `-36861`.
- **[crashReporter](https://www.electronjs.org/docs/latest/api/crash-reporter)**. Desligar upload ainda pode deixar dumps locais quando o coletor está ativado. Para o export normal, priorizar eventos e contadores no relatório em vez de adicionar um coletor que persista arquivos extras.
- **[powerMonitor](https://www.electronjs.org/docs/latest/api/power-monitor)** e **[powerSaveBlocker](https://www.electronjs.org/docs/latest/api/power-save-blocker)**. Correlacionar suspend/resume com timeouts. Se houver necessidade de manter uma exportação longa ativa, usar um bloqueio durante o job que permita apagar a tela e liberá-lo junto com o cleanup.

### Sessão em memória e descarte

As janelas do export já usam partições únicas **sem `persist:`**. O Electron documenta essas partições como sessões em memória. Se uma janela vier a atender mais de um trecho, restringir esse reuso ao job, revogar os recursos de mídia anteriores e fechar a janela, o canal e o protocolo no fim. O código já desregistra o protocolo em `closed`. O descarte de sessão e o descarte de arquivos temporários são responsabilidades diferentes. [Session](https://www.electronjs.org/docs/latest/api/session), [Protocolo por sessão](https://www.electronjs.org/docs/latest/api/protocol#using-protocol-with-a-custom-partition-or-session), [BrowserWindow.destroy](https://www.electronjs.org/docs/latest/api/browser-window#windestroy), [Janela](../../electron/domains/editorV6/exportWorkerWindow.ts), [Encerramento do worker](../../electron/domains/editorV6/exportWorkers.ts).

**Decisão para a próxima mudança:** instrumentar boca, espera de pintura e captura por trecho. Manter o bitmap e a validação do token como referência de produção. Usar o relatório para decidir se a intervenção seguinte é limitar o preparo concorrente ou eliminar readbacks descartados.

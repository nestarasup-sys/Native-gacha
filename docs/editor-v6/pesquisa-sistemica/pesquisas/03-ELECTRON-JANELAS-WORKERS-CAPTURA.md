# Pesquisa 03 — Electron: BrowserWindow, IPC, Offscreen, Paint e Captura de Quadros

**Estado da rodada aprofundada:** INVESTIGAÇÃO DE CÓDIGO E DOCUMENTAÇÃO OFICIAL CONCLUÍDA; **BENCHMARK WINDOWS, PROTÓTIPOS E PARIDADE RUNTIME PENDENTES**.  
**Data:** 06/11/2026 · **Código examinado:** `Dev-V2@9d1832b80ecea970ea60e7f229d60a8e1e0a3fe1` · **Contexto:** Native Gacha / Editor V6, mas com efeitos sobre Fabricador, Customizador, Studio, bibliotecas, persistência e build.  
**Destino do documento:** `docs/editor-v6/pesquisa-sistemica/pesquisas/03-ELECTRON-JANELAS-WORKERS-CAPTURA.md`.  
**Ligação:** [Pesquisa 02 Chromium/RenderingNG](02-CHROMIUM-BLINK-VIZ-SKIA.md) e [plano executável](../PLANO_EXECUTAVEL.md).

> **Escopo honesto de “completa”:** investigadas APIs públicas relevantes do Electron, integração real nos arquivos da branch GitHub, decisões já implementadas, custos possíveis, hipóteses falsificáveis e protocolo de testes. **Não** houve execução do app no Windows, medições novas, experimentação com texture handle nem leitura da implementação inteira em C++ do Electron/Chromium. O código local do usuário pode divergir da branch.

## 1. Objetivo, perguntas e regras de evidência

A meta não é substituir `capturePage` por outra API só porque a documentação descreve um caminho “mais rápido”. É determinar onde o V6 perde tempo entre a solicitação de frame e a escrita de BGRA no FFmpeg; preservar o pixel correto, a cor, o vídeo, os atores e o isolamento de segurança; e selecionar um protótipo que reduza o tempo **do clique até o MP4 validado**, não apenas o custo de uma micro-operação.

Perguntas que este documento investiga:

1. Quem é responsável por cada `BrowserWindow`? Quais janelas usam DOM, GPU, offscreen e preloads?
2. Qual é o protocolo exato `Main→renderer→compositor→NativeImage→FFmpeg`? Onde há dessincronização?
3. O que o Electron realmente entrega em `capturePage`, `paint`, bitmap CPU e shared GPU texture?
4. Quais bytes são gerados e copiados em uma exportação de 1920×1080/30 fps?
5. A cor sRGB, BGRA, premultiplicação e a transparência são preservadas?
6. `paint` ou textura GPU podem eliminar operações com ganho total e sem quadros errados?
7. O perfil de cabelo ON/OFF mede pré-job, movimento, renderização, captura, encode e dois workers?
8. Como cumprir segurança, sessão isolada, contexto bridge, protocolos e cancelamento?
9. Que testes existem e quais faltam para uma alteração ser segura?

Convenções: **[CÓDIGO]** inspeção estática na revisão acima; **[FONTE OFICIAL]** documentação primária realmente consultada nesta rodada; **[INFERÊNCIA]** conexão técnica coerente sem medida; **[HIPÓTESE]** possibilidade refutável; **[RELATO]** resultado fornecido pelo usuário; **[MEDIDO]** benchmark com ambiente, input, execução e artefato verificáveis. **Nenhuma nova observação [MEDIDO] é reivindicada.**

## 2. Arquitetura Electron real do Native Gacha

### 2.1 Quatro responsabilidades que não devem ser misturadas

| Subsistema | Entrada/código | Usa Electron como? | Por que existe |
|---|---|---|---|
| Janela UI principal | `electron/application/mainWindow.ts` | `BrowserWindow` visível, preload de interface, Chromium + React | Fabricador, Customizador, Studio, V6, Roteiros e bibliotecas |
| Worker de animação/bake | `electron/domains/editorV6/motionIpc.ts` | `BrowserWindow` offscreen oculta, preload próprio, lanes 1–2 | Produzir atlases de poses/transições, face e mouth; cache em memória/disco |
| Worker de frame da exportação | `electron/domains/editorV6/exportWorkers.ts` | `BrowserWindow` offscreen oculta, preload próprio, até 2 partes Turbo em paralelo | Resolver e apresentar frame SVG/Canvas/WebGL para captura BGRA |
| Main e subprocesso FFmpeg | `electron/domains/editorV6/exportIpc.ts`, `exportRunner.ts`, `exportProcess.ts` | Main coordena IPC, arquivos, buffer, ffmpeg.exe/ffprobe.exe | Codificar, juntar, validar e publicar MP4 |

**[CÓDIGO]** O `motionIpc.ts` reutiliza uma janela por lane, com fechamento após **30 segundos ociosa**; o `exportWorkers.ts` cria uma janela por worker de parte/attempt e a fecha em `finally`. O primeiro é um serviço de bake, o segundo entrega frames. Contar "workers do V6" sem distinguir seus ciclos de vida produz conclusões falsas sobre startup.

### 2.2 Processo e fronteiras de confiança

~~~text
UI React (janela principal)
   │  window.desktop / preload.ts
   ├─ chamadas de biblioteca e personagens / persistência
   └─ startExport(projectSnapshot, options, hairBundle)
      ↓ ipcMain Main + validação de origem, schema e job
exportIpc.ts → exportRunner.ts
   ├─ prepareMotions/motionIpc → BrowserWindow oculta (preload motion)
   ├─ prepare mouth loop/atlasses por trecho
   └─ createEditorV6WorkerFactory → BrowserWindow offscreen (preload export)
          │ payload/ready IPC, projeto imutável
          │ executeJavaScript(renderEditorV6ExportFrame(frame, layer, token))
          ↓ React + SVG + Canvas2D/WebGL dentro do worker
          ↓ rAF handoff + pixel token de 24 bits
          ↓ Chromium compositor (Blink/cc/Viz/Skia)
Main ← webContents.capturePage(rect: 1944×1080)
     ← NativeImage.toBitmap(scaleFactor:1) + checagem token
     ← cópia BGRA da região 1920×1080 para Buffer reutilizável
     ↓ child_process ffmpeg: stdin rawvideo bgra, 30fps
     ↓ H.264, vídeos externos, áudio, concat, ffprobe, MP4 publicado
~~~

**[CÓDIGO]** Os workers usam `contextIsolation:true`, `nodeIntegration:false`, `sandbox:true`, `offscreen:true`, `backgroundThrottling:false` e `devTools:false`. O preload de exportação expõe somente `payload()` e `ready()`; o renderer não tem acesso geral a `ipcRenderer` ou `Node Buffer`. O Main ainda valida `event.senderFrame === event.sender.mainFrame` para os canais específicos de worker.

**[FONTE OFICIAL]** Electron [Process Model](https://www.electronjs.org/docs/latest/tutorial/process-model) e [Context Isolation](https://www.electronjs.org/docs/latest/tutorial/context-isolation) explicam porque a bridge deve expor funções restritas, não o objeto completo `ipcRenderer`. O app já segue este princípio na superfície examinada, mas **isso não prova que todos os demais handlers sejam seguros**.

### 2.3 Janela principal não é equivalente à exportação

- `mainWindow.ts` aplica background throttling normal na UI, exceto harnesses sintéticos; também aguarda `flushRendererWrites` antes de fechar, para proteger dados salvos.
- `exportWorkers.ts` não usa a árvore de UI completa; carrega `editor-v6-export.html` em bundle separado e monta `SceneSurface`.
- `motionIpc.ts` carrega a rota baker via hash do HTML UI, com bridge mais ampla para ler fontes Fabricador. Não concluir que o processo de bake suporta `capturePage` como o export worker.
- Nenhuma otimização da captura pode desativar o mecanismo de fechamento com flush da janela principal ou o sandbox de outras janelas.

## 3. Mapa de arquivos do código consultado

| Arquivo | Trecho/objeto | Responsabilidade |
|---|---|---|
| `electron/application/mainWindow.ts` | `createMainWindowFactory` | BrowserWindow UI, ciclo de vida, flush e restrições |
| `electron/domains/editorV6/exportIpc.ts` | `registerEditorV6ExportHandlers` | Job, validação, owner, cancelAll, drain |
| `electron/domains/editorV6/exportWorkers.ts` | `createEditorV6WorkerFactory` | Spawn da janela offscreen, render, token, buffers |
| `electron/domains/editorV6/exportCaptureBitmap.ts` | `captureEditorV6FrameBitmap` | Verifica marca em um único readback e copia BGRA |
| `electron/domains/editorV6/exportRunner.ts` | `runEditorV6Export` / `renderAttempt` | Duas partes, ffmpeg stdin, encode, MP4, timings |
| `electron/domains/editorV6/exportProcess.ts` | `waitForExport`/`spawnExportProcess` | Timeout, abort, subprocessos |
| `electron/editorV6ExportPreload.ts` | `editorV6ExportWorker` | Bridge de 2 métodos |
| `electron/editorV6MotionPreload.ts` | `editorV6MotionWorker` | Bridge de bake e leituras Fabricador |
| `electron/domains/editorV6/motionIpc.ts` | `createEditorV6MotionService` | Lanes reutilizadas, schema, cache e abort |
| `electron/domains/editorV6/prepareMotions.ts` | preparação de atlas | Paralelismo e métricas de precompute |
| `src/renderer/src/features/editorV6/exportWorker.tsx` | `renderEditorV6ExportFrame` | Frame lógico, SVG/Canvas/WebGL, rAF e token |
| `src/renderer/src/features/editorV6/SceneSurface.tsx` | `SceneSurface` | SVG e foreignObject, frames visualmente corretos |
| `src/shared/editorV6Export.ts` | `EditorV6FrameTimings`, keys | Reuso e métricas entre processos |
| `electron/domains/mediaLibrary/mediaFileResponse.ts` | `createMediaFileResponse` | HTTP Range para áudio/vídeo autorizados |
| `electron/windowResourcePolicy.ts` | `restrictRendererResources` | Lista de recursos permitidos na sessão |
| `electron/windowNavigation.ts` | `restrictRendererNavigation` | Bloquear navegação/popups |
| `electron/windowPermissions.ts` | `restrictRendererPermissions` | Check e prompt de permissões |
| `electron/application/rendererContentSecurityPolicy.ts` | CSP | Política de fontes no renderer |

**Verificação:** os arquivos acima foram examinados na `Dev-V2` do GitHub. **Linhas podem mudar** em commits posteriores; referências imutáveis estão no capítulo 23.

## 4. Ciclo de vida detalhado da BrowserWindow de exportação

### 4.1 Criação

`createEditorV6WorkerFactory` cria janelas com:

- `show:false`; `frame:false`; `useContentSize:true`;
- `width=payload.width+24` (faixa lateral do token) e `height=payload.height`;
- `enableLargerThanScreen:true` para 1944×1080 acima da área útil de certos monitores;
- `transparent:layeredVideo` e `backgroundColor:'#00000000'` somente se vídeo externo exige captura em camadas;
- `preload` separado, sandbox, no Node, contextIsolation;
- `offscreen:true` com **shared texture não habilitada**;
- `backgroundThrottling:false`, `devTools:false`;
- `partition:'editor-v6-export-'+crypto.randomUUID()` sem prefixo `persist:`.

**[FONTE OFICIAL]** [session.fromPartition](https://www.electronjs.org/docs/latest/api/session): sem `persist:`, partição é **em memória**; logo cada janela da exportação possui cache/cookies/contexto isolados e não deve compartilhar livremente assets decodificados com a janela anterior. Reusar a mesma sessão pode mudar o resultado de benchmark (cache warm), além de sua fronteira de confiança.

### 4.2 Configuração, carregamento e ready

1. Registrar protocolo local `gacha-editor-media`, quando projeto possui mídia autorizada.
2. Restringir navigation, permission requests e recursos da sessão.
3. Ajustar content size para não sofrer clamp silencioso do Windows.
4. `window.webContents.setFrameRate(60)` para a janela offscreen.
5. Registrar entrada `Map<webContents.id,{payload, ready}>` para bridge.
6. Abrir HTML local ou URL dev dedicada, com timeout `60_000 ms`.
7. Esperar `worker.ready()` vindo do preload, também com timeout.
8. Ajustar `setZoomFactor(1)`.
9. Expor função `worker.frame(frame)` e `worker.close()` ao Main.

**[INFERÊNCIA]** Startup e carregamento de imagens podem ser relevantes quando Turbo cria duas janelas e exportações curtas repetem trabalho. Medir `workerStartupMs` por parte (já existe) antes de sugerir pool de BrowserWindows.

### 4.3 Reuso durante e depois

- **[CÓDIGO]** Há reuso de `frameBitmap` / `layeredBitmap` dentro do worker, mas não reuso da BrowserWindow entre jobs independentes.
- O frame HTML mantém mapas de imagens/rigs/canvases e um contexto WebGL durante sua vida; fechar o worker libera a sessão e evita cache stale entre revisões de personagem.
- `window.once('closed', close)` e `signal.addEventListener('abort', close, {once:true})` encerram o worker em fechamento/abort.
- `close()` é idempotente, limpa `entries`/`activeWorkers`, mantém até 128 ids aposentados e destrói a janela.
- `factory.dispose()` fecha workers restantes e remove os handlers de payload/ready.

**[HIPÓTESE]** Pool de workers entre trechos da **mesma exportação** pode poupar startup e textura, mas precisa reset rigoroso do payload/projeto/atlas, token, imagens e sessão. Não se recomenda cache entre exports sem versão completa dos recursos. Primeiro provar que startup é parte dominante.

## 5. Protocolo exato para pedir um frame

### 5.1 Main solicita

O Main executa, por `webContents.executeJavaScript`, uma função global de nome estável:

~~~text
window.renderEditorV6ExportFrame(frameAbsoluto, layer, paintToken)
~~~

- `frameAbsoluto` é convertido com `Math.round`; não é o tempo da GPU, nem o número de `paint` recebidos.
- `layer` é `undefined`, `background` ou `foreground` no caso de vídeo externo.
- `paintToken` é contador positivo de 24 bits controlado pela janela.
- A chamada retorna `EditorV6RenderFrameResult` com `reused`, `layerReused`, timings e métricas.
- O tempo para aguardar esta chamada vira `ipcDrawMs`, mas contém **JS + React + espera de imagens + rAF**; não é "custo de serialização IPC puro".

### 5.2 Renderer produz e sinaliza

`exportWorker.tsx`:

1. Reusa o resultado bruto `resolveEditorV6SceneAtFrame` quando o frame absoluto não mudou (captura em duas camadas).
2. Aplica mouth loop e compara visual keys; faz skip se o frame realmente não mudou.
3. Compõe rosto/cabelo quando necessário; usa caches e conta `hairRasterFrames`/`hairRasterPixels`.
4. Decodifica assets referenciados (cache temporário de promessas) antes de montar SVG.
5. Usa `flushSync(() => root.render(<SceneSurface ...>))`, preservando frame exato no DOM.
6. Aguarda carregamento de imagens SVG visíveis.
7. Atualiza 24 células do token numa faixa lateral fora do conteúdo do MP4.
8. Aguarda um único `requestAnimationFrame` como handoff ao ciclo de pintura.
9. Devolve timings e métricas ao Main.

**[FONTE OFICIAL]** A execução de JS/DOM e o compositor são assíncronos; `flushSync` garante um commit React síncrono, não que Viz apresentou pixels. Por isso o **token confirmado no bitmap** é uma garantia mais forte que aguardar apenas rAF.

### 5.3 Reuso de frame vs captura legítima

- `reused:true` impede recapturar um frame com visual key idêntica, mas **o FFmpeg continua recebendo o mesmo quadro** no respectivo frame lógico. Não equivale a pular quadros do MP4.
- No caso `layerReused:true`, uma camada pode permanecer no `layeredBitmap` enquanto a outra é recapturada.
- Visual keys usam cena, elementos e estado capilar; em reação de pose, o frame é parte da chave quando há movimento.
- A necessidade de mudar boca/rosto/vídeo impede reuso total legítimo, mesmo quando cabelo está parado.
- **[HIPÓTESE]** Quando esse outro elemento muda, o custo de recompôr personagem inteiro talvez seja eliminável com camadas RGBA independentes — é problema do compositor, não solução garantida do Electron.

## 6. O token de pintura: garantia que deve sobreviver à refatoração

### 6.1 Formato e validação

O renderer cria um `div` fixo, `left=width`, `width=24`, `height=16`; cada bit entre 0 e 23 vira uma célula 4×4, branca ou preta, num grid 6×4.

O Main captura `rect{x:0,y:0,width:width+24,height}` e passa `NativeImage` para `captureEditorV6FrameBitmap`.

**[CÓDIGO]** O extrator:

- verifica dimensões recebidas, ausência de overflow e tamanho do destino;
- chama **`toBitmap({scaleFactor:1})` uma única vez** (código já otimizado);
- lê 24 bits no canal vermelho `BGRA + 2` da própria imagem que vai alimentar o FFmpeg;
- rejeita célula com alpha menor que 254, geometria inesperada ou token incompatível;
- copia `width×height×4` bytes para Buffer próprio ou reutilizável, linha por linha, eliminando 24 pixels extras da borda.

**Consequência:** não é seguro trocar o extrator por uma cópia BGRA arbitrária, aceitar `paint` antigo ou remover o token "para eliminar espera" — isso pode exportar quadro atrasado sem disparar erro visível na maioria das cenas.

### 6.2 Retentativa e invalidação

`capturePaintedFrame` tenta capturar, valida token, e **somente se a captura vier obsoleta** chama `webContents.invalidate()` e espera `FRAME_CAPTURE_RETRY_MS=16` por padrão (o harness pode ajustar).

- Timeout total: até `60_000 ms` (timeout de cada operação de captura também passa por `waitForExport`).
- Contadores: `captureReadbacks`, `captureStaleReadbacks`, `capturePageMs` e `captureBitmapMs`.
- Não há assinatura `webContents.on('paint')` no caminho de produção do export worker; evento `paint` é alternativa, **não o mecanismo atual de confirmação de frame**.

**[FONTE OFICIAL]** `webContents.invalidate()` agenda repaint completo e, quando offscreen, gera um novo evento paint. É uma retentativa de apresentação, não recálculo dos 120Hz de cabelo nem alteração da timeline.

### 6.3 Possível limitação do próprio token

**[HIPÓTESE]** O token ocupa uma pequena área extra e precisa mudar a cada frame. Ele pode provocar pintura mesmo quando só se deseja imagem estática, mas a estratégia é intencional para distinguir frames. Um substituto pode usar um contador/fence de compositor somente se for **tão verificável quanto pixels da mesma captura**. Não otimizar removendo a verificação e aguardando um tempo arbitrário.

## 7. Captura única: NativeImage, color space e custos de bytes

### 7.1 A API real

**[FONTE OFICIAL]** [webContents.capturePage](https://www.electronjs.org/docs/latest/api/web-contents) retorna `Promise<NativeImage>`. Aceita `rect` e opções `stayHidden`/`stayAwake`. O V6 usa a região explícita e **não passa as opções**.

O Electron informa que a página pode ser considerada visível enquanto possui capturer ativo, mesmo se a BrowserWindow estiver oculta. **Não há prova** de que passar `stayHidden:true` acelerará o V6; na prática pode mudar agendamento/composição e precisa de teste isolado.

### 7.2 NativeImage.toBitmap: detalhe de fidelidade de cor

**[FONTE OFICIAL]** A partir do **Electron 43**, `NativeImage.toBitmap()` **normaliza os pixels para sRGB por padrão**, salvo `colorSpace` explícito. A API retorna uma **cópia** de bytes brutos, não view zero-copy.

**[CÓDIGO]** `exportCaptureBitmap.ts` usa somente `{scaleFactor:1}`, não informa `colorSpace`. No Electron atual isso implica conversão para sRGB por padrão conforme a documentação, antes de alimentar FFmpeg.

**[IMPLICAÇÃO IMPORTANTE]** Trocar captura por shared texture, `paint`, WebGL readPixels ou NV12 sem replicar a transformação de espaço de cor pode mudar tons de pele, cabelo, sombras e cores, mesmo preservando dimensões/codec. Comparar valores RGBA **pré-H.264** e metadata do espaço de cor; não declarar paridade apenas porque "ambos saíram 1080p".

### 7.3 Aritmética de largura de banda — não é benchmark

| Caso 1920×1080 | Conta | Bytes | MiB aproximados |
|---|---|---:|---:|
| Cena BGRA sem token | 1920×1080×4 | 8.294.400 | 7,91 |
| `capturePage` com token | 1944×1080×4 | 8.398.080 | 8,01 |
| Cópia adicional da faixa/token por captura | 24×1080×4 | 103.680 | 0,099 |
| 300 frames em um stream BGRA | 300×8.294.400 | 2.488.320.000 | 2.373 |
| 300 frames com background/foreground | 300×2×8.294.400 | 4.976.640.000 | 4.746 |
| Dois buffers combinados de layer em uma lane | 2×8.294.400 | 16.588.800 | 15,82 |

**[NOTA]** Dois streams de layer correspondem ao modo com **vídeo externo**, e não automaticamente a todas as exportações. Em 10s, os gigabytes acima são **bytes acumulados escritos/transferidos**, não pico de memória. Duas lanes Turbo mantêm buffers simultâneos, mas cada uma processa apenas seus frames. Além desses buffers existem superfícies GPU, `NativeImage`, decoders e canvases.

O retângulo de captura 1944×1080 adiciona cerca de 103,7 KB por readback, mas esse overhead é pequeno perante o quadro inteiro; **reduzir 24px não elimina o custo principal**, e pode perder a garantia de frameId.

### 7.4 A cópia explícita no código

A captura atual implica, no mínimo:

1. aquisição de `NativeImage` em Electron (origem e cópia GPU→CPU dependem do backend);
2. chamada de `NativeImage.toBitmap()`, que entrega uma **cópia** de bitmap;
3. uma cópia por linha da região da cena `1920×1080` para o Buffer reutilizável.

**[INFERÊNCIA]** Há custo potencial de readback mais pelo menos uma cópia de buffer, mas **não** se deve afirmar número exato de transferências CPU↔GPU internas sem trace. As operações estão contabilizadas em `capturePageMs` e `captureBitmapMs` e podem ser mais ou menos relevantes que o custo de recompor cabelos.

## 8. Exportação com vídeo externo: duas camadas e uma captura por layer

**[CÓDIGO]** `exportRunner.ts` prepara modo `layeredVideo` quando há mídia de vídeo externa na composição. O worker:

1. desenha e, se preciso, captura `background`;
2. desenha `foreground` no **mesmo frame lógico**; valida que o estado geral não mudou;
3. captura apenas se a camada não foi reutilizada;
4. grava os dois bitmaps num **único Buffer reutilizável** de tamanho `2×height` — sem buffer intermediário de 8MB por camada;
5. entrega ao FFmpeg uma entrada `rawvideo bgra 1920×2160`;
6. filtros FFmpeg fazem `crop` em metade superior/inferior, compõem vídeo externo e sobrepõem foreground antes do H.264.

**[INFERÊNCIA]** O caso `layeredVideo` pode exigir duas chamadas de captura por quadro mutável e dobrar volume BGRA; essa não é uma falha óbvia: preserva vídeo **entre fundo e foreground do Editor**. Um backend que capture uma única imagem achatada perderia essa ordenação se não reproduzir o overlay no lugar correto.

**Gates:** duas capturas do mesmo frame absoluto, token por layer, alpha correto, mesmas dimensões, sem frame obsoleto e mídia externa com PTS/duração idênticos.

## 9. Modos offscreen oferecidos pelo Electron

### 9.1 Matriz de modos: usado, disponível, não comprovado

| Modo | Configuração | Característica oficial | Estado no Native Gacha |
|---|---|---|---|
| GPU + bitmap CPU | `offscreen:true` / `useSharedTexture:false` | Composição GPU; pixels disponíveis via `NativeImage`, com caminho GPU→CPU | **USADO no worker de exportação** |
| GPU + evento `paint` | `webContents.on('paint')` sem shared texture | Entrega evento/`dirtyRect` e `NativeImage`; ainda há bitmap CPU | **NÃO USADO no exportador padrão** |
| GPU shared texture | `offscreen:{useSharedTexture:true}` | Entrega handle GPU (experimental), pode evitar readback se pipeline consumir GPU | **NÃO USADO; exige integração específica** |
| Software output device | `app.disableHardwareAcceleration()` | Render pela CPU; sem GPU que sustente WebGL do cabelo da mesma forma | **NÃO É SUBSTITUTO DIRETO PARA O V6 COM WEBGL** |
| `webContents.stopPainting` | API offscreen | Suspende emissão de paint; pode conservar recursos em repouso | **NÃO USADO; experimento restrito** |
| `capturePage({stayHidden:true})` | Opção de captura | Evita tornar página oculta "visível" ao capturer | **NÃO USADO; efeitos a verificar** |

**[FONTE OFICIAL]** O Electron afirma que no offscreen sem sharedTexture a cadência permitida é 1–240 e quando nada na página muda nenhum frame é gerado. Logo não existe equivalência entre `setFrameRate(60)` e captura de 60 imagens por segundo nem garantia de 60 paint events em repouso.

### 9.2 Por que simplesmente desabilitar GPU provavelmente não serve

O app usa `getContext('webgl')` para deformar cabelo no export worker. O modo software output da documentação depende de desabilitar aceleração de hardware para o app inteiro e pode desativar/alterar o WebGL. Sem reimplementação correta da malha, isso é **uma mudança de funcionalidade**, não otimização de captura equivalente.

## 10. Alternativa A — `paint` e `dirtyRect`

### 10.1 O que a API promete e o que não promete

**[FONTE OFICIAL]** `webContents.on('paint', (event, dirtyRect, image))` é emitido quando a página gera novo frame. O evento contém `dirtyRect` e `NativeImage`.

**Nuance da própria documentação:** a descrição chama `image` de "imagem de toda a frame", enquanto outra frase explica que "apenas área suja é passada no buffer". Portanto, **não codificar a interpretação do retângulo por suposição**. No primeiro laboratório verificar `getSize()`, `dirtyRect`, DPI, alpha e se a imagem corresponde ao viewport todo ou à região atualizada **na versão real do Electron**.

### 10.2 Diferença operacional para o pipeline atual

`capturePage` é **pull**: Main pede imagem depois de saber qual token deseja. `paint` é **push**: Chromium emite eventos conforme atualiza a janela.

Um adaptador robusto para `paint` precisa de:

1. fila limitada de pedidos `{frame,layer,token}`;
2. última imagem composta completa ou cache de dirtyRect com dimensão fixa;
3. região do token capturada/validada **no mesmo estado visual** da cena;
4. descarte de eventos mais antigos, duplicados ou fora de ordem;
5. conhecimento de colorSpace/pixelFormat e DPR;
6. validação de resize, background transparente, duas lanes e vídeo em duas layers;
7. cancelamento e cleanup de listener após erro;
8. tratamento de `invalidate()` explícito somente onde necessário.

**[HIPÓTESE]** Paint pode reduzir latência quando já está emitindo buffers CPU suficientes; mas também pode gerar eventos extras e processar um bitmap inteiro por cada rAF, elevando RSS. A documentação não prova vitória sobre `capturePage` no V6.

### 10.3 Critério de refutação

Se o baseline indicar `capturePageMs+captureBitmapMs` pequeno em relação ao total de 50s, **não priorizar o port**. Se a versão `paint` produzir imagem desatualizada, alpha errado ou pior tempo total, rejeitar mesmo que `paint` isolado seja mais rápido.

## 11. Alternativa B — shared texture GPU offscreen

### 11.1 O que exatamente é compartilhado

**[FONTE OFICIAL]** `offscreen.useSharedTexture:true` é experimental e expõe `event.texture` no `paint`. O objeto `OffscreenSharedTexture` traz:

- `textureInfo.widgetType`, `pixelFormat` (`rgba`, `bgra`, `rgbaf16`);
- `codedSize`, `visibleRect`, `contentRect`, `colorSpace`;
- `timestamp`, metadados opcionais como `frameCount` e `captureUpdateRect`;
- `handle` específico da plataforma;
- `release()` que deve ser chamado após consumo.

A textura **não é um `Buffer` JS nem pode ser passada inteira por IPC arbitrário**; a documentação permite transmitir `textureInfo`, enquanto o receptor precisa gerenciar os handles/lifetime corretamente. O recurso é limitado em quantidade.

### 11.2 Requisito para realmente acelerar o V6

Se o encoder continuar sendo o padrão `libopenh264` via `rawvideo BGRA`, em algum ponto será necessária conversão de textura para bytes CPU. Isso pode só deslocar o readback e complicar sincronização.

O ganho teórico maior viria de uma cadeia validada como:

~~~text
Chromium Viz texture
  → handle/texture GPU sincronizado
  → compositor/transform GPU (quando necessário)
  → encoder de hardware compatível (D3D11/AMF/Media Foundation)
  → H.264
  → mux/áudio/validação final
~~~

**[HIPÓTESE]** Esse caminho pode eliminar parte do tráfego GPU→CPU, mas depende de compatibilidade de formatos, driver, encoder, sincronismo, API nativa e vídeo/foreground. **Não está implementado no Native Gacha**.

### 11.3 API experimental adicional: `sharedTexture`

**[FONTE OFICIAL]** O Electron também documenta o módulo experimental [`sharedTexture`](https://www.electronjs.org/docs/latest/api/shared-texture), capaz de **importar handles de textura compartilhada para Electron**, criar representações `VideoFrame` e enviá-las a renderers com API específica. Isso **não** significa automaticamente que:

- o `OffscreenSharedTexture` emitido pelo `paint` se converte sem trabalho num `VideoFrame` da aplicação;
- exista encoder H.264 zero-copy disponível e configurado;
- o MP4 de 2 layers possa ser produzido sem a lógica de overlay;
- o módulo elimine a necessidade de lógica de importação/exportação/sincronização no Windows.

Registrar como **variante exploratória separada** (`ELE-TEX-02`), não como feature pronta. O tutorial offscreen continua descrevendo integração avançada com módulo nativo para consumir textura em pipeline externo.

### 11.4 Custo de engenharia e falhas

- Importar handle GPU e validar adapter/driver e `pixelFormat`.
- Sincronizar producer/consumer: uso de texture antes de concluir o desenho gera conteúdo obsoleto/rasgado.
- Liberar em todos os caminhos `success`, `abort`, `timeout`, `render-process-gone` e `app shutdown`.
- Limitar simultaneamente texturas em voo entre duas lanes.
- Validar alpha/colorSpace e conversão BT.709 para o encoder.
- Construir fallback CPU com mesmo frame lógico e qualidade.
- Testar Windows portátil (ABI, DLLs, módulos nativos, driver AMD).

**Critério:** só considerar após `CAPTURE-BASE-001` mostrar tempo de captura dominante **e** provar redução de tempo de ponta a ponta no MP4 final.

## 12. Alternativa C — Outras APIs Electron e suas reais limitações

| API | Capacidade oficial | Aplicação possível | Armadilha |
|---|---|---|---|
| `capturePage(rect)` | Captura região do documento | Caminho atual, frame token | Bitmap CPU, readback e cópia |
| `paint` | Evento offscreen por atualização | PoC push com dirtyRect | Ordem do token e frame obsoleto |
| `webContents.invalidate()` | Solicita pintura completa | Retentativa após capture stale | Forçar sempre pode aumentar carga |
| `startPainting/stopPainting` | Controle de emissão em offscreen | Pausar nos intervalos ociosos | Interromper sincronização/asset loading |
| `setFrameRate` | Limita cadência de pintura offscreen | A/B 30/60/90 com token | Não muda fps final, 30 não é garantidamente melhor |
| `getFrameRate` | Consulta limite configurado | Registrar build/diagnóstico | Não mede fps apresentado |
| `capturePage stayHidden` | Política de visibilidade do capturer | PoC em janela invisível | Pode alterar agendamento/gerar frames ausentes |
| `backgroundThrottling` | Evita reduzir timers em background | Já desligado no worker de export | Trocar pode tornar rAF lento ou suspenso |
| `session.fromPartition` | Sessões separadas ou persistentes | Isolamento, cache da execução | Reusar sessão muda perfil cold/hot e privacidade |
| `contentTracing` | Trace Chromium multiprocesso | Identificar Viz/CPU/GPU e stalls | Trace tem overhead e inclui dados de processos |
| `webContents.debugger` | Chrome DevTools Protocol | Harness diagnóstico controlado | Acesso privilegiado e interferência no frame clock |
| `sharedTexture` experimental | Importar textura para `VideoFrame` | Spike de pipeline GPU | Não é exportador MP4 completo |

## 13. Segurança e propriedade do dado: impacto no app inteiro

### 13.1 Sessões isoladas e protocolos de mídia

**[CÓDIGO]** O worker cria partição efêmera aleatória; registra `gacha-editor-media` **nessa sessão** e somente quando a exportação precisa de mídias autorizadas. O protocolo valida hostname `project`/`library`/`asset`, projeto, IDs e caminhos.

`electron/windowResourcePolicy.ts` restringe recursos a arquivos do pacote e schemes explícitos; `windowNavigation.ts` nega novas janelas e navegação; `windowPermissions.ts` nega permissões não previstas.

**[IMPLICAÇÃO]** Compartilhar `session.defaultSession` com UI ou trocar protocolo por `file://` amplo para “reaproveitar cache” muda segurança e integridade dos arquivos. Prefira cache de artefatos autorizados por versão, com chaves de revisão, em vez de compartilhar todo contexto Chromium.

### 13.2 Preloads distintos

- `electron/preload.ts`: bridge ampla da interface, funções tipadas.
- `electron/editorV6ExportPreload.ts`: bridge estreita de payload/ready.
- `electron/editorV6MotionPreload.ts`: bridge de bake e leituras autorizadas Fabricador.

**[CÓDIGO]** `motionIpc.ts` valida remetente, usa schemas Zod e checa que atlas corresponde à requisição, amostras e orçamento de pixels. **Não** é seguro pular essas checagens para aquecer cache ou aceitar resultado de outro worker.

### 13.3 IPC e serialização de imagem

**[FONTE OFICIAL]** Electron IPC usa o `Structured Clone Algorithm`; tipos DOM, `ImageBitmap` e objetos Electron/Node com handle nativo não são arbitrariamente serializáveis para Main. O código atual só envia payloads de projeto/atlas compatíveis com o bridge, e usa `capturePage` diretamente no Main para obter `NativeImage`.

**[HIPÓTESE]** Enviar uma imagem gigante `Uint8Array` do renderer ao Main via IPC como alternativa simples ao `capturePage` pode multiplicar cópias, pressão GC e overhead, sem reduzir tempo do compositor. Só avaliar com microbench **mais** tempo total.

## 14. Cancelamento, erro, falha de processo e teardown

### 14.1 O que já existe

- `AbortController` por job e ligado ao fechamento da janela que iniciou a exportação.
- `waitForExport` aplica timeout e rejeição/abort, remove listeners.
- `exportRunner` encerra FFmpeg e fecha worker em `finally`.
- `exportWorkers` fecha BrowserWindow de forma idempotente, limpa mapas e listeners e invalida ready pendente.
- `factory.dispose` remove handlers de worker.
- `motionIpc` valida retornos Zod, mantém filas limitadas, cache/hits/misses e fecha janela de lane ociosa.
- Testes existentes exercitam fechamento externo e cancelamento durante token stale.

### 14.2 Riscos que ainda precisam de testes runtime

- O caminho lido de `exportWorkers.ts` não registra explicitamente `render-process-gone`; erros podem ser detectados pelo fechamento/timeout. **Não significa bug comprovado**. Uma otimização futura pode detectar falha mais cedo, mas precisa seguir lifecycle e não publicar MP4 parcial.
- `paint` adicionaria listeners e buffers assíncronos; devem ser limpos em `abort`, window destroy, timeout e parada do app.
- Shared texture requer `release()` mesmo em erro. Não encerrar Main enquanto texture handle ainda tem referências pendentes.
- Se `close()` ocorrer entre `draw` e `capture`, a captura não deve ser considerada válida só porque `reused` era true.
- Quando vídeo externo gera duas camadas, toda falha deve descartar o frame combinado — nunca reutilizar somente background ou foreground de outro frame.

**[INFERÊNCIA]** Melhor recuperação de falhas pode diminuir latência no pior caso, mas não necessariamente a média; medir separadamente resiliência e throughput.

## 15. Testes automatizados JÁ EXISTENTES

**[CÓDIGO]** Os seguintes testes/scripts estão presentes na branch examinada; **não foram executados nesta rodada**.

| Teste / arquivo | O que verifica no código da suíte | Tipo |
|---|---|---|
| `tests/editor-v6/exportCaptureBitmap.test.ts` | Um `toBitmap`, token BGRA correto, cópia de linhas, destino reutilizável, alpha e geometria inválida | Unit |
| `tests/editor-v6/exportWorkers.test.ts` | Criação/close, `dispose`, token stale com retry, modo 8ms, cancelamento e falta de ready | Mock Electron |
| `tests/editor-v6/motionRendererSecurity.test.ts` | Sessão efêmera por lane, permissão/recurso restritos no worker de movimento | Mock Electron |
| `tests/editor-v6/rendererSecurityPolicy.test.ts` | CSP e HTMLs, HMR loopback, origem confiável | Unit |
| `tests/diagnostic-capture.test.mjs` | Captura de diagnósticos sem vazamento de dado bruto | Unit/integration |
| `scripts/editor-v6/test-stress-offscreen.cjs` | Stress de **prévia UI** em janela offscreen com CDP e cenário sintético | Harness Electron |
| `docs/editor-v6/TESTES_DE_ESTRESSE_OFFSCREEN.md` | Relatório histórico de **26/10/2026**, não benchmark de export com cabelo | Evidência histórica, não atual |

### 15.1 Cuidado com o teste de estresse da prévia

O harness `test-stress-offscreen.cjs` usa `GACHA_VIDEO_STRESS_OFFSCREEN`, janela UI sintética e CDP; **não é o mesmo pipeline** da BrowserWindow isolada do exportador que passa por `captureEditorV6FrameBitmap`. Seus relatórios de RAF/long tasks/DOM não comprovam custo da captura BGRA de exportação.

### 15.2 Lacunas claras da cobertura

- `paint` com dirtyRect + token e imagem completa/parcial em Electron Windows real;
- `stayHidden` e `getFrameRate()` em hidden window e DPI monitor alto;
- `toBitmap colorSpace` e regressão de tons de pele/alpha;
- `render-process-gone` com timing e buffer ainda em uso;
- sharedTexture/`release()`/driver/VRAM no portátil;
- dois workers Turbo simultâneos, 300 frames, layeredVideo de vídeo externo e áudio, CPU H.264;
- benchmark frio com preparo capilar anterior ao job.

Nenhuma dessas lacunas justifica alterar produção antes de construir fixtures e medir.

## 16. Estratégia de profiling que atribui custo a uma operação

### 16.1 Baseline antes do trace

1. Cópia isolada/consentida do mesmo projeto de 10 segundos, incluindo refs de Fabricador/Customizador e mídias.
2. Confirmar branch, SHA/dirty, Electron/Chrome/Node versions, Windows, CPU, driver AMD, RAM/VRAM e ffmpeg.exe.
3. Preservar 1920×1080, 30fps, Turbo 2×, encoder CPU, mouth loop, mesmos trechos e mesmos assets.
4. A/B cabelo ON/OFF com 3+3 repetições, cache frio comparável e warm separado.
5. Medir **clique→MP4 validado**, incluindo `prepareEditorV6HairMotionBundle` anterior ao Main. A diferença relatada 50s/9s é [RELATO], não medida nesta rodada.

### 16.2 Métricas por fase e unidade correta

| Medida do projeto | O que mede | O que NÃO mede |
|---|---|---|
| `workerStartupMs` | Spawn, HTML/preload, ready e images iniciais | Composição por frame |
| `ipcDrawMs` | Tempo aguardando `executeJavaScript` do frame | Só serialização IPC |
| `sceneResolutionMs` | Resolver estado lógico JS | Pintura da página |
| `faceCompositionMs` | Preparação facial | Captura completa |
| `hairCompositionMs` | Composição cabelo/camadas | GPU concluída |
| `hairCanvasBlitMs` | Tempo JS de `drawImage` mesh→Canvas | Contagem de readbacks GPU internos |
| `reactCommitMs` | `flushSync` do React | Viz presented |
| `rafWaitMs` | Handoff até requestAnimationFrame | Garantia de frame confirmado |
| `capturePageMs` | `capturePage(rect)` | `toBitmap` e cópia posterior |
| `captureBitmapMs` | `toBitmap`, token e copiar linhas | Encode H.264 |
| `captureReadbacks` | Número de tentativas `capturePage` | Frames lógicos do vídeo |
| `captureStaleReadbacks` | Capturas com token antigo | Frames com cabelo ativo |
| `ffmpegWriteMs` | Callback de escrita no pipe `stdin` | CPU do encoder isolada |
| `frameRoundTripMs` | Espera do Main pelo frame | Total de exportação |
| `hairRasterFrames/Pixels` | Superfícies/área raster montadas | Área real de tile Chromium |

**[REGRA]** Em Turbo 2×, duas partes rodam em paralelo; soma de tempos de duas lanes é trabalho acumulado, não tempo de parede. Para contraste ON/OFF, usar timing bruto por fase e tempo de botão até arquivo final.

### 16.3 Trace de Chromium/Electron

**[FONTE OFICIAL]** `Electron contentTracing` registra trace **Perfetto protobuf**, não JSON legado na documentação atual. Após `app.whenReady()`:

- `getCategories()` para descobrir categorias disponíveis no build;
- `startRecording({included_categories:[...]})` com categorias realmente suportadas;
- executar fixture isolada 0/1/várias reações;
- `stopRecording(path)` e abrir no Perfetto UI;
- correlacionar JS, Blink, cc, Viz, GPU, readback e scheduler.

**Ressalvas:** trace multiprocesso tem overhead e pode conter dados sensíveis de paths/sites; não publicar bruto. Se não houver eventos GPU, registrar "não observável", não preencher números arbitrários. Não executar tracing simultaneamente aos 3+3 baselines sem trace.

## 17. Hipóteses de desempenho — classificação e refutação

| ID | Hipótese | Evidência favorável procurada | Critério para refutar ou reduzir prioridade |
|---|---|---|---|
| ELE-01 | Pre-job hair domina 41s extras | `hairPreparation` alto antes do worker | Hair prep pequeno; diferença no worker |
| ELE-02 | `capturePage` custa muito | `capturePageMs` dominante por quadro | Capture pequeno/constante nas duas condições |
| ELE-03 | `toBitmap` + cópia por linha pesa | `captureBitmapMs` expressivo e `NativeImage` readback | Cópia pequena frente ao raster |
| ELE-04 | Token stale força retries | `captureStaleReadbacks` alto | Stale ~0 sob carga normal |
| ELE-05 | `ipcDrawMs` é dominado por React/Canvas | Draw alto com capture pequeno | Draw baixo e encoder gargalo |
| ELE-06 | Worker startup domina vídeo curto | `workerStartupMs` grande por parte | Startup baixo e consistente |
| ELE-07 | `paint` pode evitar captura pull | PoC mesma imagem com menor tempo | DirtyRect/stale/p95 pior ou perda de pixels |
| ELE-08 | shared GPU texture/AMF evita readback | Processo completo GPU→codec sem CPU copy | CPU H.264 ainda requer bytes/driver instável |
| ELE-09 | Duas lanes competem por GPU | 2× mais lento/pior que 1× no mesmo job | 2× reduz tempo total sem p95/memória excessiva |
| ELE-10 | Sessão efêmera gera repetição de Image.decode | Decoding/startup por worker significativo | Asset prep amortizado/negligenciável |
| ELE-11 | Revisão de colorSpace altera visual | Pixel diff quando bypass sRGB | Cor igual após conversão explícita |
| ELE-12 | Render process crash atrasa erro | Timeout de 60s após crash simulado | Tratamento atual detecta cedo |

**Ranking provisório:** ELE-01/02/03/05 primeiro, condicionados a baseline; ELE-07 somente se captura for importante; ELE-08 último devido a alto custo de engenharia e hardware.

## 18. Plano de experimentos completo, com entradas e saídas

### ELE-T0 — Capacidades e identidades de build

**Entrada:** fixture sintética; sem userData real.

- Registrar `process.versions`, `app.getGPUFeatureStatus()`, `webContents.isOffscreen()`, `getFrameRate()`, `getZoomFactor()`, `session.isPersistent()`.
- Registrar encoder padrão FFmpeg e binário empacotado, versão Windows, CPU/GPU/driver.
- Conferir `NativeImage.toBitmap` com colorSpace default e estratégia de referência; registrar DPI/scaleFactor.
- **Aceite:** matriz precisa de recursos realmente disponíveis; sem presumir API por documentação "latest".

### ELE-T1 — Perfil de quadro no caminho atual

**Entrada:** 150 e 300 frames 1080p30, cabelo ON/OFF, 1/2 lanes, sem vídeos externos.

- Reutilizar métricas do V6; capturar `workerStartupMs`, `ipcDrawMs`, `capturePageMs`, `captureBitmapMs`, retries, RSS, wall-clock.
- 3+3 runs em cache comparável; validar H.264/áudio/quadros com ffprobe.
- **Aceite:** identificar quanto do tempo total é pre-job, desenho, captura ou ffmpeg; sem alterar pixels.
- **Refutação:** se captura não pesa, não priorizar `paint`.

### ELE-T2 — `paint` sem textura compartilhada

**Entrada:** PoC isolada na mesma revisão/asset/driver, 150 frames e depois 300.

- Confirmar geometria de `dirtyRect` e `NativeImage.getSize`; criar buffer acumulador se necessário.
- Comprovar token de pixels **do mesmo frame/layer**; testar reordenação, frames duplicados, resize, no paint, abort.
- Comparar p50/p95 por quadro, memória, extra paint events, total até MP4.
- **Aceite:** paridade BGRA, 0 stale exportados, melhora no tempo total e estabilidade.
- **Rejeitar:** sucesso apenas em canvas sem vídeo, pois layeredVideo é requisito do V6.

### ELE-T3 — Trocar apenas estratégia de captura `stayHidden`

**Entrada:** dois modos `capturePage` no laboratório, mesmos frames e recursos.

- A/B com e sem `stayHidden:true`, backgroundThrottling igual, token/RAF e mesmo screenshot.
- Registrar visibilidade, paint events, captura stale, latency, DPI, alpha.
- **Aceite:** imagem válida em todos os quadros e ganho total comprovado; caso contrário manter default.

### ELE-T4 — Cadência offscreen `30/60/90`

**Entrada:** V6 sintético 300 frames, token e condições idênticas.

- Variar somente `setFrameRate`, registrar `getFrameRate`, rAF wait, capture retries e tempo total.
- **Aceite:** mesma contagem/fps no MP4 e nenhuma regressão; se 30 aumentar stale/latência, rejeitar.
- **Nota:** `setFrameRate(30)` NÃO faz MP4 de 30fps "mais correto"; isto já é controlado pela timeline/FFmpeg.

### ELE-T5 — Shared texture GPU sem encoder novo

**Entrada:** fixture GPU de laboratório com device validado e render simples.

- Criar janela com `offscreen:{useSharedTexture:true}`, observar metadados e eventos; importar handle com API nativa/`sharedTexture` quando suportado.
- Testar `release()` em sucesso, erro, abort, resize, context loss; limitar texturas in-flight.
- Se termina em CPU BGRA, contar readbacks/conversões **reais**, comparar ao baseline.
- **Aceite:** robustez e menor custo efetivo; caso contrário abandonar esta variante.

### ELE-T6 — GPU texture até encoder de hardware

**Entrada:** apenas após ELE-T1/T5 e investigação 12 Windows/AMD/AMF.

- Fluxo D3D11/texture→encoder H.264 compatível; mux/audio/overlay e validação FFprobe.
- Comparar cor sRGB/BT.709, alpha de layers, primeiro export e cold startup de driver.
- **Aceite:** 1080p30 com qualidade/cor preservadas, MP4 íntegro, fallback CPU e ganhos ponta a ponta.
- **Rejeitar:** exigência de DLL/driver sem fallback ou texture lifetime instável.

### ELE-T7 — Visibilidade e paint controlados em repouso

- Testar `startPainting/stopPainting` apenas num render sintético com pausa e `reused`, sem mudar o frame lógico.
- Garantir que o próximo quadro/asset/layer seja atualizado antes de captura.
- Rejeitar se perder primeira pintura, entrar em timeout ou melhorar somente idle com MP4 igual.

### ELE-T8 — Worker pooling na mesma exportação

- Medir `workerStartupMs`; somente se relevante, experimentar manter duas BrowserWindows do mesmo job entre partes consecutivas.
- Reset de payload, assets, referências, frame key, token, decoder e sessão; falhas não podem cruzar projetos.
- **Aceite:** menor tempo de jobs curtos com memória/cache limitados, sem stale e sem reuso entre projetos diferentes.

### ELE-T9 — Cancelamento e crash

- Erro em `loadFile`/`ready`, `executeJavaScript`, captura, encoder, janela fechada e processo renderer destruído.
- Testar com 0, 1 e 2 layers, em frames 0/149/299, e com token que nunca combina.
- Medir tempo até falha explícita, recursos liberados e nenhum MP4 parcialmente publicado.
- **Aceite:** cleanup e abort seguros; se render-process-gone não for detectado cedo, registrar melhoria separada de resiliência.

### ELE-T10 — Mídia externa e oclusão

- Vídeo como middle layer entre background e foreground, boca/cabelo/posterior, personagem espelhado e fundo transparente.
- Mesmos PTS/frames, alpha, oclusão e cor; incluir áudio externo e seam Turbo.
- **Aceite:** mesmo RGBA na pré-composição e MP4 final, sem duplo overlay/cabelo cortado.

### ELE-T11 — Golden RGBA e conversão de cor

- Gerar quadros com tons de pele, gradientes, alpha 0/0,5/1, cabelo preto/azul, sombra e fonte.
- Comparar `capturePage/toBitmap` sRGB com `paint` e textura importada com conversão explícita no mesmo espaço de cor.
- Verificar ordering BGRA/RGBA, premultiplication e gamma. Não aceitar comparação após H.264 apenas.
- **Aceite:** tolerância RGBA documentada e diferença visual validada em fundos branco/preto.

## 19. Matriz de alternativas para decisão, sem inventar desempenho

| Caminho | Complexidade | Ganho potencial (hipótese) | Custo/risco | Quando vale experimentar |
|---|---|---|---|---|
| Manter `capturePage` e reduzir Canvas/face/hair | Baixa a média | Evitar pixels que não precisavam ser gerados | Ordem de camadas e composição | Se desenho/prep domina |
| `paint` + dirtyRect + token | Média | Reduzir overhead de pull capture | Push assíncrono, imagem parcial, stale | Se capturePage/Bitmap dominante |
| `capturePage stayHidden` | Baixa | Ajustar scheduler de janela oculta | Sem garantia de imagem pronta | Somente microbenchmark seguro |
| `setFrameRate 30` ou 90 | Baixa | Mudar rAF/retries | Pode piorar latência e timeout | Se rAF e stale dominam |
| Pool de BrowserWindows dentro do job | Média | Evitar startup repetido | Cache/projeto/token/risco de retenção | Se workerStartup grande |
| Shared GPU texture→CPU libopenh264 | Alta | Potencialmente reduzir apresentação/cópias | No fim pode ter readback igual | Só após identificar custo e validar PoC |
| Shared GPU texture→AMF/D3D11 | Muito alta | Evitar trajeto completo GPU→CPU | Driver, formatos, alpha, encoder, IPC nativo | Só após ganho real do PoC e Pesquisa 12 |
| Desabilitar GPU e render por software | Alta | Pode simplificar captura CPU | WebGL cabelo/qualidade incompatíveis | **Não recomendar para o padrão atual** |
| Novo renderer nativo | Muito alta | Remover DOM/Chromium em export | Reimplementar todas as features | Última alternativa com paridade completa |

**[CONCLUSÃO]** Se 41s extras surgem antes da BrowserWindow, trocar `capturePage` não atacará a causa. Se surgem depois da composição, um substituto de captura pode ajudar, mas precisa de testes de cor, frameId e áudio.

## 20. Ordem de execução recomendada ao Codex

| ID | Ação | Dependências | Gate |
|---|---|---|---|
| `ELE-AUD-001` | Perfil de custos de offscreen do caminho atual | Cópia autorizada, [EXP-001](../experimentos/EXP-001-CABELO-ON-OFF.md) | 3+3 runs e relatório clique→MP4, fases separadas |
| `ELE-AUD-002` | Captura e colorSpace em Electron instalado | ELE-AUD-001 + capabilities do EXE | BGRA/alpha/sRGB/DPR comprovados |
| `ELE-AUD-003` | Trace multiprocesso Perfetto + correlação | ELE-AUD-001 | Verificar GPU/Viz/readback vs JS no caso real |
| `ELE-SPIKE-001` | Prototipar `paint`/dirtyRect/token | Apenas se captura for relevante | 150/300 frames, zero stale, paridade, tempo menor |
| `ELE-SPIKE-002` | `stayHidden`/`setFrameRate` em laboratório | ELE-AUD-002 | Ganho total e mesmos frames, não só p50 |
| `ELE-SPIKE-003` | SharedTexture/import/ciclo de vida | ELE-AUD-001 + Pesquisa 12 | Texture release, formatos, driver, VRAM, fallback |
| `ELE-SPIKE-004` | Pipeline GPU→AMF/Media Foundation | PoC anterior + estudo Windows/AMD | MP4 + áudio + overlay, qualidade e ganho |
| `ELE-SPIKE-005` | Pool de BrowserWindows por job | Startup dominante | Sem cache stale e limites de memória |
| `ELE-ADR-001` | Decisão arquitetural | Bench A/B e protótipos | Comparação de alternativas + rollback |
| `ELE-REF-001` | Integração de produção | ADR aceita | Build portátil, testes cruzados e regressão |

**Regra de autorização:** esta pesquisa autoriza **documentação e preparação de experimentos**, não mudar as opções do exportador de produção, o formato salvo, o encoder ou as flags de segurança.

## 21. Critérios de aceite — não abrir mão

1. **Pixels:** paridade RGBA antes do encoder, incluindo cabelo posterior e boca, flipX, escala, sombras, alpha e colorSpace sRGB.
2. **MP4:** 1920×1080, 30fps, 150/300 quadros exatos, H.264, áudio, vídeo externo, PTS e emendas de Turbo válidas.
3. **Sincronia:** frameId/token e layer correspondentes na mesma captura, nenhum stale mesmo em queda de render ou erro.
4. **Memória:** limites documentados para Buffer/NativeImage/canvas/GPU texturas, duas lanes e comportamento após cancelamento.
5. **Proteção de dados:** sem profile pessoal, sem biblioteca desprotegida, sem protocolo file:// amplo, sem alteração de IDs/manifests.
6. **Segurança:** sandbox, contextIsolation, nodeIntegration desligada, validação remetente, CSP, origem e permission handlers preservados.
7. **Compatibilidade:** Windows real, EXE portátil, driver AMD, fallback CPU e versão de Electron/FFmpeg realmente identificadas.
8. **Medição:** cold vs warm, controle de hardware/options, três corridas por condição, relatório de wall-clock e intervalos por fase.
9. **Cancelamento:** nenhuma janela, subprocesso ou texture handle sobrevivendo ao job cancelado; nenhum MP4 parcial publicado.
10. **Testes:** não substituir suites existentes por snapshot "passou visualmente"; combinar unit, stress, golden e export real.

## 22. Antipadrões que a pesquisa reprova

- Trocar o `setFrameRate(60)` para 30 achando que isso muda `outputFPS`; o MP4 **já** é 30fps.
- Desligar GPU globalmente e, sem perceber, quebrar a malha WebGL do cabelo.
- Usar `setTimeout(16)` como confirmação de pixel sem token.
- Substituir `NativeImage.toBitmap` por `toPNG` e achar que bytes PNG comprimidos podem entrar em `rawvideo bgra` sem decodificar.
- Capturar uma única imagem achatada com mídia externa e perder a camada foreground no FFmpeg.
- Tratar `paint` como callback 1:1 com o frame lógico solicitado.
- Expor `ipcRenderer` geral, Node ou shell à janela de renderização para economizar IPC.
- Compartilhar sessão persistente entre projetos e eliminar isolamento.
- Manter textures não liberadas depois de `paint`/abort/resize.
- Exportar áudio/vídeo sem ffprobe ou ignorar falha de token para fazer benchmark passar.
- Comparar `hair OFF` com outro preset, encoder, duração, resolução ou cache aquecido.
- Chamar otimização de **ganho** porque diminuiu `capturePageMs`, mas aumentou o tempo total.

## 23. Links de código fixados no commit consultado

Os links abaixo apontam ao `sha` da revisão da pesquisa; conferir mudanças locais antes de executar.

- [Export worker Main (todas as etapas)](https://github.com/nestarasup-sys/Native-gacha/blob/9d1832b80ecea970ea60e7f229d60a8e1e0a3fe1/electron/domains/editorV6/exportWorkers.ts#L1-L192)
- [Captura, pixels e token](https://github.com/nestarasup-sys/Native-gacha/blob/9d1832b80ecea970ea60e7f229d60a8e1e0a3fe1/electron/domains/editorV6/exportCaptureBitmap.ts#L1-L55)
- [Frame renderer e rAF](https://github.com/nestarasup-sys/Native-gacha/blob/9d1832b80ecea970ea60e7f229d60a8e1e0a3fe1/src/renderer/src/features/editorV6/exportWorker.tsx#L486-L685)
- [Export runner e pipe FFmpeg](https://github.com/nestarasup-sys/Native-gacha/blob/9d1832b80ecea970ea60e7f229d60a8e1e0a3fe1/electron/domains/editorV6/exportRunner.ts#L197-L317)
- [Export IPC e ciclo de vida](https://github.com/nestarasup-sys/Native-gacha/blob/9d1832b80ecea970ea60e7f229d60a8e1e0a3fe1/electron/domains/editorV6/exportIpc.ts#L50-L219)
- [Motion service e lanes](https://github.com/nestarasup-sys/Native-gacha/blob/9d1832b80ecea970ea60e7f229d60a8e1e0a3fe1/electron/domains/editorV6/motionIpc.ts#L17-L116)
- [Preload de exportação](https://github.com/nestarasup-sys/Native-gacha/blob/9d1832b80ecea970ea60e7f229d60a8e1e0a3fe1/electron/editorV6ExportPreload.ts)
- [Preload de movimento](https://github.com/nestarasup-sys/Native-gacha/blob/9d1832b80ecea970ea60e7f229d60a8e1e0a3fe1/electron/editorV6MotionPreload.ts)
- [Navigation/resource/permission policy](https://github.com/nestarasup-sys/Native-gacha/blob/9d1832b80ecea970ea60e7f229d60a8e1e0a3fe1/electron/windowResourcePolicy.ts)
- [Teste unitário de token](https://github.com/nestarasup-sys/Native-gacha/blob/9d1832b80ecea970ea60e7f229d60a8e1e0a3fe1/tests/editor-v6/exportCaptureBitmap.test.ts)
- [Testes de lifecycle e stale](https://github.com/nestarasup-sys/Native-gacha/blob/9d1832b80ecea970ea60e7f229d60a8e1e0a3fe1/tests/editor-v6/exportWorkers.test.ts)
- [Harness de stress da UI offscreen](https://github.com/nestarasup-sys/Native-gacha/blob/9d1832b80ecea970ea60e7f229d60a8e1e0a3fe1/scripts/editor-v6/test-stress-offscreen.cjs)

## 24. Fontes oficiais consultadas (06/11/2026)

| Documento oficial | Link | O que foi confrontado com o app |
|---|---|---|
| Electron Offscreen Rendering | https://www.electronjs.org/docs/latest/tutorial/offscreen-rendering | GPU bitmap CPU, shared texture, software output, dirtyRect, limite 240 |
| Electron webContents | https://www.electronjs.org/docs/latest/api/web-contents | `capturePage`, `paint`, `invalidate`, `setFrameRate`, `startPainting`/`stopPainting` |
| Electron BrowserWindow | https://www.electronjs.org/docs/latest/api/browser-window | `offscreen`, `backgroundThrottling`, opções do worker |
| Electron BrowserWindow Options | https://www.electronjs.org/docs/latest/api/structures/browser-window-options | `useSharedTexture`, formatos solicitados, limites de opções |
| Electron NativeImage | https://www.electronjs.org/docs/latest/api/native-image | `toBitmap`, cópia, sRGB desde Electron 43 |
| Electron OffscreenSharedTexture | https://www.electronjs.org/docs/latest/api/structures/offscreen-shared-texture | `pixelFormat`, timestamp, `release`, handles e metadata |
| Electron sharedTexture (experimental) | https://www.electronjs.org/docs/latest/api/shared-texture | Importação de handle, `VideoFrame`, send/receiver e limitações |
| Electron session | https://www.electronjs.org/docs/latest/api/session | `fromPartition`, persistente vs memória |
| Electron IPC tutorial | https://www.electronjs.org/docs/latest/tutorial/ipc | `ipcMain`, `ipcRenderer`, structured clone |
| Electron ipcRenderer | https://www.electronjs.org/docs/latest/api/ipc-renderer | Tipos não serializáveis e restrições |
| Electron Process Model | https://www.electronjs.org/docs/latest/tutorial/process-model | Main/renderer/preload |
| Electron Context Isolation | https://www.electronjs.org/docs/latest/tutorial/context-isolation | Bridge restrita |
| Electron Security | https://www.electronjs.org/docs/latest/tutorial/security | Sandbox, sender checks, CSP, schemes |
| Electron contentTracing | https://www.electronjs.org/docs/latest/api/content-tracing | Trace **Perfetto protobuf**, depois de `app.ready` |
| Node Streams | https://nodejs.org/api/stream.html | Backpressure e lifecycle de pipe do FFmpeg |

**Fontes primárias não são medições.** A documentação `latest` pode descrever novas APIs experimentais que não existem ou não funcionam na versão instalada. Executar `process.versions` e feature detection no build Windows real.

## 25. Conclusão técnica e próximas entregas

### Confirmado na auditoria

- O V6 usa `BrowserWindow` offscreen GPU com **bitmap CPU**, não shared texture, para o MP4 atual.
- O worker de captura é distinto da UI e do baker de movimentos; cada um tem preload, sessão e ciclo de vida específicos.
- `capturePage` + `NativeImage.toBitmap` + token de 24 bits entregam BGRA com verificação de frame **na mesma captura**.
- Há buffers reutilizados, validação de geometria e retentativa de frame obsoleto; muitas sugestões simplistas já foram evitadas pelo código.
- `layeredVideo` precisa capturar background e foreground para colocar o vídeo externo no meio, dobrando os dados por frame quando necessário.
- Electron 43+ pode converter `toBitmap` para sRGB automaticamente, detalhe essencial de paridade de cor.
- `paint` é uma alternativa possível, mas assíncrona; a documentação contém uma ambiguidade entre `dirtyRect` e `image` que exige observar o build.
- Shared texture é uma possibilidade GPU experimental de alta engenharia, **não** uma opção de flag que elimina todo encode/áudio/mux/CPU.
- Motion bake tem workers, cache e sessão próprios; não os confundir com frames de exportação.
- Os testes existentes exercitam token, retry, cancelamento e segurança. **Não foram executados** nesta rodada.

### O que continua sem prova

- Quanta parcela dos 41s relatados está em pre-job, Canvas/WebGL, `capturePage`, `toBitmap`, GPU/Viz ou FFmpeg.
- Se `paint` é mais rápido no hardware Windows do usuário sem perder frames.
- Se `stayHidden`, frameRate diferente ou pool de janela traz ganho real.
- Se um caminho GPU→encoder de hardware preserva todos os recursos do V6.
- Se colorSpace/alpha equivalem a referência após mudar a API.
- Se memória RSS/VRAM fica limitada durante 10s, 300 frames e múltiplos atores.

### Recomendação executável

**Primeiro ELE-AUD-001 e ELE-AUD-002:** perfilar com e sem cabelo, incluir o preparo anterior ao Main e validar sRGB/alpha/frames de um benchmark autorizado. **Depois** perf de Viz e teste `paint` condicionado ao custo medido. Se o gargalo for recomposição de personagem, priorizar ROI de cabelo (Pesquisa 10), e não mudar o Electron.

## Atualização experimental no LAB — 06/11/2026

O benchmark frio mostrou captura como custo relevante após a preparação: em três exports completos por caminho, mediana de parede foi 116,32s para `capturePage` e 110,47s para subscription `paint-event` (~5,0% menor). As somas de captura acumuladas por workers caíram 105,81s→95,53s; não interpretar essas somas como parede porque as lanes concorrem. O intervalo inclui uma corrida paint de 119,58s, maior que a mediana baseline, portanto a variância pede mais amostras.

O LAB agora usa `beginFrameSubscription(false, callback)` para manter a `NativeImage` mais recente e entrega pixels somente quando o token lateral corresponde exatamente ao frame solicitado; incompatibilidade invalida a imagem e retorna ao fluxo existente de retry. A leitura de pixels usa o mesmo conversor BGRA e buffer reutilizado. O modo `capturePage` continua selecionável para comparação/fallback. Em smoke com hashes RGBA esparsos, frames 0/29/30/149 coincidiram; export curto validou 150 frames, 1080p30 e áudio. Ainda falta golden completo, cancelamento/resize sob estresse e uma distribuição empacotada.

Electron documenta subscription offscreen com imagem integral quando `onlyDirty=false` e callback assíncrono; o fluxo mantém a confirmação de token como barreira contra frame anterior. [Offscreen rendering](https://www.electronjs.org/docs/latest/tutorial/offscreen-rendering) · [webContents API](https://www.electronjs.org/docs/latest/api/web-contents).

## Atualização LAB equivalente à UI — 06/11/2026

O controle sem cabelo também carrega o renderer em uma rota de harness explícita, instala a ponte de exportação e usa o mesmo command→IPC start/status da UI ON. `mainWindow` reconhece essa rota somente com stress offscreen + perfil UI + flag no-hair; o harness encerra Electron com status do resultado. Smoke de 20s e 3 exports completos passaram; contagem/áudio/caches foram validados. Isso corrige a diferença metodológica do runner direto anterior.

Concorrência de render: uma exportação completa com quatro workers terminou em 80,18s, fase render 50,92s, pico RSS Main 1.060MiB; o perfil promovido com dois workers mediu mediana 80,11s e fase render 51,20s. O pequeno deslocamento fica dentro da dispersão e consome mais memória. Quatro workers seguem opt-in no harness, sem promoção ao app.

A nova comparação de captura executou perfil UI slot 2/posterior-only, 1080p30/Turbo/áudio, processo e sessão frios. Em 150 frames, `capturePage`/CPU levou 13,63s e `paint-event`/CPU 14,20s; ambos MP4s passaram ffprobe. O smoke não estabelece paridade RGBA completa: as duas capturas do quadro amostrado incluem uma camada base com SHA igual e uma camada frontal com SHA diferente. Paint ficou opt-in; `capturePage` segue caminho normal até a discrepância do foreground ser localizada.

A implementação agora registra `paintWaitMs` separadamente de `capturePageMs`, mantém fence de token e rejeita exceções do callback em Promise pendente. Testes unitários de worker/bitmap: 13 passaram, incluindo exact-token, stale retry/cancelamento, fechamento da subscription e `paintWaitMs` numérico; ainda faltam erro/timeout/resize e stress layered-video.

O profiling frio completo, no perfil UI, mediu mediana clique→MP4 84,83s em AMF e 82,44s em libx264, com 2.394 frames e áudio. CapturePage individual acumulado entre lanes ~16,6–17,7s, bitmap ~4,7–5,0s; IPC draw ~14,7–16,4s e round-trip ~39,2–41,3s (acumulados concorrentes, não parede). Paint não foi retestado em 3 corridas completas, dado o smoke mais lento e a divergência de hash.

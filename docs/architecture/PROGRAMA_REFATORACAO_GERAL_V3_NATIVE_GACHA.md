# Refatoração geral V3 — Native-gacha

**Data:** 2026-11-03
**Branch autorizada:** `Dev-V2`
**Execução:** local, sem push/PR/merge; sem leitura ou alteração de `app-data` pessoal.
**Baseline de auditoria V2:** [Programa V2](./PROGRAMA_REFATORACAO_GERAL_V2_NATIVE_GACHA.md). A árvore estava limpa no início. O HEAD inicial desta rodada era `8340069`; a referência `491a4ea` do V3 era uma fotografia histórica, não foi usada para descartar commits posteriores.

## Resumo da execução

Foram corrigidas duas causas verificáveis: o exportador offscreen podia aceitar a captura de um quadro antigo como se fosse o quadro solicitado, e o gate geral de persistência dependia de uma forma literal de código que mudou quando a preparação de cabelo se tornou assíncrona. O motor experimental de cabelo foi refeito para exportação com malha texturizada contínua, âncora baseada na cabeça/recorte e regressões sintéticas com pixels e MP4.

O P0 técnico do cabelo está implementado, incluindo movimento contínuo nos quadros intermediários `motionSprite`; testes sintéticos confirmam a deformação, o alinhamento da cabeça, a camada facial e a saída MP4. A aceitação estética com cabelo real continua pendente. O recurso permanece opt-in e experimental.

**Regra de produto preservada:** a animação só acontece no renderizador oculto da exportação MP4 quando ativada. Não existe animação no viewport, timeline, seek ou playback normal do Editor V6. A prévia do Fabricador DEV continua usando sua simulação.

## Mapa pós-V2 e estado por módulo

| Módulo | Estado | Evidência e risco remanescente |
| --- | --- | --- |
| Electron Main, preload, IPC e encerramento | **Bem refatorado; regressão corrigida** | Limites de confiança, sandbox/preload e encerramento permanecem cobertos pelos gates gerais. A captura offscreen agora valida o token do quadro no mesmo `NativeImage` exportado. Novas falhas de MP4 geram evento curto e sanitizado em Logs Dev; erros/caminhos do projeto não são copiados para esse evento. |
| Armazenamento, SQLite/CAS, journals e backups | **Bem refatorado pela V2** | A suíte ampla cobre recuperação, atomicidade, compatibilidade e flush. Esta rodada não mudou schema, caminho, backup ou formato salvo. |
| Fabricador DEV — modelos e juntas | **Parcialmente refatorado; regressões recentes protegidas** | Testes de divisão de membros, âncoras em espaço da fonte, limpeza raster da `bodyJointBridge`, contornos contínuos e preview passaram. Ainda falta aceite visual com os modelos reais para descartar artefatos específicos de cada desenho. |
| Roupas DEV e sapatos | **Parcialmente refatorado; regressões recentes protegidas** | Testes cobrem chroma em bordas, lacunas pequenas/grandes da ponte, corte de juntas, grade 3×4, preferência de camada do sapato e composição por lado. Não houve alteração de dados do catálogo; falta inspeção visual com peças reais em todos os consumidores. |
| Customizador e propriedade dos personagens | **Bem refatorado pela V2** | `test:refactor` cobre continuidade Fabricador → Customizador → Studio, gravação serializada e catálogo. Limites de propriedade e snapshots foram mantidos. |
| Studio Principal | **Bem refatorado pela V2** | Persistência, histórico, seleção e exportação permanecem cobertos pela suíte ampla. Nenhuma extração de UI sem fronteira demonstrada foi necessária nesta rodada. |
| Editor V6 sem cabelo experimental | **Bem protegido; regressão de captura corrigida** | Exportação geral Electron/FFmpeg passou com 81 quadros, áudio contínuo na emenda, cancelamento, recuperação, 1080p e destino preservado. Cabelo não participa do render normal. |
| Editor V6 — cabelo experimental | **Implementação técnica concluída; aceite visual pendente** | Malha WebGL contínua, âncora de cabeça por quadro e recomposição dinâmica sobre `motionSprite` passaram em fixture Electron/FFmpeg. Alpha, fala/boca, recorte, início tardio, emenda Turbo e 720p/1080p passaram. O usuário ainda precisa revisar um personagem real. |
| Roteiros, Base de Vídeos, Opções e CSS | **Bem refatorados pela V2** | As cadeias gerais e de propriedade/asset passaram. A divisão de CSS e os contratos da V2 foram preservados, sem redesign. |
| Workflows da Dev-V2 | **Atualizados localmente; execução hospedada pendente** | O job Windows passou a executar a fixture Electron/FFmpeg de cabelo e anexar somente artefatos sintéticos com hashes. Não houve run hospedada porque esta tarefa proíbe publicar commits. |

## P0 — cabelo: causas, correções e limite atual

### Causas reproduzidas

1. A exportação deformava cada camada em até 96 faixas horizontais independentes. O caminho produzia emendas de alpha/reamostragem que não existiam na malha contínua da prévia do Fabricador.
2. A inércia usava `element.x / element.width`, que não representa o centro da cabeça no palco. O resultado dependia de posição do elemento e podia afastar a raiz do cabelo quando havia recorte transparente, escala, giro ou espelhamento.
3. As poses de transição são `motionSprite`: imagens rasterizadas do personagem inteiro, normalmente incluindo cabelo. Desenhar cabelo dinâmico sobre elas duplica os fios. A preparação agora cria atlas transitórios sem cabelo e separa corpo, face e overlay para recompor cada amostra sem duplicação.

### Implementação

- A geometria 24×32 da malha agora é compartilhada entre a prévia do Fabricador e o worker de exportação. O export usa uma passagem WebGL texturizada contínua, resolução original, texturas em cache e liberação explícita de recursos. Contexto WebGL ausente/perdido falha a exportação em vez de publicar uma imagem degradada.
- A âncora usa centro local da cabeça transformado pelo tamanho, escala, rotação, espelhamento e centro do recorte do quadro. Dentro de `motionSprite`, a pose da cabeça é interpolada e o recorte é substituído pelo recorte exato do atlas sem cabelo daquela amostra.
- A física mantém a simulação determinística pelo quadro absoluto. Um teste confirma igualdade pixel a pixel do mesmo frame quando pedido em ordem sequencial ou por partes Turbo.
- Para cada troca relevante ao intervalo exportado, o preparador usa o mesmo bake de pose do Editor V6 para gerar atlas transitórios separados de corpo atrás da face, face e overlay. O worker interpola as camadas de cabelo entre os rigs de origem/destino, recompõe cada amostra na geometria do `motionSprite`, preserva patches faciais/boca e remove `motionSprite` apenas do elemento temporário enviado à superfície de exportação.
- O callback do bake serializa os três atlas PNG enquanto seus canvases ainda existem. Uma regressão capturou o caso em que `finally` limpava esses canvases antes de uma serialização após `await`, o que poderia gerar camadas vazias.
- A fixture de sete quadros encontrou outra falha: o atlas do patch facial permanecia no cache entre quadros, mas não era recolocado na lista de assets que cada renderização recebe. O patch aparecia só no primeiro quadro. O worker agora registra o atlas em cada quadro e a regressão exige pixels do patch nos sete quadros, incluindo o lado espelhado.
- O worker WebGL é exclusivo do export. A opção continua desligada por padrão, sem persistência no projeto/personagem e sem alterar a prévia normal do Editor V6.

### Resultado do fixture

Fixture exclusivamente sintética em 320×180, com cabeça identificável por fiducial, cabelo semitransparente e fios finos, camadas traseira/frontal/franja, recortes de pose deslocados, sete quadros `motionSprite` sem cabelo, face em atlas e patch facial sintético. Capturas RGBA foram verificadas em fundo transparente, branco, preto, colorido e quadriculado; os MP4s foram conferidos com FFmpeg/FFprobe.

- Maior desvio do marcador de cabeça: **0,922 px** em 320×180 (limite do fixture: 1,5 px), inclusive durante a transição.
- Maior diferença da âncora física em relação à cabeça: **1,716 px** (limite do fixture: 2,5 px).
- As sete amostras intermediárias mantiveram cabelo; a comparação com intensidade zerada resultou em **1.628 pixels diferentes** no quadro testado. O patch facial foi confirmado em cada amostra, inclusive na espelhada; o teste contou entre **35 e 40 pixels** por amostra e registrou a sequência em `result.json`.
- 720p seguro: 31 quadros a 30 FPS; 1080p Turbo com início no quadro 20: 30 quadros. Sem lacunas horizontais na captura 720p; cabelo permaneceu visível nos quadros amostrados.
- A mesma saída segura e a mesma saída Turbo geraram hashes iguais em suas duas repetições. Os modos não são comparados por igualdade H.264, pois o Turbo divide os GOPs.
- A fixture **não** atesta estética de cabelo real; esse aceite continua a cargo do usuário.

### Aceite visual e limites restantes

A composição sem cabelo, os recortes por amostra, as camadas dinâmicas e o patch facial foram exercitados na fixture sintética. Falta o usuário conferir a aparência em seu personagem real, pois o teste não usa nem lê `app-data` pessoal. O recurso permanece desligado por padrão e não anima cabelo na prévia/viewport do Editor V6. A execução hospedada da CI continua pendente porque o V3 proíbe publicar os commits locais.

## Falha independente da emenda do exportador

O pixel `(240, 90)` na emenda correspondia ao estado do personagem anterior ao início da segunda parte. O worker esperava qualquer evento `paint` depois do desenho; o evento não estava associado ao quadro solicitado. Uma captura atrasada podia ser aceita mesmo após React/SVG avançar para outro frame.

Agora cada pedido tem token de 24 bits desenhado fora da imagem final. O Main captura o canvas junto com o token e só recorta/exporta a mesma `NativeImage` se o token corresponder. Capturas antigas são descartadas e repetidas com timeout/cancelamento. O teste geral Electron/FFmpeg passou com a emenda e os 81 quadros. O fixture facial secundário também deixou de depender de um ID aleatório para escolher ciclos de rosto; essa alteração elimina variação incidental, mas não é apresentada como causa do pixel da emenda.

## Gate de persistência e integração CI

A falha histórica da CI procurava a expressão literal `trackOperation(async () => { planEditorV6Export`. A preparação assíncrona de cabelo mudou a composição correta da operação. A regex foi substituída por um comando testável e regressões comportamentais: o flush aguarda preparo do preset, IPC de início e resposta final; cancelamento permanece rastreado até a consulta de status. `test:refactor` também passou a incluir a regressão de importação pareada de sapatos que já existia fora do gate.

O job Windows do workflow já prepara uma única build e o FFmpeg verificado; agora executa também a fixture de cabelo, e publica imagens, MP4s, JSON e hashes apenas do cenário sintético. Os harnesses escrevem artefatos em `out/` (ou no diretório sintético definido para teste) e registram somente o nome da pasta temporária, sem publicar o caminho absoluto do usuário. **A CI hospedada dos commits locais não foi executada** porque publicação está proibida. Ela só será verificável após autorização para publicar.

## Auditoria de contratos e dados

- Nenhuma migração, alteração de schema, formato JSON, ID persistido, canal IPC público ou arquivo pessoal foi introduzido.
- O Fabricador continua dono do catálogo-fonte; Customizador das personalizações/instâncias; Studio/Editor V6 de seus documentos e timelines. O bundle de cabelo é transitório, validado pelo Main e não gravado.
- Evento novo de falha de export é `editor-v6.export-failed`; sua mensagem não contém erro bruto, caminho, imagem, preset ou conteúdo do projeto. Cancelamento explícito não é registrado como falha.
- `window.desktop`, sandbox, context isolation, validação de origem IPC e segurança dos workers permanecem sem mudança.
- A auditoria pós-V2 foi orientada pelos ciclos e contratos já registrados em [V2](./PROGRAMA_REFATORACAO_GERAL_V2_NATIVE_GACHA.md), não por nova varredura de linhas. Não houve justificativa para reabrir extrações já concluídas.

## Pesquisas técnicas

As decisões de captura foram verificadas com a documentação do Electron instalada na faixa 45: [`paint` offscreen](https://www.electronjs.org/docs/v45.1.0/tutorial/offscreen-rendering), [`webContents.capturePage`](https://www.electronjs.org/docs/v45.1.0/api/web-contents#contentscapturepagerect-opts) e [`ProcessMetric`](https://www.electronjs.org/docs/v45.1.0/api/structures/process-metric)/[`MemoryInfo`](https://www.electronjs.org/docs/v45.1.0/api/structures/memory-info). `paint` é entrega de região suja, não confirmação do frame de uma chamada específica; por isso o token é validado dentro da imagem efetivamente recortada.

Para WebGL/alpha e descarte de objetos foram consultados [MDN WebGL](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API), [context attributes](https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/getContextAttributes) e [boas práticas WebGL](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices). A plataforma não fornece consulta portável de VRAM exata; por isso o relatório distingue working set/private bytes do Electron e estimativas RGBA8. [FFmpeg](https://ffmpeg.org/documentation.html) e [FFprobe](https://ffmpeg.org/ffprobe.html) são usados para decodificar pixels sintéticos e confirmar codec, dimensões, FPS e quadros.

## Verificações locais

Todas as verificações abaixo usaram fixtures sintéticas ou testes isolados. O usuário informou que estava jogando; os resultados de tempo/memória estão marcados como carga concorrente e não controlada.

| Verificação | Resultado |
| --- | --- |
| `npm run audit:architecture` | Aprovado: 663 arquivos TS/TSX; 0 erro de sintaxe/import ausente/fronteira proibida. |
| `npm run test:refactor` | Aprovado: suíte principal e todos os comandos encadeados terminaram com código 0. |
| `npm run test:geometry` | Aprovado: 5/5. |
| `npm run typecheck` | Aprovado. |
| `npm run build` | Aprovado dentro das suítes de exportação (Vite/Electron build). |
| `npm run test:editor-v6` | 40 arquivos passaram, 1 ignorado; 228 testes passaram, 1 ignorado. |
| `npm run test:editor-v6:export` | Aprovado: 81 quadros, Turbo em 2 partes, áudio/emenda, destino preservado após cancelamento, recuperação e 1080p; estresse sintético de boca 301 quadros/320×180. |
| `npm run test:editor-v6:export-overlay` | Aprovado: 60 quadros, duas partes Turbo, camadas vermelho/verde/azul/vermelho e emenda nos frames 29–30. |
| `npm run test:editor-v6:face-export-silent` | Aprovado: geometria facial, rotação/espelhamento e zero pixel alterado nos cinco fundos sintéticos. |
| `npm run test:editor-v6:hair-motion` | Aprovado: 16/16 testes de física, presets, validação e geometria, além de build e Electron/FFmpeg. |
| `npm run test:editor-v6:hair-motion-export` | Aprovado: 7/7 quadros `motionSprite`, movimento comparado com intensidade zerada, patch facial em cada quadro (inclusive espelhado), PNG/RGBA, alpha, recorte, 720p seguro, 1080p Turbo tardio e quatro exportações 720p pareadas; relatório e hashes em `out/editor-v6-hair-motion-check/`. |
| `npm run test:editor-v6:motion` | Aprovado: o callback serializa os atlas de corpo/face antes da limpeza dos canvases; PNGs decodificados mantiveram dimensões e pixels. |
| `node --test tests/editor-v6/testOutputDirectory.test.cjs` | Aprovado: 3/3; pasta de saída configurável e proteção contra incluir caminhos absolutos temporários nos resultados. |
| `node scripts/fabricator/check-hair-motion.cjs` | Aprovado: malha do Fabricador, orientação, alpha, continuidade e persistência de presets. |
| Testes sintéticos de juntas/chroma/camadas/sapatos | 41/41 aprovados, incluindo limpeza de pontinhos rasterizados da ponte do corpo e lacunas de roupas. |
| `git diff --check` | Aprovado. O Git avisou que alguns arquivos LF serão normalizados como CRLF; sem erro de whitespace. |

### Medições com o jogo aberto

Ambiente do processo Electron: Node 24.22.1, Electron 45.1.0, Windows x64, 12 CPUs lógicas, 30 FPS. Na comparação pareada 720p (1.280×720, 31 quadros), ordem seguro/Turbo/seguro/Turbo: **2.068,41 / 1.452,55 / 2.077,14 / 1.388,98 ms**; medianas **2.072,77 / 1.420,76 ms**. O 1080p Turbo com início tardio levou **1.709,38 ms**. São só duas repetições de fixture e não demonstram ganho geral.

Outros perfis sintéticos executados sob a mesma carga concorrente:

| Área | Resultado observado | Limite |
| --- | --- | --- |
| ModelSource composer, 8 peças 3.072×1.536, 3 rodadas | Legado 48,3 ms total/15,0 ms maior intervalo; núcleo direto 50,2/17,9 ms; worker novo 162,2/1,1 ms; worker reutilizado 131,4/7,4 ms. Pixels idênticos. | O worker reduz o maior intervalo síncrono, com maior latência total neste fixture. |
| Cache de catálogo, 150 leituras × 5, asset sintético de 256 KiB | Mediana sem cache 287,88 ms e 750 leituras; cache 48,264 ms e 5 leituras; checksums iguais. | Cache do SO aquecido; não representa latência de tela. |
| Marcadores de juntas, 1.500 peças/1.499 juntas/7 rodadas | Varredura 59,35 ms; índice 2,363 ms; mesmas 1.459 marcações. | Redução observada neste fixture sintético, não ganho global. |
| Preparação de movimento V6, 120 personagens/2.400 planos/5 rodadas | Legado 176,28 ms/2.400 serializações; indexado 10,6 ms/120; 2.400 planos completos iguais. | Resultado de algoritmo sintético; não é tempo de exportação de projeto real. |

Roupas DEV, abertura/roster e Logs Dev não receberam mudanças de runtime nesta rodada. Seus gates e limites continuam cobertos pela suíte ampla; benchmarks e capturas já documentados na V2 permanecem a referência, sem nova alegação de ganho. Não há benchmark dedicado de Roupas DEV que possa medir a tela isoladamente sem criar um novo instrumento.

No teste geral de boca, 301 quadros a 320×180 levaram **2.680,85 ms**; RSS medido do Main começou em **118.120.448 bytes** e chegou a **154.079.232 bytes**. No ensaio de cabelo foram coletadas 18 amostras de processos: maior working set amostrado Main **281.804.800 bytes**, renderer de exportação **109.203.456 bytes**, processos GPU **195.534.848 bytes**, auxiliares **107.876.352 bytes**. São snapshots de processos Electron sob carga concorrente, não pico isolado da feature. A consulta de memória dedicada da GPU retornou `null`; as estimativas de buffers não são VRAM medida.

## Commits locais e pendências

Commits da execução, em `Dev-V2`:

- `6574360 fix(editor-v6): fence offscreen captures by frame token`
- `d4dbf6a feat(editor-v6): add export-only hair motion mesh`
- `a257c05 fix(editor-v6): record sanitized export failures`
- `2ba979b test(editor-v6): cover pending export operations`
- `0f4200c test(editor-v6): add hair export gate to Windows CI`
- `9ebd00f test(editor-v6): guard temporary path redaction`
- `1d4af73 fix(editor-v6): keep hair moving through pose transitions`

Pendências reais:

1. Revisão visual do usuário com cabelo/personagem real; nenhum dado pessoal foi lido como fixture.
2. Execução do workflow hospedado, bloqueada até autorização explícita para publicar.
Não houve push, PR, merge, troca de branch ou alteração de dados existentes.

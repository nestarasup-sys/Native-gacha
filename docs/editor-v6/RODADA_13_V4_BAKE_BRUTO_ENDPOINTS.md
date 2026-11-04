# Editor V6 — Rodada 13 · Primeira exportação: evitar renders de poses já resolvidas

**Data:** 04/11/2026 · **Branch:** Dev-V2 · **Base:** c281204986a259fd0827702192440e8634230402

## Custo bruto identificado

No trecho local do usuário, o cabelo experimental Preset 2 prepara **11 transições** e consome em média **18,23 s** antes do primeiro MP4. O preparador `prepareEditorV6HairMotionBundle` já renderiza cada pose/mode de personagem para conhecer os `sourceCrop`, `outputWidth` e `outputHeight` que são necessários para preparar transições sem cabelo.

Apesar disso, `bakeEditorV6Motion` ainda executava um `render(0)` e `render(1)` em **cada** transição apenas para recuperar os limites/dimensões dos extremos, descartando esses pixels. Além das transições propriamente ditas, isso induzia até **22 renders completos redundantes** nos 11 planos do projeto real. A economia em segundos não foi medida e esse é um limite superior teórico de chamadas evitadas, não uma porcentagem de ganho.

## Alteração de produção

- O preparador passa as dimensões medidas dos dois rigs físicos junto aos crops de união.
- `resolvedHairBakeEndpointDimensions` faz validação defensiva de inteiros positivos e do limite 16.384.
- **Somente quando captura as camadas da transição experimental de cabelo** e dispõe das duas dimensões validadas, o bake usa os crops/dimensões existentes e evita os dois renders de extremidade. Todos os `request.plan.samples`, easing, câmera, estrutura do atlas, composição facial, boca e saída PNG permanecem no caminho antigo.
- Bakes normais de movimento, frames sem metadados e formatos antigos continuam usando os renders de extremidades como antes.
- Não há cache entre exportações, redução de resolução/FPS, queda de amostras, mudança no encoder ou prévia normal.

## Verificação e aceite

O teste de geometria cobre dimensões originais, validação, não mutação e fallback. A CI Windows x64 verifica arquitetura, TypeScript, testes do Editor V6 e MP4 sintético/paridade.

**Exigência adicional de aceite no Windows 11 x64 do usuário:** execute 3 exportações do projeto `Editor V6 06`, 300 quadros, 1920×1080, Preset 2, dois renderizadores, `h264_amf` e cópias verificadas. Meça separadamente preparação, renderização, captura, áudio e total. Compare PNG/RGBA de **todos os 300 quadros** e, se possível, SHA-256 completo dos MP4s. Se houver qualquer divergência não justificada, reverta esta otimização antes de manter em produção.

Baseline da sessão anterior: frio **53,47 s**; média quente **34,33 s**; preparo **18,23 s**; render principal **16,10 s**. **Nenhum resultado novo em segundos foi medido nesta rodada.**

## Segundo ajuste da rodada: deduplicar conteúdo repetido somente no lote bruto

`editorV6HairMotionPreparation.ts` agora usa `hairBakeBatch.ts` para não rasterizar a mesma transição duas vezes **dentro de UMA preparação da primeira exportação**. A identidade leva `plan.key`, personagem + snapshot, geometria/crop de ambas as poses e vetor exato de escalas da boca, que pode depender do frame absoluto. Promises em andamento são compartilhadas e os resultados concluídos sobrevivem apenas até o fim desse lote; o mapa é limpo em `finally`.

Isso **não** reutiliza uma exportação anterior, não escreve cache em disco e não evita o preparo da exportação seguinte. Para 11 transições, o benefício depende de quantas chaves realmente se repetem; se forem todas diferentes, a melhoria economiza zero bakes e só adiciona lookup barato.

A métrica `bakeHairlessMotionTransition` agora usa um cronômetro **local por tarefa** (antes usava `stageStarted` compartilhado entre duas promises concorrentes, portanto a soma do diagnóstico podia estar errada). A métrica `bakeHairlessMotionTransitionReused` reporta a quantidade reusada no lote; ela **não** é tempo em milissegundos, então não a some às fases temporais.

Testes novos cobrem concorrência, conclusão, limpeza, falhas e diferenciação da chave quando face/crops/character ou escalas da boca mudam.

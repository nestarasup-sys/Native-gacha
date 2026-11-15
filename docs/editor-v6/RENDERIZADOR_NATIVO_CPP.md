# Renderizador nativo em C++ do Editor V6

## Estado

Implementação experimental e opt-in. O editor, a resolução da timeline, a composição de rosto/cabelo e o FFmpeg permanecem os componentes de produção existentes. A nova opção substitui a captura/composição visual de cada quadro por um processo nativo isolado que recebe um plano de desenho e devolve pixels BGRA.

```mermaid
flowchart LR
  A[Projeto e timeline] --> B[Worker Chromium: resolve a cena]
  B --> C[Plano de desenho e assets rasterizados]
  C --> D[Processo C++: WIC + compositor BGRA]
  D --> E[Buffer BGRA]
  E --> F[FFmpeg existente]
  F --> G[MP4]
```

## Componentes

- `native/editor-v6-renderer/main.cpp`: processo Windows C++ que decodifica imagens via Windows Imaging Component (WIC), compõe camadas em BGRA premultiplicado e aceita imagens, recortes de atlas, flip horizontal, rotação, opacidade, contain, recorte de boca e retângulos sólidos.
- `electron/domains/editorV6/nativeRendererProcess.ts`: protocolo binário local via stdin/stdout, limites de tamanho, envio de assets uma vez por worker, cancelamento pelo fechamento do worker e validação do tamanho do quadro.
- `src/renderer/src/features/editorV6/editorV6NativeFramePlan.tsx`: converte a cena resolvida em comandos para o processo; assets de vídeo continuam tratados pelo pipeline de vídeo existente. Elementos de texto são rasterizados no Chromium e enviados como imagens.
- `exportWorkerFrameRenderer.ts`: escolhe o resultado BGRA nativo mantendo as mesmas interfaces de quadros e camadas consumidas pelo exportador/FFmpeg.
- `scripts/editor-v6/build-native-renderer.cjs` e `native/editor-v6-renderer/CMakeLists.txt`: compilação x64 Release com MSVC, Windows SDK e CMake.
- O empacotamento inclui o executável em `resources/native/editor-v6-native-renderer.exe`.

## Decisões e limites da experiência

O C++ é um processo separado, não uma biblioteca carregada dentro do Electron. Isso limita o impacto de falhas nativas sobre o processo principal e deixa o contrato de pixel explícito. O processo mantém assets decodificados apenas durante a vida de um worker, com limite de 512 MiB para esse cache; os buffers de quadro são temporários.

A primeira implementação não usa Skia nem aceleração GPU. Escolhemos WIC e rasterização CPU própria para evitar uma dependência grande e testar o contrato de cena/pixels com a toolchain já instalada. Isso não demonstra que seja a implementação mais rápida. Também não reproduz toda a semântica do Chromium/SVG/CSS: filtros, máscaras gerais, modos de mesclagem e outras construções não representadas no plano ainda não são cobertos. O texto passa pela rasterização Chromium. Projetos com esses recursos precisam de comparação visual antes de uso final.

### Próximos candidatos de renderização

- **Skia** é uma biblioteca 2D multiplataforma usada por vários produtos e tem APIs para transformações e rasterização de imagens. Pode ajudar se o projeto precisar manter uma camada gráfica portátil; exige, porém, integrar e distribuir uma dependência C++ grande e testar compatibilidade de pixels com o Chromium. [Documentação oficial do Skia](https://skia.org/docs/).
- **Direct2D** é a alternativa mais direta para esta build Windows: a Microsoft documenta desenho 2D imediato com aceleração de hardware e rasterizador de software de fallback, além de composição alpha. Isso pode remover o custo medido do laço de pixels CPU, mas ainda precisa provar transferência/readback eficiente para BGRA, estabilidade em máquinas sem GPU compatível e paridade visual. [Visão geral oficial do Direct2D](https://learn.microsoft.com/en-us/windows/win32/direct2d/direct2d-overview).
- **FFmpeg** continua recebendo quadros raw; o pipeline de raw video permite informar tamanho e pixel format na entrada, portanto o protocolo BGRA pode continuar sem trocar encoder. [Documentação oficial de formatos do FFmpeg](https://ffmpeg.org/ffmpeg-formats.html).

Com a medição atual, a próxima iteração deve comparar Direct2D e Skia sobre o mesmo fixture e contrato de pixel. A escolha deve depender da paridade, round-trip de um quadro Full HD, memória/readback e custo de empacotamento — não apenas da velocidade do desenho isolado.

A opção fica no painel como **Renderizador nativo em C++** e desmarcada por padrão. A descrição do controle informa que o modo é experimental. Não muda encoder, qualidade, resolução, FPS nem sincronização do áudio.

## Verificação reproduzível

- `npm run build:editor-v6:native`: compila o executável.
- `npm run test:editor-v6:native-renderer`: exercita formato BGRA, tamanho do quadro, recorte de atlas, alpha sobre e composição empilhada.
- `npm run test:editor-v6:export`: build completo e teste Electron; inclui renderização do mesmo quadro sintético em Chromium e C++, comparando erro médio absoluto de canal e diferenças de alpha.
- `npm run typecheck`: verifica os contratos TypeScript.

O teste de paridade é sintético e não substitui a revisão de cenas com assets reais, cabelo, boca, poses, expressões, balões e vídeos. No fixture sintético simples (uma imagem sobre fundo sólido), três comparações Full HD deram MAE máximo 0; na rodada integrada mais recente a mediana do round-trip foi **183,7 ms no caminho C++** contra **34,6 ms no Chromium**, enquanto a rasterização nativa mediu 181,2 ms contra 19,7 ms de `capturePage`. O round-trip inclui transporte e cópia de pixels. Esse resultado local mostra que esta primeira rasterização CPU é mais lenta nesse caso. Não é uma medição de exportação de seis minutos nem permite generalizar para outras cenas/hardwares.

### Projeto real curto: Editor V6 01

Foi executado `node scripts/editor-v6/run-plan-b-export-lab.cjs --smoke --native-renderer` com uma cópia isolada do projeto autorizado, sem gravar no projeto original. O harness valida hash do snapshot, usa cache de motion vazio e retém o MP4 apenas para comparação. O perfil foi alinhado ao relatório normal: 1920×1080, 30 fps, CPU/libopenh264, Turbo 1080p, 519 quadros (17,3 s), preset de cabelo do app no slot 2 e ciclo de boca habilitado. A flag `--native-renderer` também deixa a boca habilitada; os testes normais de CPU/AMF do laboratório continuam com a boca desabilitada.

| Execução | Resultado | Preparação de movimento | Preparação da boca | Renderização | Quadros escritos |
| --- | --- | ---: | ---: | --- | ---: |
| Export normal histórico do mesmo projeto | Concluído | 46,29 s | incluída no relatório | 31,98 s | 519 |
| Nativo, primeira rodada | Falhou no quadro 259: SVG de fala não decodificado | 44,87 s | 7,88 s | falhou após 3,53 s | 0 |
| Nativo, após build atualizado e fallback de SVG | Falhou: processo C++ encerrou/inativou durante o render | 43,53 s | 7,88 s | falhou após 6,05 s | 0 |

O relatório histórico teve **79,01 s** de duração total. Nenhuma duração total ou FPS efetivo válido pode ser atribuída às execuções nativas porque ambas falharam antes de escrever o primeiro quadro. A segunda execução chegou à rasterização dos elementos de texto (42 elementos registrados), mas a concorrência dos dois trechos Turbo encerrou a execução sem preservar no relatório qual foi a primeira causa; o erro observado pelo orquestrador foi que o processo nativo já não estava ativo. O erro do cache persistente Chromium no diretório isolado apareceu como aviso e não foi a causa reportada. A correção da rasterização SVG está no build atual e produziu progresso além do ponto de falha anterior, mas o processamento nativo ainda não está pronto para este projeto.

Relatórios e cópias de teste ficam em `out/editor-v6-stress/runs/plan-b-export-lab-2026-11-15T04-47-10-340Z-18812/`; o baseline está em `app-data/runtime/profile/studios/Editor V6/editorV6-34b5bff1-e77e-4d3d-845b-710ab8d5c2c1/exports/37fe63a7-f47e-47af-afca-80c3edb765af.report.json`. Para repetir com o build atual, execute primeiro `npm run build` e depois o comando do laboratório acima.

**Conclusão operacional:** não selecionar o modo C++ para exportações reais ainda. Ele não demonstrou aceleração e falhou no fixture representativo. O caminho prioritário agora é melhorar o diagnóstico/isolamento de falha do subprocesso, validar cenas com balões e boca e decidir por profiling se vale trocar a rasterização CPU por Direct2D/Skia. O botão deve continuar opt-in e experimental até passar o projeto completo, comparação visual/áudio e medição de tempo contra Chromium.

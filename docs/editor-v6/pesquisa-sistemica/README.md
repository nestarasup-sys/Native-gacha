# Programa de Pesquisa Sistêmica — Native Gacha e Editor V6

**Início:** 06/11/2026 · **Branch-alvo:** `Dev-V2` · **Natureza:** pesquisa documental, experimentação isolada e plano incremental.  
**Baseline de leitura da Pesquisa 01:** `c636ff03c80274eabed7892dc9d5fa0e8ad025c5`. Verificar o HEAD antes de cada nova rodada.

> **Atualização de execução — 06/11/2026:** projeto atual **Teste de Importação — Personagens do Pacote**; [RELATO] exportação **com cabelo ON em 91 segundos (1min31s)**, sem OFF atual medido. Resultados antigos de 50s/9s são históricos de outro projeto. O usuário autorizou o Codex a **pesquisar, implementar, refatorar e testar exclusivamente numa cópia local com branch/BAT/porta/app-data próprios**, sem caches pesados entre exportações. **Antes de começar, seguir [LABORATORIO_CODEX_EXPORTACAO_FRIA.md](LABORATORIO_CODEX_EXPORTACAO_FRIA.md) e a [diretriz de resultado final](DIRETRIZ_CODEX_RESULTADO_FINAL.md): livre escolha de CPU/GPU/AMF/NVENC/QSV e de backend, desde que exportação fria, qualidade e fallback melhorem.**

## Objetivo

Pesquisar **o Native Gacha inteiro**, incluindo todos os produtores e consumidores de personagens, imagens, áudio, vídeo e dados, para decidir o futuro da arquitetura do Editor V6 sem comprometer o restante do aplicativo. **No laboratório isolado o usuário autorizou pesquisa + implementação + testes progressivos**, sempre com evidência, paridade e rollback; não confundir essa autorização com permissão para alterar a instalação original. **O desempenho de exportação é uma prioridade, mas fluidez, continuidade entre módulos e integridade de dados também são requisitos.**

A investigação de Chromium já existente permanece em [PESQUISA_CHROMIUM_REFACTOR_EDITOR_V6_2026-11-06.md](../PESQUISA_CHROMIUM_REFACTOR_EDITOR_V6_2026-11-06.md). Este diretório é o **índice operacional** para aprofundá-la por subsistema, sem duplicar conclusões ou criar um segundo roadmap concorrente.

## Início rápido

1. Ler [AGENTS.md](../../../AGENTS.md) e registrar commit, branch, alterações locais e fonte dos dados.
2. Consultar [Mapa completo do aplicativo](MAPA_COMPLETO_DO_APLICATIVO.md) e [Inventário de tecnologias](INVENTARIO_DE_TECNOLOGIAS.md).
3. Abrir [Pesquisa 01 — Arquitetura geral e integrações](pesquisas/01-ARQUITETURA-GERAL-E-INTEGRACOES.md). **É o primeiro estudo com investigação efetiva de código.**
4. Antes de testar uma solução, conferir [Matriz de oportunidades](MATRIZ_DE_OPORTUNIDADES.md), [Plano executável](PLANO_EXECUTAVEL.md) e [Registro de progresso](PROGRESSO_E_RESULTADOS.md).
5. Critério global do Codex: [Diretriz de resultado final](DIRETRIZ_CODEX_RESULTADO_FINAL.md), sem apego a encoder CPU ou arquitetura específica.
6. Para detalhes técnicos de uma hipótese, seguir o documento numerado em [pesquisas/](pesquisas/README.md). **Grupo A: estudos 02–05, 09–11, 13, 15–21 pesquisados no código e nas fontes oficiais; 06–08, 12 e 14 ainda são roteiros abertos. Benchmarks runtime permanecem pendentes.**
7. Experimentos ficam em [experimentos/](experimentos/README.md); decisões aprovadas ficam em [decisoes/](decisoes/README.md); fontes e evidências ficam em [evidencias/](evidencias/README.md).

## Estrutura e função de cada área

| Local | Função | Política |
|---|---|---|
| `README.md` | Índice, contratos do programa, status | Manter curto; links para detalhes |
| `MAPA_COMPLETO_DO_APLICATIVO.md` | Fluxos e proprietários dos dados | Baseado em código, não em telas isoladas |
| `INVENTARIO_DE_TECNOLOGIAS.md` | Bibliotecas atuais, APIs, alternativas e verificação de versões | Distinguir instalado, built-in, candidato |
| `MATRIZ_DE_OPORTUNIDADES.md` | Hipóteses e prioridades condicionadas a medições | Não converter potencial em ganho medido |
| `PLANO_EXECUTAVEL.md` | Backlog com dependências e gates | Ganha quem reduzir tempo frio sem perda de qualidade, com fallback |
| `PROGRESSO_E_RESULTADOS.md` | O que foi feito, falhou ou não foi possível medir | Nunca afirmar testes que não rodaram |
| `pesquisas/` | 21 estudos temáticos | Um aprofundamento por vez, rastreável |
| `experimentos/` | Protocolos A/B e relatórios sanitizados | Testes somente em cópias autorizadas |
| `decisoes/` | ADRs aceitas/rejeitadas | Registrar alternativa e rollback |
| `evidencias/` | Índice de fontes e dados publicáveis | Proibir caminhos privados e retratos reais |

## Estudos e situação após a rodada completa do Grupo A

**16 pesquisas com análise estática:** arquitetura 01 e **15 estudos do Grupo A**; **5 pesquisas ainda abertas:** 06, 07, 08, 12, 14. Nenhuma pesquisa foi validada por teste no EXE do Windows. "PESQUISADA" aqui significa leitura do código e fontes oficiais, não benchmark nem refatoração.

| Nº | Pesquisa | Estado em 06/11/2026 |
|---|---|---|
| 01 | [Arquitetura e integrações](pesquisas/01-ARQUITETURA-GERAL-E-INTEGRACOES.md) | PESQUISADA — arquitetura estática |
| 02 | [Chromium/Blink/Viz/Skia](pesquisas/02-CHROMIUM-BLINK-VIZ-SKIA.md) | PESQUISADA — Grupo A (código+fonte oficial); runtime pendente |
| 03 | [Electron/offscreen/workers](pesquisas/03-ELECTRON-JANELAS-WORKERS-CAPTURA.md) | PESQUISADA — Grupo A (código+fonte oficial); runtime pendente |
| 04 | [Canvas/SVG/alpha](pesquisas/04-CANVAS-SVG-IMAGENS-ALPHA.md) | PESQUISADA — Grupo A (código+fonte oficial); runtime pendente |
| 05 | [WebGL/GPU (WebGPU candidato)](pesquisas/05-GPU-WEBGL-WEBGPU-NATIVO.md) | PESQUISADA — Grupo A (código+fonte oficial); runtime pendente |
| 06 | [Fabricador](pesquisas/06-FABRICADOR-MODELOS-POSES-ROUPAS.md) | ROTEIRO ABERTO (domínio/alternativa) |
| 07 | [Customizador](pesquisas/07-CUSTOMIZADOR-PERSONAGENS-E-REUSO.md) | ROTEIRO ABERTO (domínio/alternativa) |
| 08 | [Studio/Roteiros/bibliotecas](pesquisas/08-STUDIO-ROTEIROS-BIBLIOTECAS.md) | ROTEIRO ABERTO (domínio/alternativa) |
| 09 | [Timeline/prévia/estado](pesquisas/09-EDITOR-V6-TIMELINE-PREVIA-ESTADO.md) | PESQUISADA — Grupo A (código+fonte oficial); runtime pendente |
| 10 | [Cabelo/face/boca](pesquisas/10-ANIMACAO-CABELO-FACE-BOCA.md) | PESQUISADA — Grupo A (código+fonte oficial); runtime pendente |
| 11 | [FFmpeg/codecs/áudio](pesquisas/11-EXPORTADOR-FFMPEG-CODECS-AUDIO.md) | PESQUISADA — Grupo A (código+fonte oficial); runtime pendente |
| 12 | [Windows/AMD/Direct3D](pesquisas/12-WINDOWS-AMD-AMF-DIRECT3D.md) | ROTEIRO ABERTO (domínio/alternativa) |
| 13 | [SQLite/CAS/cache](pesquisas/13-PERSISTENCIA-SQLITE-CAS-CACHE.md) | PESQUISADA — Grupo A (código+fonte oficial); runtime pendente |
| 14 | [Motores alternativos](pesquisas/14-MOTORES-ALTERNATIVOS.md) | ROTEIRO ABERTO (domínio/alternativa) |
| 15 | [Profiling/benchmark/paridade](pesquisas/15-PROFILING-BENCHMARK-QUALIDADE.md) | PESQUISADA — Grupo A (código+fonte oficial); runtime pendente |
| 16 | [Segurança/build/distribuição](pesquisas/16-SEGURANCA-BUILD-E-DISTRIBUICAO.md) | PESQUISADA — Grupo A (código+fonte oficial); runtime pendente |
| 17 | [Sharp/libvips](pesquisas/17-SHARP-LIBVIPS-NORMALIZACAO-IMAGENS.md) | PESQUISADA — Grupo A (código+fonte oficial); runtime pendente |
| 18 | [React/Zustand/Immer](pesquisas/18-REACT-ZUSTAND-IMMER-ESTADO.md) | PESQUISADA — Grupo A (código+fonte oficial); runtime pendente |
| 19 | [Node/streams/buffers/IPC](pesquisas/19-NODE-IPC-STREAMS-BUFFERS.md) | PESQUISADA — Grupo A (código+fonte oficial); runtime pendente |
| 20 | [WebCodecs](pesquisas/20-WEBCODECS-VIDEODECODER-VIDEOENCODER.md) | PESQUISADA — Grupo A (código+fonte oficial); runtime pendente |
| 21 | [Vite/electron-vite/TypeScript/Zod](pesquisas/21-VITE-TS-ZOD-BUILD-CONTRATOS.md) | PESQUISADA — Grupo A (código+fonte oficial); runtime pendente |
| 22 | [Alocação de threads x264](pesquisas/22-X264-THREADS-ALOCACAO.md) | Instrumentação e smoke sintético medidos; cold A/B integral pendente |

**Pesquisa 02 aprofundada:** [Chromium/Blink/Viz/Skia — segunda rodada completa, capítulos 7–21](pesquisas/02-CHROMIUM-BLINK-VIZ-SKIA.md). Foi ampliada com mapa dos 12 estágios, código por frame, sincronização do token, ROI de cabelo, diagnóstico Perfetto, 11 experimentos e critérios de decisão. **Medição Windows ainda pendente.**

**Pesquisa 03 aprofundada — Electron:** [estudo completo de BrowserWindow, offscreen, paint, capturePage, IPC, cor sRGB, sharedTexture e protocolos de teste](pesquisas/03-ELECTRON-JANELAS-WORKERS-CAPTURA.md). A pesquisa documental está completa para as APIs utilizadas; **benchmarks Windows permanecem pendentes**.

**Leitura recomendada por causalidade de exportação:** [10 Cabelo](pesquisas/10-ANIMACAO-CABELO-FACE-BOCA.md) → [04 Canvas/SVG](pesquisas/04-CANVAS-SVG-IMAGENS-ALPHA.md) → [03 Electron](pesquisas/03-ELECTRON-JANELAS-WORKERS-CAPTURA.md) → [11 FFmpeg](pesquisas/11-EXPORTADOR-FFMPEG-CODECS-AUDIO.md) → [15 Benchmark](pesquisas/15-PROFILING-BENCHMARK-QUALIDADE.md). Para performance da UI, [09 Timeline](pesquisas/09-EDITOR-V6-TIMELINE-PREVIA-ESTADO.md) + [18 React/estado](pesquisas/18-REACT-ZUSTAND-IMMER-ESTADO.md).

## Terminologia obrigatória

- **[CÓDIGO]**: comportamento demonstrado pelo código na revisão citada; não significa que foi executado.
- **[FONTE OFICIAL]**: documentação primária consultada, com URL e data; não garante compatibilidade do binário instalado.
- **[RELATO]**: observação do usuário sem acesso aos relatórios brutos.
- **[MEDIDO]**: execução própria identificada por commit, fixture/cópia, hardware, configurações, tempo total, relatório, repetição e resultados.
- **[HIPÓTESE]**: oportunidade a demonstrar.
- **[A CONFIRMAR]**: dependência, cobertura, versão, comportamento ou causalidade não inspecionados.

**Não confundir pesquisa concluída com recurso implementado, nem benchmark sintético com teste no projeto real.**

## Critérios de segurança

Não modificar perfil, assets ou projetos **originais**. Duplicar código e dados necessários fisicamente para LAB isolado e trabalhar somente na nova branch, novo BAT e porta exclusiva; ver [protocolo](LABORATORIO_CODEX_EXPORTACAO_FRIA.md). Não desabilitar validação IPC, migração, referência ou rollback. Não publicar relatório bruto de personagens, arquivos locais ou mídia privada. Não usar force push. O usuário autorizou **código e testes na branch do laboratório**; mudanças de schema, backend e arquitetura exigem gates de qualidade, compatibilidade e rollback. **Não fazer merge para `Dev-V2`** sem pedido explícito.

## Próxima ação

**Codex:** seguir [Diretriz de resultado final](DIRETRIZ_CODEX_RESULTADO_FINAL.md), especialmente: alinhar perfil UI/harness; validar `paint-event`; depois medir preparação, composição e disputar encoders/backends sem tecnologia fixa. Continuar até fechar qualidade, build, testes e módulos dependentes.

1. Fechar `AUD-001` com a inspeção dinâmica das fronteiras marcadas [A CONFIRMAR], sem acessar dados privados.
2. Preparar `AUD-002`: A/B cabelo no **projeto vigente**, após verificar duração real, copiar assets e criar **ambiente frio** sem caches reaproveitados. Primeiro par diagnóstico, 3+ pares para candidato final.
3. Executar o A/B protegido em EXP-001; a Pesquisa 02 já foi aprofundada em código e documentação oficial. Em paralelo, iniciar 06/07/08 para completar domínio de fontes e referências.

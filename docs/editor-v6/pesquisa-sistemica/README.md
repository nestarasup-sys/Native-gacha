# Programa de Pesquisa Sistêmica — Native Gacha e Editor V6

**Início:** 06/11/2026 · **Branch-alvo:** `Dev-V2` · **Natureza:** pesquisa documental, experimentação isolada e plano incremental.  
**Baseline de leitura da Pesquisa 01:** `c636ff03c80274eabed7892dc9d5fa0e8ad025c5`. Verificar o HEAD antes de cada nova rodada.

## Objetivo

Pesquisar **o Native Gacha inteiro**, incluindo todos os produtores e consumidores de personagens, imagens, áudio, vídeo e dados, para decidir o futuro da arquitetura do Editor V6 sem comprometer o restante do aplicativo. A pesquisa não autoriza implementação automática nem reescrita geral. **O desempenho de exportação é uma prioridade, mas fluidez, continuidade entre módulos e integridade de dados também são requisitos.**

A investigação de Chromium já existente permanece em [PESQUISA_CHROMIUM_REFACTOR_EDITOR_V6_2026-11-06.md](../PESQUISA_CHROMIUM_REFACTOR_EDITOR_V6_2026-11-06.md). Este diretório é o **índice operacional** para aprofundá-la por subsistema, sem duplicar conclusões ou criar um segundo roadmap concorrente.

## Início rápido

1. Ler [AGENTS.md](../../../AGENTS.md) e registrar commit, branch, alterações locais e fonte dos dados.
2. Consultar [Mapa completo do aplicativo](MAPA_COMPLETO_DO_APLICATIVO.md) e [Inventário de tecnologias](INVENTARIO_DE_TECNOLOGIAS.md).
3. Abrir [Pesquisa 01 — Arquitetura geral e integrações](pesquisas/01-ARQUITETURA-GERAL-E-INTEGRACOES.md). **É o primeiro estudo com investigação efetiva de código.**
4. Antes de testar uma solução, conferir [Matriz de oportunidades](MATRIZ_DE_OPORTUNIDADES.md), [Plano executável](PLANO_EXECUTAVEL.md) e [Registro de progresso](PROGRESSO_E_RESULTADOS.md).
5. Para detalhes técnicos de uma hipótese, seguir o documento numerado em [pesquisas/](pesquisas/README.md). **Grupo A: estudos 02–05, 09–11, 13, 15–21 pesquisados no código e nas fontes oficiais; 06–08, 12 e 14 ainda são roteiros abertos. Benchmarks runtime permanecem pendentes.**
6. Experimentos ficam em [experimentos/](experimentos/README.md); decisões aprovadas ficam em [decisoes/](decisoes/README.md); fontes e evidências ficam em [evidencias/](evidencias/README.md).

## Estrutura e função de cada área

| Local | Função | Política |
|---|---|---|
| `README.md` | Índice, contratos do programa, status | Manter curto; links para detalhes |
| `MAPA_COMPLETO_DO_APLICATIVO.md` | Fluxos e proprietários dos dados | Baseado em código, não em telas isoladas |
| `INVENTARIO_DE_TECNOLOGIAS.md` | Bibliotecas atuais, APIs, alternativas e verificação de versões | Distinguir instalado, built-in, candidato |
| `MATRIZ_DE_OPORTUNIDADES.md` | Hipóteses e prioridades condicionadas a medições | Não converter potencial em ganho medido |
| `PLANO_EXECUTAVEL.md` | Backlog com dependências e gates | Experimento ≠ autorização de produção |
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

Não modificar perfil, assets ou projetos pessoais. Não executar benchmark do projeto `editor v6 06` sem snapshot autorizado e backup verificado. Não desabilitar validação IPC, migração, referência ou rollback. Não publicar relatório bruto de personagens, arquivos locais ou mídia privada. Não usar force push. Mudança de código, modelo persistido ou backend de produção exige aprovação e testes específicos.

## Próxima ação

1. Fechar `AUD-001` com a inspeção dinâmica das fronteiras marcadas [A CONFIRMAR], sem acessar dados privados.
2. Preparar `AUD-002`: protocolo A/B do cabelo (mesmo projeto e 300 frames) e autorização de uma cópia verificada.
3. Executar o A/B protegido em EXP-001; a Pesquisa 02 já foi aprofundada em código e documentação oficial. Em paralelo, iniciar 06/07/08 para completar domínio de fontes e referências.

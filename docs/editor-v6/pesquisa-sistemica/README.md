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
5. Para detalhes técnicos de uma hipótese, seguir o documento numerado em [pesquisas/](pesquisas/README.md). **Os estudos 02–16 estão preparados, ainda NÃO concluídos.**
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
| `pesquisas/` | 16 estudos temáticos | Um aprofundamento por vez, rastreável |
| `experimentos/` | Protocolos A/B e relatórios sanitizados | Testes somente em cópias autorizadas |
| `decisoes/` | ADRs aceitas/rejeitadas | Registrar alternativa e rollback |
| `evidencias/` | Índice de fontes e dados publicáveis | Proibir caminhos privados e retratos reais |

## Estudos previstos

| Nº | Pesquisa | Estado em 06/11/2026 |
|---|---|---|
| 01 | [Arquitetura geral e integrações](pesquisas/01-ARQUITETURA-GERAL-E-INTEGRACOES.md) | **PESQUISADA no código; runtime pendente** |
| 02 | [Chromium, Blink, Viz e Skia](pesquisas/02-CHROMIUM-BLINK-VIZ-SKIA.md) | **ROTEIRO ABERTO** |
| 03 | [Electron, janelas, workers e captura](pesquisas/03-ELECTRON-JANELAS-WORKERS-CAPTURA.md) | ROTEIRO ABERTO |
| 04 | [Canvas, SVG, imagens e alpha](pesquisas/04-CANVAS-SVG-IMAGENS-ALPHA.md) | ROTEIRO ABERTO |
| 05 | [GPU, WebGL, WebGPU e nativo](pesquisas/05-GPU-WEBGL-WEBGPU-NATIVO.md) | ROTEIRO ABERTO |
| 06 | [Fabricador, modelos, poses e roupas](pesquisas/06-FABRICADOR-MODELOS-POSES-ROUPAS.md) | ROTEIRO ABERTO |
| 07 | [Customizador, personagens e reuso](pesquisas/07-CUSTOMIZADOR-PERSONAGENS-E-REUSO.md) | ROTEIRO ABERTO |
| 08 | [Studio, Roteiros e bibliotecas](pesquisas/08-STUDIO-ROTEIROS-BIBLIOTECAS.md) | ROTEIRO ABERTO |
| 09 | [V6 timeline, prévia e estado](pesquisas/09-EDITOR-V6-TIMELINE-PREVIA-ESTADO.md) | ROTEIRO ABERTO |
| 10 | [Cabelo, face e boca](pesquisas/10-ANIMACAO-CABELO-FACE-BOCA.md) | ROTEIRO ABERTO |
| 11 | [Exportador, FFmpeg, codecs e áudio](pesquisas/11-EXPORTADOR-FFMPEG-CODECS-AUDIO.md) | ROTEIRO ABERTO |
| 12 | [Windows, AMD, AMF e Direct3D](pesquisas/12-WINDOWS-AMD-AMF-DIRECT3D.md) | ROTEIRO ABERTO |
| 13 | [SQLite, CAS, persistência e cache](pesquisas/13-PERSISTENCIA-SQLITE-CAS-CACHE.md) | ROTEIRO ABERTO |
| 14 | [Motores alternativos](pesquisas/14-MOTORES-ALTERNATIVOS.md) | ROTEIRO ABERTO |
| 15 | [Profiling, benchmark e qualidade](pesquisas/15-PROFILING-BENCHMARK-QUALIDADE.md) | ROTEIRO ABERTO |
| 16 | [Segurança, build e distribuição](pesquisas/16-SEGURANCA-BUILD-E-DISTRIBUICAO.md) | ROTEIRO ABERTO |

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
3. Abrir a Pesquisa 02 com investigação específica do Chromium, já vinculada às funções e métricas do app.

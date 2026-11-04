# Editor V6 — Estudo de gargalos e programa R27–R31 (cabelo)
**Data:** 2026-11-04 · **Base de análise:** `Dev-V2` `359429a69f845d9300933d79360d84d69671d7e7`.

## Objetivo e limites
Acelerar **a primeira exportação real** de 300 quadros / 1920×1080 / 30fps no Windows 11 x64, mantendo **qualidade RGBA, boca, roupas, expressões, antialiasing, poses, áudio, sombra, espelhamento e cancelamento**. Preservar o **padrão atual do usuário: CPU H.264, Turbo 2×, reação única do Posterior `rearHair` após a pose**. **`rearHair` NÃO é `backHair`** (Traseiro). Nada de cache de MP4 ou reuse entre exportações, reduzir resolução/FPS, abrir janela com foco ou acessar arquivos pessoais. GitHub Actions Windows Server não é benchmark da GPU AMD no Windows 11.

## Evidências de código, não estimativas de ganho
- `EditorV6ExportPanel.tsx`: perfil padrão CPU 1080p Turbo e reação única posterior, preset 2 selecionado, perfil recente preservado.
- `hairMotionEngine.ts`: 9 pontos por mecha, quatro subpassos por frame no modo contínuo; **a reação única** usa amostragem absoluta de 30 frames, sem simulação contínua. Otimizar molas isoladamente é prioridade baixa.
- `editorV6HairMotionPreparation.ts`: por personagem/pose, prepara **renderer normal e renderer sem cabelo**, extrai superfícies e rostos e reúne atlas extras de transição; a R22 já suprime atlas sem cabelo em reação única, porém não as duas montagens.
- `motion/bakeMotion.ts`: prepara amostras de atlas de transição canônica; visual completo de 7 samples ainda tem custo significativo e precisa de paridade rigorosa.
- `exportWorker.tsx`: `activeHair` inclui o Posterior mesmo em repouso; `hairAnimationFrame:frame` força invalidação da captura, e a composição redesenha cabelo/corpo nos quadros repetidos.
- `exportHairMeshRenderer.ts`: malha WebGL existente faz upload apenas ao carregar cada textura, usando mapa local por worker. Trocar imediatamente para PixiJS/WebGPU sem medição/paridade não elimina preparo e apresenta risco alto.
- `exportRunner.ts`: JSON final registra fases do trabalho de exportação **depois do preparo pré-IPC**. O tempo da preparação do cabelo na UI fica de fora do relatório principal. Os estágios `prepareCharacterRenderers`, `renderHairlessFaceTarget`, `measureFaceModeCrop`, `serializeFaceSurface` e `bakeHairlessMotionTransition` já têm marcações, mas não estavam agrupados num relatório persistente.
- Historicamente preparação de cabelo ~18,23s quente e exportação ~16,10s quente, **medidos antes de R22–R26 e das alterações de CPU**. Não apresentar como medição da versão atual.

## Hipóteses e sequência (cada etapa com commit, tests e fallback)
| Rodada | Hipótese, intervenção e gate | Risco |
| --- | --- | --- |
| **R27 — Observabilidade** | Relatório local JSON deve incluir tempo da preparação antes do IPC, fases detalhadas, quantidades de surfaces/textures/rigs/atlas; não salvar personagem nem dados de usuário. Comparar custo por fase antes de alterar renderização. | Baixo |
| **R28 — Reação sob demanda** | Quando todos os `rearHair` estão em repouso e a cena é **comprovadamente idêntica**, evitar recapturar/desenhar o quadro inteiro; mudar visual key apenas nos 29 quadros intermediários da reação. Garantir conteúdo de cena e mouth patch na chave, Turbo e limites da transição. | Médio |
| **R29 — Camadas estáticas** | No modo posterior-only, congelar o padding da imagem sem movimento em uma superfície **somente do worker atual**, em vez de recalcular a cópia de cada peça/quadros. Investigar separação exata de posterior dinâmico + fundo estático; **não ativar um modo visualmente diferente sem 7/7 RGBA, 30 quadros e regressões de rosto/ordem alpha**. | Médio/alto |
| **R30 — Preparação compartilhada** | Extrair compilação de materiais/corpo da criação dos renderers normal e sem cabelo. Reusar fontes imutáveis, mantendo renderers separados até haver saída dual com equivalência demonstrada; não usar atalho que remove roupa/cabelo errado. | Alto |
| **R31 — Motor de poses por partes** | Protótipo puramente experimental de IR de peças e transições, preservando transformações, camadas, boca, flipX e RGBA. Testar 7 samples, 30 frames distintos e memória. Só integrar se mais rápido e visualmente equivalente. | Muito alto |

## Gates inegociáveis
1. **G0:** validar a configuração real isolada sem tocar no perfil ativo; se faltar Preset 2, registrar bloqueio, nunca inventá-lo.
2. **G1:** comparar PNG e RGBA exatos do caso normal x experimental em 7 samples, com boca, franja, Posterior, Traseiro, roupa, transparência e flipX.
3. **G2:** comparar 30 quadros distintos, corte Turbo entre workers, p50/p95 e memória. Nunca ajustar tolerâncias para esconder diferença.
4. **G3:** TypeScript, arquitetura, build, suíte Editor V6 e MP4 offscreen no GitHub Actions Windows; pode mostrar regressões, mas não medir Windows 11/AMD.
5. **G4:** 300 frames 1080p CPU/Turbo, três execuções A/B (primeiro export), relatório de preparação + render + encode, prova de áudio e conteúdo, hashes. Sem G4, ganho em segundos é **desconhecido**.

## Decisões
- Não trocar o motor inteiro sem paridade; o spike Canvas2D/Sharp anterior foi mais rápido, porém 0/30 RGBA exatos.
- Não reintroduzir cache de reexportação (R10 foi rejeitada/removida).
- Reações pós-pose são a prioridade atual. Alterações dos modos físico contínuo e loop devem permanecer isoladas.
- Uma ideia que falhar os gates deve ficar como experimento documentado, **não** substituir o renderizador de produção.
- Atualizar o estado de cada rodada nos commits seguintes, com resultados realmente observados no CI/Windows, sem promessas de atingir 10–15 segundos antes da medição.

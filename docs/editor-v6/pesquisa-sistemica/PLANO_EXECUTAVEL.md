# Plano executável — pesquisa → experimento → decisão → implementação

**Regra central:** este backlog **não autoriza o Codex a reescrever o Editor V6**, tocar em projetos locais ou publicar código de produção. Cada item tem um gate e só muda de estado após evidência. O código continua na `Dev-V2`; nova rodada precisa confirmar HEAD e `git status` do checkout onde for executada.

## Fluxo de trabalho e estados

`IDEIA → PESQUISADA → EXPERIMENTO AUTORIZADO → VALIDADA/REJEITADA → ADR APROVADA → PRONTA PARA IMPLEMENTAR → IMPLEMENTADA + REGRESSÃO`.

Toda mudança exige: owner, arquivos, dependências, entradas autorizadas, condição inicial, passos reproduzíveis, artefatos de saída, comandos de teste, critério de aceitação, rollback, impactos nos consumidores e resultado negativo se houver.

## Fase A — fundamentos e pesquisa (apenas documentação)

### AUD-001 — Mapear arquitetura completa
- **Fonte:** [Pesquisa 01](pesquisas/01-ARQUITETURA-GERAL-E-INTEGRACOES.md), mapa e inventário.
- **Já realizado:** mapa estático de camadas, processos e módulos, docs oficiais de Electron/Chromium/SQLite; não mediu runtime.
- **Pendente:** inventário de imports/chamadores no checkout local e mapa de referências vivas vs snapshots; conferir revisão real dos builds.
- **Aceite:** todo fluxo prioritário possui UI→estado→preload→IPC→domínio→persistência→consumidor, com [A CONFIRMAR] explícito se não inspecionado.
- **Proibido:** alterar schemas, IPC ou ownership para "completar" auditoria.

### AUD-002 — Explicar o 50s/9s com mesma entrada
- **Dependências:** snapshot autorizado e backup verificado do `editor v6 06`, hardware Windows 11, commit/working-tree registrados.
- **Protocolo:** [EXP-001](experimentos/EXP-001-CABELO-ON-OFF.md). 3+3 corridas equivalentes, mesma duração/encoder/Turbo/áudio/fonte/cache. Medir **clique até MP4 finalizado**, somando preparo anterior ao job.
- **Saída:** relatório sanitizado com fases, número de reações, contagem de reconstruções, cache, hardware, timecodes e hash do fixture.
- **Aceite:** atribuir as diferenças a subetapas **sem somar tempos concorrentes como parede**.
- **Bloqueio real:** script `benchmark-project-export.cjs` contém título fixo de outro projeto; não removê-lo nem apontá-lo diretamente para userData.

### AUD-003 — Confirmar versão e capacidades do stack
- **Fontes:** `package.json`, `package-lock.json`, EXE real, FFmpeg embutido, GPU/driver Windows.
- **Medir:** `process.versions`, WebGL/WebGL2, WebCodecs disponíveis, tamanho de textura, uso de offscreen/paint, FFmpeg `-encoders` e `-buildconf`.
- **Aceite:** capacidade verificada com checks, não deduzida de documentação "latest".

## Fase A2 — Resultados de pesquisa do Grupo A (somente decisões de investigação)

**Estado:** 15 estudos concluídos na dimensão estática/documental (02–05, 09–11, 13, 15–21); **zero protótipos ou benchmarks executados**. Evidência verificável no código e documentação primária. Estudos 06–08, 12 e 14 ainda são roteiros.

| Ordem | Trabalho executável | Base | Dependências / critério de saída |
|---|---|---|---|
| A2-01 | Profiling seguro de hair ON/OFF com relatório do **preparo pré-job** | [10](pesquisas/10-ANIMACAO-CABELO-FACE-BOCA.md) + [15](pesquisas/15-PROFILING-BENCHMARK-QUALIDADE.md) | Fixture autorizado, 3+3 corridas, total clique→MP4 |
| A2-02 | Traçar `composeHairFrame` e `hairRasterPixels` em repouso/transição | [04](pesquisas/04-CANVAS-SVG-IMAGENS-ALPHA.md) + [05](pesquisas/05-GPU-WEBGL-WEBGPU-NATIVO.md) | Somente depois A2-01; distinguir 0/1/muitas reações |
| A2-03 | PoC de cabelo posterior RGBA ROI sob oclusão correta | [10](pesquisas/10-ANIMACAO-CABELO-FACE-BOCA.md) | RGBA paridade e ganho prep+render, não duplicar cabelo |
| A2-04 | Captura offscreen `capturePage` vs `paint` em 150 frames | [03](pesquisas/03-ELECTRON-JANELAS-WORKERS-CAPTURA.md) | Só se captura aparecer no perfil; frame token e dirty rect |
| A2-05 | Medir pipeline FFmpeg: pipe/encode/mux/probe | [11](pesquisas/11-EXPORTADOR-FFMPEG-CODECS-AUDIO.md) + [19](pesquisas/19-NODE-IPC-STREAMS-BUFFERS.md) | Mesmo encoder CPU, validação H.264/áudio, 150/300 frames |
| A2-06 | Benchmark da preparação de materiais estáticos Sharp × Canvas | [17](pesquisas/17-SHARP-LIBVIPS-NORMALIZACAO-IMAGENS.md) | Se preparo de assets for dominante; PNG/crop/alpha iguais |
| A2-07 | Perfil de React/estado e staleness de face | [09](pesquisas/09-EDITOR-V6-TIMELINE-PREVIA-ESTADO.md) + [18](pesquisas/18-REACT-ZUSTAND-IMMER-ESTADO.md) | Métrica de UI + renderer; preservar undo/redo e relógio |
| A2-08 | Capabilities WebCodecs e PoC de MP4 muxado | [20](pesquisas/20-WEBCODECS-VIDEODECODER-VIDEOENCODER.md) | Só se encode for relevante; mux+áudio+codec são obrigatórios |
| A2-09 | Build portátil e gates de contrato IPC/schema | [16](pesquisas/16-SEGURANCA-BUILD-E-DISTRIBUICAO.md) + [21](pesquisas/21-VITE-TS-ZOD-BUILD-CONTRATOS.md) | Todos os spikes promovidos: CSP, sandbox, Zod, ABI, FFmpeg, recovery |

**Prioridade de execução:** A2-01 → A2-02 → A2-03; a possibilidade de outras intervenções depende dos tempos medidos. Uma pesquisa terminada não autoriza a implementação sem novo gate. A documentação de fontes oficiais não substitui teste do Electron/FFmpeg no EXE.

## Fase B — experimentos isolados (sem produção)

### EXP-CAB-001 — Cabelo em repouso, zero recomposição induzida
- Medir projeto sintético sem mudança de pose mas com fala; com preset ON e OFF.
- Confirmar se há `composeHairFrame`/prep desnecessário em frames estáticos.
- Comparar pixels, RAM e tempo. Se não houver duplicidade, rejeitar hipótese.

### EXP-CAB-002 — ROI/camada RGBA somente do cabelo posterior
- **Depende:** AUD-002 e EXP-CAB-001.
- Preparar pose/rig correto, máscara de oclusão e base sem a camada posterior estática; desenhar reação nos quadros ativos (29 por evento) e repor repouso fora do intervalo.
- Comparar RGBA antes de codificar e MP4; espelho, proporção, flip, roupas, boca, contornos e limites das duas lanes Turbo.
- **Aceite:** nenhum quadro com cabelo duplo/recorte e redução do total de parede inclusive prep.
- Não assumir que MP4 H.264 suporta alpha em clip temporário.

### EXP-CHAR-001 — Materiais e revisões imutáveis por personagem
- **Depende:** mapa de live references/snapshots e inspeção de `preparedCharacterMaterials`.
- Chave deve identificar modelo, pose, roupas, tint, face, estilo de cabelo, rig, crop e revisões; cache limitado, seguro para alterações de origem.
- Aceite: arte e dados equivalentes entre Customizador, Studio e V6 (sem cache stale).
- **Proibido:** recriar cache de MP4 anterior como atalho para "primeira exportação".

### EXP-ELE-001 — Offscreen/capturePage vs paint
- **Depende:** AUD-002 provar captura relevante. Protocolo [EXP-002](experimentos/EXP-002-CAPTURA-OFFSCREEN.md).
- A/B 150 quadros e depois 300, checagem de token/frameId, dirty rect, transparência e seam; limite de buffer e cancelamento.
- Aceite: ganho no total, zero frames stale, pixels equivalentes.

### EXP-ELE-002 — GPU shared texture / Direct3D / AMD
- Depende de EXP-ELE-001 e proof-of-concept com Native addon, sincronização e `release()` explícito.
- Aceite: Windows real, estabilidade e memória/VRAM bounded, paridade visual e ganho total. Sem habilitar recurso experimental por padrão antes disso.

### EXP-FFM-001 — FFmpeg CPU vs AMF e caminho de pixels
- **Depende:** AUD-002 para saber se encode domina. A/B mesmas frames/qualidade/áudio e FFmpeg binário.
- Validar H.264, 1080p30, contagem exata 150/300, PTS, seams, áudio, MP4 final.
- Aceleração de hardware **não substitui** teste de renderização/preparação.

### EXP-RAS-001 — DrawPlan e compositor alternativo
- Primeira rodada somente cenas cujo plano `unsupported` está vazio; sem forçar cabelo/vídeo no backend parcial.
- Testar pose/roupa/texto/face/flip, transparência, PNG de referência e cor.
- Aceite: paridade RGBA definida **antes** de benchmark; qualquer feature não suportada deve dar bloqueio explícito.

### EXP-UI-001 — Fluidez da UI
- Traces de arrastar, scrub, selecionar, abrir mídia e timeline longa. Preservar RAF externo e virtualização já existentes.
- Aceite: comparação de latência/interação e regressão sem perda de estado.

### EXP-DATA-001 — Revisões e gravação transacional
- Mapear escritor/leitor por domínio, cross-domain references, cache invalidation, recuperação após crash.
- Aceite: invariantes e testes de recuperação; não fazer migração real só para mensurar.

## Fase C — decisões e implementação

- `ADR-001`: escolher a intervenção com maior **ganho medido em parede** e paridade, listando alternativas rejeitadas.
- `REF-001`: só então preparar plano por módulo pequeno com feature flag/laboratório, downgrade, testes dos consumidores e reversão.
- Gate completo: `npm run typecheck`, `npm run audit:architecture`, testes específicos, `npm run build`, e validação Windows real quando pertinente. **Estes comandos ainda NÃO foram rodados nesta entrega.**

## Definição de "feito"

Uma pesquisa está feita quando informa arquivos/linhas ou funções verificadas, URLs oficiais e versões, lacunas, experimentos falsificáveis e decisão de próxima rodada. Uma refatoração só está feita com diff, build, testes, benchmark real, validação de paridade e relatório. Não existe "concluído por intenção".

[Estado real](PROGRESSO_E_RESULTADOS.md).

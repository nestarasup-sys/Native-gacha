# Native Gacha — Plano mestre de refatoração PROFUNDA do EXPORTADOR DO EDITOR V6

> **Documento executável e vivo para o Codex — EXCLUSIVAMENTE EDITOR V6**  
> **Repositório:** https://github.com/nestarasup-sys/Native-gacha/tree/Dev-V2  
> **Branch examinada:** `Dev-V2`  
> **Commit remoto observado na reanálise:** `f4dae479d3e8be561741d1ad8b59ea38922b3b23` (05/11/2026)  
> **Natureza da análise:** inspeção estática de arquivos reais e documentação do repositório; **não** houve execução de exportação nem medição local nesta elaboração.  
> **Estado:** plano revisado com nova medição informada pelo usuário (107 s), dois bugs visuais prioritários e obrigatoriedade de nova baseline no projeto autorizado; execução local ainda pendente de Codex.  
> **Responsável pela execução:** Codex, que atualizará este arquivo enquanto trabalha.

---

# ATUALIZAÇÃO OBRIGATÓRIA — 05/11/2026

> **Somente EDITOR V6. Projeto único: `Teste de Importação — Personagens do Pacote`.**
>
> **Novo tempo observado:** **1min47s (107 s)** em **UMA exportação com cabelo animado**. Esse resultado deve ser **medido novamente** pelo Codex com relatório e tempo de ponta a ponta, e comparado ao modo sem cabelo em condições idênticas. Histórico de 92 s e baseline sanitizada de 54,7158 s não são substitutos.
>
> **Correções P0, ANTES de aceitar nova arquitetura:** (1) troca de expressão provoca aparente **achatamento vertical**; (2) pose + expressão simultâneas fazem a **reação do cabelo parecer acelerar/bugar**. Reproduzir, medir, determinar causas, corrigir e adicionar regressões. Não desabilitar animações para mascarar sintomas.
>
> **Execução inteligente:** uma baseline completa inicial ON/OFF; perfil e testes curtos focados; validar bugs; iterar implementações; repetir export completo somente em gates de decisão e no aceite final. Não desperdiçar tempo com reexports longos após cada alteração mínima. **Não usar outros projetos de exportação e não tocar em outras versões do editor.**

---

# LEIA PRIMEIRO — ESCOPO ABSOLUTO E MISSÃO

## 1. Uma única área: Editor V6

**A missão é otimizar e refatorar o Editor V6 que já funciona, especialmente seu motor de exportação. NÃO é uma migração de versão nem a criação de outro editor.**

- **Não usar, copiar, importar, adaptar, comparar, desenvolver, executar testes ou integrar código do Editor V7.** Essa iniciativa experimental está expressamente **fora do escopo**. Não usar seus módulos como referência de implementação, nem tratá-la como plano B.
- Não alterar rotas, interface, documentos, serviços, persistência ou módulos de outra versão de editor. Não criar conversores entre versões.
- Não criar uma nova experiência de edição paralela. O usuário continuará trabalhando na **interface atual do V6**, com seus projetos, controles, presets e botão de exportação.
- É permitido criar um **novo motor interno de exportação exclusivo do V6**, atrás do contrato do próprio V6, caso isso seja melhor do que refatorar o motor atual; isso **não** constitui outro editor.
- É permitido mexer nos módulos `src/shared`, composição de personagens, IPC e serviços compartilhados **somente** quando necessário para o V6, preservando todos os consumidores existentes.
- Experimentos internos podem coexistir com o motor V6 atual durante a validação, mas **não** introduza seis botões de laboratório nem exponha protótipos incompletos como opção de produção.

**Objetivo primário:** um MP4 completo com **animação de cabelo ligada**, produzido em **30 segundos ou menos** no cenário autorizado, sem perda visual/funcional. O tempo medido deve abranger a preparação necessária **antes** de abrir o job, a preparação de movimentos/boca, a renderização, o encoding, a finalização, a validação e a publicação do arquivo. Não contar apenas o loop de quadros.

**Objetivo complementar e gate funcional prioritário:** melhorar também o modo **sem cabelo**, preservar qualidade 1080p/30 FPS e **corrigir antes de promover otimizações**: (1) personagem que aparenta achatar verticalmente quando troca de expressão; (2) cabelo pós-pose que parece acelerar/bugar quando uma troca de expressão ocorre simultaneamente. Também investigar resets ou ausência de reação do cabelo em outras circunstâncias. O valor de 30 s é uma meta de engenharia a provar, não uma autorização para falsear medidas.

**Projeto único para testes de exportação reais:** **`Teste de Importação — Personagens do Pacote`**. **Nova observação do usuário: a última exportação completa com cabelo animado levou 1 minuto e 47 segundos (107 segundos). Medir novamente ANTES de concluir qualquer diagnóstico ou alegar melhoria.** O valor de 107 s é relato de uma execução, não resultado reproduzido pelo Codex nem uma mediana. Nunca utilizar outro projeto de usuário, nem um projeto criado para aparentar ganho. Testes unitários de funções puras, fixtures mínimas sintéticas de geometria e microbenchmarks isolados são permitidos, pois não são exportações de projetos; testes de integração com projeto, MP4 de ponta a ponta e A/B reais usam **apenas cópia verificada do projeto autorizado**.

**Permissões:** investigar, refatorar profundamente, instalar bibliotecas e ferramentas **localmente na pasta do repositório**, fazer spikes, preparar scripts, substituir o motor de exportação do V6 e criar commits locais coerentes. **Não** instalar globalmente, limpar perfis reais, sobrescrever backups, apagar dados pessoais, fazer push, modificar sistemas externos ou desrespeitar `AGENTS.md`.

---

# 2. REANÁLISE DO EDITOR V6 — FATOS DO CÓDIGO

## 2.1. Tecnologias e caminho real

O Native Gacha é **Electron + React + TypeScript**. A arquitetura do V6 já possui fronteiras, porém o **render do MP4 ainda depende de um ciclo de desenho/captura no Chromium**. Isso é diferente de dizer que o preview e a exportação são literalmente a mesma janela; eles **já** estão separados parcialmente. O trabalho é remover dependências, alocações e rondas de captura desnecessárias **dentro do exportador V6**, preservando a mesma descrição da cena.

Caminho confirmado:

```text
EditorV6ExportPanel.tsx
  └─ editorV6ExportCommands.ts
       ├─ snapshot/clonagem do documento e opções
       ├─ preparação de cabelo no renderer da UI, quando ligada
       │    └─ editorV6HairMotionPreparation.ts
       └─ startEditorV6Export (IPC)
            └─ electron/domains/editorV6/exportIpc.ts
                 ├─ validação de documento, modo e pacote de cabelo
                 ├─ coordenação do job / cancelamento / destino
                 └─ exportRunner.ts
                      ├─ prepareMotions.ts + motionCache.ts
                      │    └─ bakes/atlases em workers de movimento
                      ├─ prepareMouthLoops.ts (por parte/trecho)
                      ├─ exportWorkers.ts: BrowserWindows ocultas/offscreen
                      │    └─ exportWorker.tsx: React/SceneSurface + animação
                      │         └─ executeJavaScript → paint/token → capturePage
                      ├─ BGRA → stdin FFmpeg / H.264
                      └─ FFprobe / finalização / publicação / relatório
```

**Observações fundamentadas:**

1. `src/renderer/src/features/editorV6/EditorV6ExportPanel.tsx` define por padrão **1920×1080, Turbo ligado, CPU, boca ligada, ciclo de 30 quadros, reação de cabelo após pose e somente Posterior**. O início chama `runEditorV6ExportCommand`, que aguarda a preparação do cabelo **antes** do `startEditorV6Export`.
2. `editorV6ExportCommands.ts` faz um snapshot desvinculado do estado React/Immer. Esse isolamento é uma proteção; não eliminá-lo ao otimizar.
3. `electron/domains/editorV6/exportIpc.ts` valida modo, preset, loop e pacote de cabelo; mantém jobs e controle de origem do IPC. Preservar todos esses contratos e os fluxos de cancelamento.
4. `electron/domains/editorV6/exportRunner.ts` usa `prepareExportMotions`, prepara boca para partes do Turbo, desenha os frames usando workers e envia **raw BGRA** ao FFmpeg. A preparação da boca ocorre **dentro** das partes, não é necessariamente uma fase isolada e somável ao tempo final.
5. `electron/domains/editorV6/exportWorkers.ts` cria `BrowserWindow` invisível com `offscreen: true`, utiliza `executeJavaScript` para solicitar o desenho, verifica **token pintado no próprio bitmap** antes de aceitar `capturePage` e envia buffers ao runner. O token evita exportar um frame antigo; não pode ser descartado num experimento sem barreira substituta equivalente.
6. `src/renderer/src/features/editorV6/exportWorker.tsx` mantém mapas de rigs, texturas, estados de cabelo, canvas e cabeças, e usa `flushSync`/`SceneSurface` para compor quadros. Há recuperação de frame estático e reutilização parcial. Qualquer troca de renderer precisa reproduzir composição, camadas, alpha, texto, rosto, boca, roupas, poses, cabelo e mídia.
7. `src/shared/editorV6TimelineScene.ts` **já** resolve a cena por número absoluto de frame: `resolveEditorV6SceneAtFrame`. Portanto, **não refazer toda a timeline**. A fragilidade potencial está em estados auxiliares, dependências de atlas e simulação do cabelo.
8. `src/shared/hairMotionEngine.ts` implementa física de cabelo a **120 Hz**, prewarm e `advanceHairMotionToFrame`. Em modo *pose reaction only*, o `exportWorker.tsx` usa amostragem de resposta por evento de fim de transição, e outros modos usam loop ou simulação com estado. Isso não prova a causa dos bugs; exige investigar seleção e ordenação de eventos, identidade de peça e os limites do movimento.
9. `editorV6HairMotionPreparation.ts` ainda prepara variantes **com e sem cabelo** do renderizador de personagem e trabalha com superfície/face/crop/rigs. Já há compartilhamento de materiais/roupas, portanto a oportunidade é medir **o que ainda duplica** — não supor que não exista cache nenhum.
10. `motion/bakeMotion.ts` prepara rigs e atlases, com tentativas de reuso de extremos e amostras intermediárias. `prepareMotions.ts` agrupa trabalhos por personagem e coleta métricas. Otimização baseada em identidade visual deve explicar primeiro por que os hits são baixos.
11. Há um **protótipo V6 exclusivo** de desenho por peças, `src/shared/editorV6PartMotionPrototype.ts` e `src/shared/editorV6PartRasterRenderer.ts` (R37). Ele ainda **não** cobre fielmente corpo, articulações, roupas, recortes, expressão e cabelo; não conectá-lo diretamente ao export final sem paridade.
12. A `Dev-V2` mais recente inclui bibliotecas de mídia/ativos ligados por ID no V6 (`EditorV6MediaLibraryPage.tsx`, `editorV6Media*` e rotas IPC). A refatoração deve preservar áudio/vídeo vinculados, resoluções de assets, referências e direitos de acesso; a baseline sem mídia não cobre todos os casos.

## 2.1.1. Nova investigação prioritária — expressão, geometria e resposta do cabelo (05/11/2026)

**Sintomas observados pelo usuário, ainda NÃO diagnosticados:**

- **BUG-VIS-01 — achatamento vertical:** o personagem aparenta perder parte de sua altura, mesmo que discretamente, ao trocar de expressão. Investigar no preview, no MP4 e no período de transição, sem assumir que o corpo realmente mudou de escala; pode ser distorção por recorte/atlas e `preserveAspectRatio="none"`.
- **BUG-VIS-02 — interferência expressão × cabelo:** depois de uma troca de pose, o cabelo deve executar sua reação natural; se uma expressão também muda, o balanço parece acelerar, reiniciar ou sofrer descontinuidade. Distinguir **mudança real na curva de cabelo** de **deformação visual do personagem/crop**, que pode produzir a mesma impressão.

**Pistas concretas para o Codex investigar (NÃO são causas comprovadas):**

1. `src/shared/editorV6Motion.ts`: `faceSignature()` inclui **`poseSlot` e atributos de expressão**; `editorV6MotionPlan()` gera planos quando a assinatura muda e há condições válidas. Classificar cada plano em **só pose**, **só expressão**, **pose + expressão** e **outras mudanças**, ao invés de tratar tudo como transição equivalente. Comparar `from.poseSlot` e `to.poseSlot` além dos hashes de expressão.
2. `src/shared/hairMotionEngine.ts`: `hairMotionPoseReactionEndFrames()` **já filtra mudanças sem alteração de `poseSlot`**, e `sampleHairMotionPoseReaction()` usa **30 frames** e amostragem temporal absoluta. Portanto **não afirmar que expressão pura dispara a reação** sem capturar evidência; investigar eventos simultâneos, recorte, `rig` e caminho de composição.
3. `src/renderer/src/features/editorV6/exportWorker.tsx`: checar `hairPoseReactionEnds`, `hairRigAtFrame`, `hairTransitionIndex`, troca de `rasterCanvases`, `motionSprite`, `composeMotionHairFrame`, `hairSourceAssetId`, `headPaths` e `headPathPrevious` durante o mesmo frame da mudança de expressão/pose. Verificar se uma variante muda visualmente o tempo/escala da malha, mesmo com `sampleHairMotionPoseReaction` idêntico.
4. `src/renderer/src/features/editorV6/SceneSurface.tsx`: o personagem e os sprites de atlas utilizam dimensionamento e `preserveAspectRatio="none"`; confrontar `editorV6ElementSize`, `width/height`, `viewBox`, `motionSprite`, crop de alpha, `characterCanvasWidth`, `characterHeightScale` e pivôs. O *achatamento* pode resultar da imagem recortada redimensionada em viewport de altura fixa, mas isso requer validação.
5. `src/renderer/src/features/editorV6/faceModeAssets.ts`, `sceneFaceComposition.ts`, `motion/bakeMotion.ts`, `src/shared/editorV6MotionInterpolation.ts` e `src/shared/editorV6HairMotion.ts`: comparar bounds/union crop entre expressões, dimensão do atlas, `facePatch`, coordenação do rosto, `shapeScaleY`, `sourceCrop.height`, `outputHeight`, transforms e geometria da cabeça. Identificar **qual valor muda exatamente** no primeiro frame defeituoso.

**Regra:** corrigir o ponto proprietário da causa real. Não mascarar o defeito forçando altura fixa, desabilitando expressões, removendo animação, reduzindo intensidade ou alterando velocidade por arbitragem. Primeiro obter as curvas, bounds e frames comparados.

## 2.2. Baseline e interpretação honesta

Há um relatório sanitizado versionado em:

- `docs/editor-v6/baselines/native_gacha_nova_baseline_2026-11-05.md`
- `docs/editor-v6/baselines/native_gacha_nova_baseline_2026-11-05.json`

| Medida do relatório de 05/11/2026 | Valor registrado | Como interpretar |
|---|---:|---|
| MP4 completo, incluindo preparo pré-job | **54,7158 s** | **Uma única amostra**, não mediana |
| Tempo do job principal | **44,2128 s** | Exclui preparo anterior de cabelo |
| Preparação de cabelo antes do job | **10,5030 s** | Soma-se ao job nesta amostra |
| Preparação das 21 transições | **23,7045 s** | Já está **dentro** do job |
| Renderização + encode | **17,7905 s** | Etapa do job, com subetapas sobrepostas |
| Atlas/loop de boca | **8,5964 s** | Subetapa de renderização; **não somar novamente** |
| Capturas acumuladas de dois workers | **16,3693 s** | Soma concorrente, **não** tempo de parede recuperável |
| Rigs preparados / reutilizados | **141 / 0** | Não comprova que eram rigs idênticos |
| Frames realmente desenhados / reutilizados | **292 / 17**, de 309 | Sem fallback; emenda Turbo validada |
| Cache de movimentos | 0 hits RAM / 0 hits disco | Cenário frio dos movimentos |
| Encoder e configuração | CPU `libopenh264`; 1080p/30; Turbo 2×; Preset 2 | Cenário registrado, sem áudio/vídeo |
| RAM | RSS Main 655,2 MiB | Não representa toda a RAM do Electron/GPU |

**ATUALIZAÇÃO 05/11/2026 — observação mais recente do usuário: export completo COM cabelo animado = 1min47s = 107 segundos.** O Codex deve repetir a exportação no projeto autorizado e registrar build, preset, duração, hardware e condições reais. **Não tratar 107 s como baseline de código comprovada** e não medir só o job depois do preparo; é necessário confirmar se o tempo informado inclui toda a preparação e o fechamento do MP4. O relato anterior de **92 s** e a baseline documentada de **54,7158 s** são históricos distintos. Não misturar 107 s, 92 s e 54,7158 s como A/B. O relatório sanitizado não inclui hash verificável do ID do projeto; **confirmar no ambiente local se essa baseline corresponde exatamente ao projeto autorizado**, sob mesmas configurações. Se não for comparável, criar uma nova baseline com o projeto correto, sem descartar a histórica.

**Hipótese principal, não conclusão:** há oportunidade forte em preparação de transições (23,7 s), preparo de cabelo (10,5 s) e custo de render/captura (17,8 s). **Trocar encoder isoladamente não elimina pré-preparo**, e a soma dos tempos dos dois workers não equivale ao tempo de relógio.

## 2.3. Investigações existentes a aproveitar — SOMENTE V6

- `docs/editor-v6/ARQUITETURA_SALTO_REAL_EXPORTADOR_2026-11-05.md`: diagnóstico V6, propostas de compilação de cena, compositor por peças e buffers. Ler com critério, sem assumir que hipóteses já passaram nos gates.
- `docs/editor-v6/ZONA_GUERRA_PRIORIDADES_POS_BASELINE_2026-11-05.md`: prioridades P0–P3, limites de benchmark e telemetria.
- `docs/editor-v6/ZONA_GUERRA_PENDENCIAS.md`: status separado de implementação, teste escrito e comprovação real.
- `docs/editor-v6/ZONA_GUERRA_R37_STATUS_E_GATES.md`: limites da rasterização experimental por peças.
- `docs/editor-v6/ALTERNATIVAS_EXPORT_SEM_CHROMIUM_2026-11-04.md`: ideias de bibliotecas e técnicas externas, **somente como pesquisa para o V6**.
- `scripts/editor-v6/benchmark-project-export.cjs`: benchmark com modos `--hair-preset-slot`, `--no-hair-control`, `--hair-preparation-only`, faixa, repetição e cópia local do projeto autorizado. **Leia o `--help`/código e confirme caminhos antes de usar.**
- `scripts/editor-v6/compare-real-export.cjs`: comparação sanitizada; para provar identidade do projeto, requer relatório original local via `--reference-report`.
- `scripts/editor-v6/rapid-gates-windows.cjs`: `doctor`, `unit`, `offscreen`, `integration`; testes rápidos Windows x64 sem tocar em perfil pessoal no modo rápido.
- `tests/editor-v6/`: testes de preparação, cache, motion, cabelo, export, IPC, captura, paridade e integração Electron.
- `.github/workflows/editor-v6-parity.yml`, `.github/workflows/zona-guerra-export-lab.yml`: CI; útil para regressão, **não** substitui medição na máquina real.

**Regra:** investigar o que está implementado, o que existe apenas como script/protótipo e o que já foi realmente medido. Nunca declarar uma solução completa porque o nome do arquivo sugere que ela existe.

---

# 3. ARQUITETURA-ALVO — NOVO MOTOR INTERNO, MESMO V6

```text
                    EDITOR V6 EXISTENTE
               React / timeline / projeto / preview
                              │
             snapshot versionado e validado do V6
                              │
                              ▼
               Compilador de cena do V6
        assets + personagem + poses + eventos + mídia
                              │
              ┌───────────────┴────────────────┐
              ▼                                ▼
   Avaliador semântico por frame         Cache imutável
   tempo absoluto / checkpoints          texturas, corpo,
   cabelo, boca, olhos, poses             face, roupas, rigs
              └───────────────┬────────────────┘
                              ▼
               Renderizador exclusivo V6
         backend atual seguro | backend novo validado
                              │
                              ▼
             Buffers RGBA/BGRA gerenciados
             fila limitada / ordenação / cancelamento
                              │
                              ▼
                FFmpeg / encoder escolhido
                      mux áudio/vídeo
                              │
                              ▼
                   ffprobe / publicação
                       relatório V6
```

**Isso é arquitetura desejada para INVESTIGAR, não uma decisão de reescrever tudo imediatamente.** Nenhum backend pode alterar silenciosamente a aparência final. O contrato semântico continua pertencendo ao documento/timeline V6. O exportador atual é o **oráculo de compatibilidade**, exceto onde houver bugs conhecidos, que devem ter comportamento correto explicitamente especificado.

## 3.1. Contratos propostos (adaptar aos tipos reais antes de implementar)

```ts
interface V6ExportSnapshot {
  projectRevision: string;
  sceneRevision: string;
  totalFrames: number;
  width: number;
  height: number;
  fps: 30;
  exportOptionsHash: string;
}
interface V6EvaluatedFrame {
  frame: number;                 // índice absoluto, nunca clock da UI
  drawPlan: readonly unknown[];  // substituir por comandos V6 tipados
  dependencies: readonly string[];
}
interface V6ExportRenderer {
  prepare(snapshot: V6ExportSnapshot, signal: AbortSignal): Promise<void>;
  render(frame: V6EvaluatedFrame, signal: AbortSignal): Promise<V6FrameLease>;
  dispose(): Promise<void>;
}
interface V6FrameLease {
  bytes: Uint8Array;
  width: number;
  height: number;
  format: 'BGRA8' | 'RGBA8';
  release(): void;
}
```

**Invariantes:** o frame `N` deve representar o mesmo instante após seek, reprodução contínua ou partição Turbo. O núcleo de avaliação não deve depender de `requestAnimationFrame`, de `Date.now()` ou de estados de componente React. Se física exigir histórico, usar integração determinística, checkpoints, curvas pré-amostradas ou modelo analítico com custo medido. Não assumir avaliação aleatória O(1) sem comprovar.

## 3.2. Caminhos concorrentes PERMITIDOS — todos dentro do V6

**A. Modernizar o exportador atual do V6.** Manter renderizadores Electron offscreen, reduzir preparação/cópias, melhorar cache e processamento por frame. Menor risco de paridade; talvez não alcance a meta.

**B. Substituir o backend de composição INTERNO ao V6.** Compilar comandos visuais completos do próprio V6 e renderizar para buffer sem screenshot do DOM. Reutilizar estruturas V6 (`resolveEditorV6SceneAtFrame`, recursos do Fabricador/Customizador e protótipo R37 **após** ampliar paridade). Maior potencial e maior risco; o trabalho é do **exportador V6**, não de outro editor.

**C. Híbrido V6.** Desenhar camadas comprovadamente equivalentes em compositor dedicado e manter um caminho compatível para efeitos complexos. Só usar se o custo de troca/cópia não anular a vantagem.

Comparar A/B/C por **tempo total e correção visual** no mesmo projeto. Nenhuma delas é escolhida automaticamente. O Codex pode criar uma alternativa D própria, sempre **dentro do V6**.

---

# 4. PAINEL VIVO DA MISSÃO

Atualizar após cada tarefa relevante, benchmark, mudança de arquitetura ou commit. Os números abaixo NÃO são resultados de execução deste plano.

| Campo | Estado inicial |
|---|---|
| Área do produto | **Editor V6 somente** |
| Branch alvo | `Dev-V2` — confirmar checkout antes de trabalhar |
| Commit da análise remota | `f4dae479d3e8be561741d1ad8b59ea38922b3b23` |
| Projeto de teste | `Teste de Importação — Personagens do Pacote` |
| Baseline histórica documental | 54,7158 s (identidade/revisão do projeto a confirmar; não usar como novo baseline) |
| **Último tempo informado pelo usuário, com cabelo** | **107 segundos (1min47s), uma exportação; confirmar configuração e reproduzir** |
| Ganho necessário para 30 s frente aos 107 s observados | **77 s de redução (~72,0%) ou ~3,57× de aceleração**, apenas referência aritmética |
| Outra observação do usuário | 92 s (histórico separado, não comparável sem metadados) |
| Baseline local com cabelo | **159,22 s ponta a ponta**, 1 execução completa, build `aad4b46`; preset 1; 2394 quadros; 1920×1080/30; Turbo; 4 áudios; `h264_amf`; cold motion cache. Não comparável ao relato de 107 s sem metadados equivalentes. |
| Baseline local sem cabelo | **77,64 s de job**, 1 execução completa, mesmas fontes/configuração de cena/build; o harness desta rodada não registrou intervalo clique→MP4 validado, então não comparar como ponta a ponta com ON. Estado de cache não confirmado neste relatório. |
| Melhor tempo completo validado | **159,22 s ON ponta a ponta** (uma amostra; ainda acima da meta) |
| Meta | ≤30 s, qualidade preservada |
| Bug cabelo — reset | Investigação aberta; comparação de segmentos ON/OFF pendente |
| Bug cabelo — ausência de reação | Em inspeção; imagens amostradas ainda não confirmam ausência nem correção |
| **BUG-VIS-01 — achatar na troca de expressão** | Imagens de 4 tracks em eventos de expressão não mostram achatamento inequívoco; falta medir bounds/geometria por quadro |
| **BUG-VIS-02 — cabelo altera velocidade com expressão simultânea à pose** | Projeto tem expressão 18 quadros após pose (dentro da reação de 30 quadros); falta comparação da curva/pixels controlada |
| Gargalo medido nesta rodada | Render 98,02 s; preparação de cabelo 28,60 s; preparação de movimentos 18,64 s. Captura 14,03 s acumulados em workers (subfase, não somar às fases de parede). |
| Etapa ativa | **E0 / E0A: fechar mapa de evidências e reprodução; depois corrigir defeitos e atacar gargalos.** |
| Próxima tarefa | Reproduzir geom./cabelo em segmentos focados do projeto verificado; mapear o fluxo de exportação e corrigir lacunas do benchmark ON/OFF. |
| Último commit feito POR ESTA MISSÃO | Ainda sem commit; correções de testes e este registro estão em revisão. |
| Situação global | **Em andamento; nenhuma meta de performance ou correção visual declarada concluída.** |

**Não substitua um campo pendente por uma estimativa.** Se o projeto local tiver mudado, atualizar as referências e justificar por que números antigos deixam de ser comparáveis.

---

# 5. METODOLOGIA DE EXECUÇÃO: TAREFAS AUTÔNOMAS E DOCUMENTO VIVO

## 5.1. Status e rastreabilidade

- `[ ]` Pendente; `[~]` Em andamento; `[x]` Concluída **e validada**; `[!]` Bloqueada; `[-]` Cancelada com justificativa.
- IDs são estáveis (`E0-T001`, `E1-T001`, etc.); não renumerar tarefas antigas.
- Pode **adicionar tarefa à Etapa 0 estando na Etapa 8**, reabrir qualquer etapa, criar etapas novas, dividir, agrupar, eliminar ou reorganizar tarefas conforme as evidências.
- A ordem das etapas é um roteiro **adaptável**, não uma sequência rígida. Respeitar dependências técnicas e gates.
- **Não** gastar a sessão inteira marcando tarefas; depois de estruturar o documento, começar imediatamente a investigação/implementação real.

## 5.2. Registro mínimo de cada tarefa

```md
### [ ] E4-T003 — Nome objetivo
**Estado:** pendente | **Prioridade:** P0/P1/P2 | **Dono do módulo:** arquivo(s)
**Hipótese/evidência:** ...
**Critério de aceite:** ...
**Experimento/execução:** ...
**Antes → depois:** ... | **Paridade:** ... | **RAM:** ...
**Arquivos alterados:** ... | **Commit(s):** hash(s) REAL(is)
**Decisão:** adotar / refinar / investigar / reverter / descartar
**Novas tarefas:** IDs ...
```

A checklist inicial a seguir é suficiente para começar; **o Codex deve expandir o registro de cada tarefa à medida que a executar**. Atualizar sempre o painel, backlog e estado de retomada.

## 5.3. Regra de commits

- Ler `AGENTS.md`, `git status` e diffs antes de editar.
- Commits **locais**, pequenos e auditáveis: `perf(editor-v6): ...`, `fix(editor-v6): ...`, `refactor(editor-v6): ...`, `test(editor-v6): ...`, `tools(editor-v6): ...`.
- Não criar commits fictícios, não publicar, não fazer push, não mexer em dados originais.
- Se várias tarefas fizerem parte de um commit, vincular todas ao hash. Se a implementação falhar, deixar registro técnico, reverter somente suas próprias mudanças de modo não destrutivo.

---

# 6. ETAPA 0 — RECONHECIMENTO, PROTEÇÃO, BASELINE E MATRIZ DE PARIDADE

**Gate:** nenhum resultado de performance deve ser promovido sem projeto, condições, build e saída equivalentes.

- [~] **E0-T001 — Confirmar código real:** branch `Dev-V2`, HEAD `aad4b46`, status/diff revisados; Node 24.18, Electron 45.1, Windows 11 Pro 26300, Ryzen 5 4600G, Radeon RX 7600. Driver da GPU e versão Chromium ainda pendentes.
- [ ] **E0-T002 — Mapear os pontos de entrada V6:** botão/UI → snapshot → preparo de cabelo → IPC → runner → preparo movimentos/boca → workers → captura → FFmpeg → FFprobe; identificar lifecycle, cancelamento e publicação.
- [ ] **E0-T003 — Mapear contratos visuais:** cores/tint, roupa deformada, camadas Posterior x Traseiro, rosto, blink, expressão, boca, transição, espelho, balões/texto, fundos, alpha, vídeo, áudio e sincronização.
- [ ] **E0-T004 — Catalogar estratégias V6 já existentes:** Turbo 2×, cache de movimentos, reuso de materiais, 2 renderers de cabelo, R32–R37, reutilização de frames, modos de teste internos. Indicar o que está em produção, protótipo ou desligado.
- [x] **E0-T005 — Proteger o único projeto autorizado:** backup verificado; todas as entradas do manifesto conferidas por tamanho e SHA-256; ON/OFF executados em pastas de perfil isoladas. Fontes preservadas; não publicar IDs, hashes nem mídia.
- [ ] **E0-T006 — Fixar o relato mais recente e identidade:** registrar **107 s (1min47s), COM cabelo**, como observação não verificada; conferir se 54,7158 s pertence à mesma cópia mediante relatório original local; preservar 92 s separadamente. Usar como baseline nova somente medições completas realizadas pelo Codex no projeto autorizado e configuração fixada.
- [~] **E0-T007 — REFazer medição real (P0):** concluídas uma exportação completa ON e uma OFF em cópias verificadas, ambas 2394 quadros, 1920×1080/30, Turbo e 4 áudios, build `aad4b46`. ON: preset 1, `h264_amf`, 159,22 s clique→MP4 validado, cache de movimentos frio (28,60 s preparo de cabelo + job 130,59 s). OFF: 77,64 s de job; o relatório do harness OFF não contém tempo clique→validação nem estado de cache. Fazer rodada comparável apenas quando o protocolo registrar o mesmo intervalo, sem repetir full export a cada mudança.
- [~] **E0-T008 — Criar snapshots visuais e repro de bugs:** gerados quadros amostrados de expressão para as 4 tracks e janela 750–795; inspeção não mostra achatamento conclusivo. Mapear pose+expressão temporalmente sobrepostos e extrair 30 quadros de cabelo ainda pendente.
- [~] **E0-T009 — Medir recursos completos:** uma amostra ON registrou RSS de Main/benchmark renderer/export renderer/GPU até ~0,93/1,02/0,92/0,92 GiB (working set); FFmpeg ~0,29 GiB e ~325% CPU pico. Readback 14,03 s acumulados/297 capturas. Repetições, GPU driver/uso dedicado e disco/GC ainda pendentes.
- [ ] **E0-T010 — Criar matriz de paridade:** requisito, módulo dono, caso de teste, evidência, tolerância visual acordada e risco. Especificar a correção desejada do bug do cabelo, não preservar falha como golden.
- [ ] **E0-T011 — Criar primeiro relatório de gargalos:** tempo de parede por fase e caminho crítico, distinguindo subfases e sobreposição; priorizar por potencial real de redução do total.
- [~] **E0-T012 — Atualizar o Markdown:** painel e retomada atualizados com limitações de comparabilidade, medições e gates; aprofundar matriz de paridade e prosseguir para correção/otimização.
- [ ] **E0-T013 — Registrar a revisão visual do projeto:** hash de conteúdo de cópia autorizada, timestamps de troca de expressão e pose, parâmetros do preset real e status de cabelo ON/OFF; não modificar a fonte.
- [ ] **E0-T014 — Teste de diagnóstico direcionado:** apenas em cópia do projeto autorizado, comparar trechos **expressão somente**, **pose somente**, **pose + expressão**, com cabelo ON/OFF, sem reconfigurar a baseline principal. Restaurar a cópia e preservar hashes depois.
- [ ] **E0-T015 — Recuperar relatórios locais com autorização:** se o export de 107 s deixou logs JSON, ler somente os relacionados ao projeto autorizado, sem copiar dados pessoais ou publicar ID; correlacionar métricas ao novo baseline.

**Comandos existentes para leitura/validação (confirmar scripts em `package.json` local antes):**

```bash
npm run test:editor-v6:doctor
npm run test:editor-v6:quick
npm run test:editor-v6:quick-offscreen
npm run test:editor-v6:integration
npm run test:editor-v6
npm run typecheck
npm run audit:architecture
npm run build
```

O benchmark real `scripts/editor-v6/benchmark-project-export.cjs` exige múltiplas pastas de cópia e configurações; **não inventar parâmetros nem executá-lo contra dados originais**. O comparador `scripts/editor-v6/compare-real-export.cjs` pode rejeitar uma baseline sanitizada por falta do relatório original local; respeitar esse bloqueio.

---

# 6A. ETAPA 0A — CORREÇÃO PRIORITÁRIA DE EXPRESSÃO, ALTURA E SINCRONIZAÇÃO DO CABELO

**P0, antes de promover alterações grandes de exportação.** O Codex deve seguir a trilha de bugs mesmo quando fizer profiling em paralelo. O sucesso não é mudar um número; é **eliminar o achatamento** e **preservar a resposta do cabelo quando a expressão muda**, comprovados com vídeos/frames.

## 6A.1. Cenários mínimos no MESMO projeto autorizado

Usar **somente a cópia isolada de `Teste de Importação — Personagens do Pacote`**. Não criar projeto de demonstração diferente. Se o projeto não contiver naturalmente algum cenário, gerar **variante temporária exclusivamente dessa cópia** (sem modificar a referência imutável de benchmark) e registrar exatamente o que mudou; testes de unidade de funções puras ainda podem usar entradas sintéticas.

| Cenário | Pose | Expressão | Cabelo | O que verificar |
|---|---|---|---|---|
| A | Fixa | Troca | OFF | Corpo/altura e face não podem encolher ou esticar |
| B | Fixa | Troca | ON | Nenhum impulso de pose espúrio; proporções estáveis |
| C | Troca | Fixa | ON | Reação única, natural, com fase correta |
| D | Troca | Troca simultânea | ON | Mesma lei temporal do cabelo de C; expressão não acelera o balanço |
| E | Troca | Troca simultânea | OFF | Geometria não pode achatar sem cabelo |
| F | Troca | Troca próxima/encadeada | ON | Sem reset inesperado, sem pulos e sem perda de reação |

Capturar pré/primeiro/meio/último frame de cada evento; para o cabelo, comparar pelo menos os **30 frames** de reação pós-pose com curvas e imagens, não apenas o primeiro e o último. Avaliar preview e export separadamente. Distinguir **picos de velocidade da deformação real do cabelo** de **mudança na escala do sprite que simula aceleração visual**.

## 6A.2. Tarefas de engenharia

- [ ] **E0A-T001 — Reproduzir e localizar:** no projeto autorizado, descobrir frame(s), personagem(ns), expressão(ões), pose(s), preset, modo ON/OFF e se ocorre no preview, export ou ambos. Se não reproduzir imediatamente, montar variante controlada dentro da cópia autorizada sem criar outro projeto.
- [ ] **E0A-T002 — Telemetria da geometria:** por frame afetado registrar `width`, `height`, `characterScale`, `characterWidthScale`, `characterHeightScale`, `characterCanvasWidth`, `motionSprite`/`viewBox`, `asset` width/height, alpha bounds, `crop`, `facePatch`, `rig.outputHeight`, `rig.sourceCrop.height`, `shapeScaleY` e bounding box efetiva do personagem. Não registrar imagem ou identidade em logs compartilháveis.
- [ ] **E0A-T003 — Separar as três transições:** extrair do `editorV6MotionPlans` os eventos **expressão apenas**, **pose apenas** e **pose+expressão**, verificando `faceSignature`, `poseSlot`, `startFrame`, `endFrame`, `samples`, atlas e aplicação no `exportWorker.tsx`. Validar quais eventos REALMENTE produzem reação e quais só mudam a rasterização.
- [ ] **E0A-T004 — Corrigir o achatamento vertical na causa:** comparar `SceneSurface.tsx` (`preserveAspectRatio="none"`), `editorV6ElementSize`, resolução de cena, `faceModeAssets.ts`, `sceneFaceComposition.ts`, `bakeMotion.ts` e `editorV6MotionInterpolation.ts`. Preservar **altura física aparente e proporções do corpo** se pose/tamanho não mudaram; expressão pode modificar **somente as partes que deveria**. Se transformação corporal foi intencional na timeline, respeitá-la e documentar a diferença.
- [ ] **E0A-T005 — Corrigir a reação do cabelo ao coincidir com expressão:** comparar os **eventos de pose** de `hairMotionPoseReactionEndFrames` e a saída de `sampleHairMotionPoseReaction` com o estado renderizado (`hairRigAtFrame`, `composeMotionHairFrame`, `hairMotionLatestPoseEnd`, `headPaths`). **Preservar a mesma curva de reação para a mesma troca física de pose**; não permitir que a transição de expressão reescale, reinicie ou altere sua velocidade aparente por mudança não intencional de crop/rig/frame.
- [ ] **E0A-T006 — Garantir independência das fontes de tempo:** pose e expressão podem compartilhar a timeline, mas avanço da expressão **não** deve retemporizar a reação do cabelo. Usar índice absoluto e IDs de evento, sem usar duração/`progress` de expressão para reiniciar a curva pós-pose.
- [ ] **E0A-T007 — Isolar atribuição da causa:** testar se o achatamento e a aceleração têm **mesma origem geométrica** ou são dois defeitos distintos. Não supor que o cabelo acelera fisicamente: registrar offsets `Float32Array`, fase, escala vertical, crop e posição em frames equivalentes.
- [ ] **E0A-T008 — Criar regressões automáticas:** teste de personagem com expressão-only preservando dimensão corporal; pose-only com reação única; pose+expressão com curva idêntica à pose-only quando parâmetros físicos forem iguais; frame antes/depois, seek aleatório, emenda Turbo, cabelo OFF. Cobrir face, boca, piscada, flip, roupas e alpha.
- [ ] **E0A-T009 — Validar visualmente no projeto autorizado:** exportar trechos curtos para depuração e depois **export completo**, com cabelo ligado e desligado, **somente no projeto autorizado**; comparar preview e MP4; nenhum achatamento não intencional nem aceleração, reset ou congelamento anormal.
- [ ] **E0A-T010 — Documentar causa raiz e commit:** registrar diagnóstico demonstrado, arquivos, screenshots/curvas locais, resultado de testes e hash do commit local; atualizar a matriz de paridade antes de voltar à otimização profunda.

**Gate obrigatório:** não integrar novo renderer, novo cache ou estratégia de exportação que altere geometria/temporização **até que esses bugs estejam corrigidos no V6 ou que a correção tenha um contrato verificável e testes que impeçam regressão**. Permite-se instrumentar e medir paralelamente. Não empurrar o bug para o futuro apenas para atingir a marca de 30 s.

---

# 7. ETAPA 1 — PROFILING PERMANENTE DO V6 E CAUSA RAIZ

**Objetivo:** saber onde cada segundo desaparece, não fazer tentativas cegas.

- [ ] **E1-T001 — Timer de ponta a ponta:** iniciar antes de `prepareEditorV6HairMotionBundle`, parar somente quando MP4 íntegro estiver publicado; incluir cancelamentos/erros como status distinto.
- [ ] **E1-T002 — Rastrear cadeia UI/IPC:** clone de documento, serialização de bundle, transporte, filas, bloqueios, inicialização da janela e custo de compilação dos assets.
- [ ] **E1-T003 — Instrumentar bakes:** custo por transição, amostra, pose/rig, **eventos de expressão-only vs pose-only vs combinados**, upload, atlas, recorte, PNG, hidratação e invalidadores; contadores reais de builds/hits/evicções.
- [ ] **E1-T004 — Instrumentar preparo do cabelo:** custo de renderizador normal/sem cabelo, roupas, rosto, crop, desenho, `toDataURL`, texturas e transferência do bundle.
- [ ] **E1-T005 — Instrumentar boca:** bakes globais e por partição Turbo, atlas, fontes repetidas, cache, custo temporal e consumo de memória.
- [ ] **E1-T006 — Instrumentar cada frame:** tempo de resolução semântica, render React/SceneSurface, desenho Canvas/WebGL, token, captura, cópia, bytes e write/backpressure FFmpeg.
- [ ] **E1-T007 — Capturar paralelismo corretamente:** início/fim de cada worker, janela, captura, write e encoder; construir timeline para separar tempo de parede de soma de tempos concorrentes.
- [ ] **E1-T008 — Produzir relatório JSON sanitizado:** build SHA, dirty flag, cache cold/warm, hardware, encoder efetivo, FPS/duração, fases, memória e validade da comparação; nunca armazenar mídia/IDs pessoais no GitHub.
- [ ] **E1-T009 — Relatório humano legível:** gerar tabela com top gargalos, porcentagens calculadas sobre caminho crítico e proposta de experimento mais barato.
- [ ] **E1-T010 — Gate de overhead:** comparar export com/sem profiling; telemetria não pode virar o novo gargalo; coletar amostras sem explodir logs/IPC.

**Decisão obrigatória:** antes de atacar encoder, provar a participação do encode real no caminho crítico. Antes de criar cache maior, provar repetição de trabalho por chave visual correta. Antes de trocar captura, provar o custo real líquido no tempo total.

---

# 8. ETAPA 2 — SEPARAR O EDITOR V6 DO MOTOR INTERNO DE EXPORTAÇÃO

**Objetivo:** o V6 continua igual para quem edita, mas exportar não precisa repintar a árvore React/cena inteira a cada frame.

- [ ] **E2-T001 — Definir `ExportSnapshot` V6 imutável:** documento, revisão, recursos, presets, mídia e opções; congelar o estado no começo do job e validar contra alterações posteriores.
- [ ] **E2-T002 — Isolar o núcleo semântico do frame:** extrair resolução de cena, transformações, ordem de camadas e eventos para funções puras compartilhadas pela UI V6 e pelo backend de exportação quando possível.
- [ ] **E2-T003 — Criar `V6FrameDrawPlan` tipado:** comandos/recursos suficientes para gerar cena correta, sem importar componentes/páginas React no núcleo. Evitar duplicar regras de desenho.
- [ ] **E2-T004 — Criar adaptador de recursos V6:** Fabricador, Customizador e bibliotecas de mídia via contratos/IDs autorizados; não copiar catálogos, imagens e documentos para fazer a separação parecer simples.
- [ ] **E2-T005 — Definir interface intercambiável de renderer V6:** caminho atual como fallback e implementação nova apenas quando passar nos gates. Nenhum novo botão visível.
- [ ] **E2-T006 — Impedir custo da interface no job:** verificar que estado de painel, progresso, polling, callbacks React e navegação não comandam produção de pixels e não invalidam renderizações desnecessárias.
- [ ] **E2-T007 — Preservar ordem, revisões e timestamps:** nenhum evento pode se perder entre snapshot, IPC, preparação e render. A sequência de frames deve ser calculada sem depender da passagem do cursor da UI.
- [ ] **E2-T008 — Provar paridade de cenas estáticas no V6:** pixels de fundo, personagens, roupas, texto, overlays, crop e alpha; só depois liberar cenas dinâmicas.

**Não confundir**: manter BrowserWindow oculta já é isolamento parcial; esta etapa busca **independência computacional da renderização por frame**, não simplesmente criar outra janela.

---

# 9. ETAPA 3 — ANIMAÇÃO ABSOLUTA E CORREÇÃO ESTRUTURAL DO CABELO

**Objetivo:** corrigir reset/duplicidade/ausência de reação e possibilitar seek, Turbo e paralelismo sem inconsistência.

- [ ] **E3-T001 — Inventariar modos reais de cabelo:** `poseReactionOnly`, loop 90/120, simulação contínua, `posteriorOnly`, preset, intensidade, phase e comportamento ao desligar cabelo.
- [ ] **E3-T002 — Auditar cada evento de pose:** geração, identidade, início/fim, ordenação, duplicação, fusão de eventos iguais e participação de personagens que mudam de rig.
- [ ] **E3-T003 — Reproduzir bugs no projeto autorizado:** registrar frame/elemento, histórico de eventos e curva de deslocamento; **incluir expressão simultânea à troca de pose e achatamento vertical (Etapa 0A)**; não presumir diagnóstico por relatos visuais isolados.
- [ ] **E3-T004 — Testar determinismo:** comparar render do frame `N` após 0→N, seek direto, ordem aleatória, repetição de export e emenda entre partes Turbo.
- [ ] **E3-T005 — Separar impulso de pose da resposta do cabelo:** um evento identificado não pode disparar duas vezes ou reiniciar parcialmente o balanço por repaint, **troca de expressão**, troca de rig, alteração de crop ou mudança de worker. Confirmar que mudança de expressão sem troca de pose não cria impulso de cabelo.
- [ ] **E3-T006 — Investigar três modelos de implementação:** resposta analítica amortecida, curvas amostradas por evento e física fixa com checkpoints determinísticos; escolher por paridade + custo real.
- [ ] **E3-T007 — Preservar semântica Posterior vs Traseiro:** `rearHair`/`backHair` e camadas frontal/franja; impedir bugs de filtragem e ausência de animação por classificação incorreta.
- [ ] **E3-T008 — Cobrir transições sobrepostas/próximas:** evento novo pode somar, substituir ou amortecer resposta anterior segundo regra visual explícita, mas não produzir teleporte/reset.
- [ ] **E3-T009 — Eliminar trabalho de cabelo quando OFF:** não criar/preparar rigs e texturas de animação por engano; assegurar imagem estática completa idêntica.
- [ ] **E3-T010 — Testes de curva e visual:** amostras em começo/meio/fim de balanço, continuidade de posição/velocidade, não zero indevido, ausência de gatilho duplicado; **comparar pose-only versus pose+expressão em 30 frames** e confirmar export determinístico.
- [ ] **E3-T011 — Regressões de estado:** validar trocas de pose, edição de preset, pausa, cancelamento, reexport, múltiplos personagens e meia timeline sem dependência do frame inicial.

**Módulos prioritários:** `src/shared/hairMotionEngine.ts`, `src/shared/editorV6HairMotion.ts`, `src/renderer/src/features/editorV6/exportWorker.tsx`, `src/renderer/src/features/editorV6/exportHairTransitionIndex.ts`, `src/renderer/src/features/editorV6/editorV6HairMotionPreparation.ts` e `tests/editor-v6/hairMotion*`.

**Cautela:** já existe `advanceHairMotionToFrame`; procurar defeitos na aplicação/estado/eventos antes de substituí-lo. O modo pós-pose do V6 já amostra eventos; a reengenharia deve ser justificada por evidência.

---

# 10. ETAPA 4 — CACHE INTELIGENTE E ELIMINAÇÃO DO PRÉ-PROCESSAMENTO REDUNDANTE

**Objetivo:** atacar a parte que consumiu ~34 s do relatório histórico (movimentos + cabelo, contabilizados nas suas fases corretas), sem criar resultados visuais obsoletos.

- [ ] **E4-T001 — Diagnosticar os 141 rigs preparados e 0 reutilizados:** identificar diferenças de pose/character/style, worker, sessão, chave, budget e expulsões; nunca supor igualdade por IDs parecidos.
- [ ] **E4-T002 — Chaves de identidade visual completas:** incluir revisão de desenho, geometria, pose, roupa, tint, face, rig, cabelo, preset, crop, escala, resolução e versão do renderer; testar falsos hits **especialmente ao mudar apenas a expressão**. Compartilhar somente o que permaneça geometricamente idêntico.
- [ ] **E4-T003 — Compilar componentes estáticos uma única vez por identidade:** texturas decodificadas, corpo/roupa, material, máscaras e camadas que não mudam entre frames.
- [ ] **E4-T004 — Compartilhar renderizador base com variantes:** quando possível, preparar normal/sem cabelo com uma única base de personagem, sem perder face, recortes, halo ou roupa.
- [ ] **E4-T005 — Substituir PNG intermediário desnecessário:** avaliar buffers/canvas/textura reutilizável em **mesmo processo**; comparar custo de cópias/IPC e formatos de alpha antes de mudar API.
- [ ] **E4-T006 — Preparação de transições sob demanda:** testar se todas as 21 transições precisam de bake completo ou se um plano geométrico barato pode substituir parte do trabalho.
- [ ] **E4-T007 — Compartilhar atlas de boca entre partes Turbo:** chave visual + posição temporal + estado de expressão; preservar fase da boca e cancelamento.
- [ ] **E4-T008 — Cache por camada e invalidadores incrementais:** renderizar apenas porções sujas quando possível, sem caches que escondam piscada, boca, cabelo ou transição.
- [ ] **E4-T009 — Cache limitado por bytes e ownership:** LRU/TTL por contexto, métricas de alocação/hit/eviction, limpeza em erro/cancelamento e ausência de acúmulo entre jobs.
- [ ] **E4-T010 — A/B frio e quente SEPARADOS:** provar melhoria do **primeiro export** com caches vazios (sem apagar cache pessoal) e, como ganho adicional, reexport quente.
- [ ] **E4-T011 — Gate de compatibilidade:** comparar RGBA, alpha, flip, roupas, face, boca, cabelo, **altura vertical e ritmo pós-pose com expressão simultânea**, e a **quantidade real de frames** do projeto autorizado (309 somente se confirmado).

**Pergunta-mestra:** quanto processamento pode ser **eliminado**, não apenas deslocado para um cache que demorou o mesmo para preencher?

---

# 11. ETAPA 5 — COMPOSITOR DE EXPORTAÇÃO V6: REMOVER O CUSTO DO DOM POR QUADRO

**Objetivo:** avaliar uma renderização V6 própria, capaz de produzir pixels sem executar render React + screenshot por quadro, **somente após** equivalência geométrica e semântica.

- [ ] **E5-T001 — Medir custo real de `SceneSurface` + `flushSync` + `capturePage`:** separar render, espera por paint, readback e cópias por frame.
- [ ] **E5-T002 — Avaliar protótipo R37 com honestidade:** inventariar operadores ausentes (juntas, pele, roupa, tint, crop, rosto, olhos, boca, camadas de cabelo e halos).
- [ ] **E5-T003 — Provar uma pose completa:** produzir um personagem completo V6 com composição correta em novo renderer isolado; comparar pixel bruto pré-encode.
- [ ] **E5-T004 — Provar 7 transições reais:** endpoints, intermediários, rotação, escala, flip global/individual, roupa e costuras.
- [ ] **E5-T005 — Provar 30 frames consecutivos de personagem:** cabelo, boca, blink, face, texturas, ordenação e alpha.
- [ ] **E5-T006 — Implementar camadas e sprites com recursos compartilhados:** compor backend por comandos V6 sem reparsing/decoding repetido de cada textura por frame.
- [ ] **E5-T007 — Comparar bibliotecas no V6:** Canvas offscreen isolado, Sharp/libvips, Skia `@napi-rs/canvas`, WebGL/WebGPU, `resvg-js` ou compositor próprio **se** cada uma oferecer hipótese objetiva e instalação local reversível; não introduzir tecnologia por moda.
- [ ] **E5-T008 — Criar interface `renderFrame(frame)` única para V6:** mesma semântica da timeline, recursos congelados, suporte a cancelamento e relatório de custos.
- [ ] **E5-T009 — Gate de compatibilidade com MP4:** total de frames da **revisão real do projeto autorizado**, 1080p/30 conforme configuração, zero perdas, RGBA/BGRA correto, sem achatamento na expressão nem aceleração artificial do cabelo. Preservar fallback seguro.
- [ ] **E5-T010 — Decidir por A/B:** adotar, refinar, híbrido ou descartar; **não** promover se a fidelidade falhar, mesmo que um teste sintético seja muito rápido.

**Pontos concretos de código V6:** `src/renderer/src/features/editorV6/SceneSurface.tsx`, `exportWorker.tsx`, `src/shared/editorV6PartMotionPrototype.ts`, `src/shared/editorV6PartRasterRenderer.ts`, `src/renderer/src/characters/*Renderer.ts`.

**Atenção:** um compositor de peças incompleto pode parecer rápido porque **não desenha** cabelo, rosto ou roupa corretamente. Isso não é otimização aprovada.

---

# 12. ETAPA 6 — PIPELINE ASSÍNCRONO DE FRAMES DO V6

**Objetivo:** sobrepor trabalho útil sem corromper frames ou explodir memória.

- [ ] **E6-T001 — Desenhar pipeline com filas limitadas:** planejar snapshot → avaliação → render → transferência → encode → mux, registrando o caminho crítico.
- [ ] **E6-T002 — Separar produtor e consumidor:** render de N+1 pode acontecer enquanto encoder consome N, dentro de orçamento de buffers e usando números absolutos de frame.
- [ ] **E6-T003 — Aplicar backpressure correto:** `stdin.write`/`drain`, cancelamento, erros e ordem de frames; nunca converter uma falha de pipe em sucesso silencioso.
- [ ] **E6-T004 — Eliminar cópias e serializações onde viável:** testar zero-copy/transferables com ownership explícito, e medir cópias totais de memória.
- [ ] **E6-T005 — Avaliar `paint` direto vs `capturePage`:** somente como laboratório V6, com **associação inequívoca frame/token/bitmap**, transparência e validação na imagem real. Evento `paint` sozinho **não** prova frame correto.
- [ ] **E6-T006 — Avaliar buffers GPU/readback assíncrono:** apenas se hardware e backend suportarem, sem criar dependência obrigatória de driver não validado.
- [ ] **E6-T007 — Verificar divisão Turbo:** fronteira 154, inicialização de estados, boca/cabelo, emenda, ordenação e ausência de duplicação/perda.
- [ ] **E6-T008 — Benchmark de paralelismo:** 1, 2 e quando justificável mais workers, medindo wall-clock e memória total. Mais workers nem sempre são mais rápidos.
- [ ] **E6-T009 — Resistência:** cancelar em preparação, render e encode; falha de worker, crash, timeout, falta de disco, encoder indisponível, retomada segura e limpeza de temporários próprios.
- [ ] **E6-T010 — Gate real:** MP4 correto, **número exato de frames da revisão autorizada**, sem drift/emenda, sem achatamento/reação desincronizada, pico de memória controlado e ganho medido ponta a ponta.

**Restrições:** não ignorar a barreira de pintura existente nem promover R36 experimental sem prova; não aumentar buffers indefinidamente; não depender da thread da UI para compor frames.

---

# 13. ETAPA 7 — CODIFICAÇÃO, ÁUDIO/VÍDEO E PUBLICAÇÃO

**Objetivo:** manter o MP4 correto e acelerar encode somente se for gargalo real.

- [ ] **E7-T001 — Perfilar sondagem de encoder:** tempo de probe, tentativas, cache de capacidade por dispositivo/versão e comportamento de fallback.
- [ ] **E7-T002 — Medir CPU H.264 vs opções nativas:** `libopenh264`, AMF, NVENC, QSV ou outras **apenas quando presentes**, mantendo baseline CPU comparável.
- [ ] **E7-T003 — Testar formato de pixels:** BGRA/RGBA, conversão para YUV, alpha premultiplicado, BT.709, alinhamento e overhead de conversões.
- [ ] **E7-T004 — Provar qualidade:** codec, bitrate/qualidade, duração, cor, artefatos, taxa constante, corte, fade, espelho e rosto; não reduzir qualidade para cumprir tempo.
- [ ] **E7-T005 — Preservar mídia vinculada ao V6:** áudio, vídeos externos, library IDs, intervalos e filtros; provar sync e mux no código/fixtures, usando somente projeto autorizado para export real.
- [ ] **E7-T006 — Publicação segura:** temporário → validação FFprobe → publicação final; limpar apenas temporários do próprio job, sem sobrescrever arquivos preexistentes.
- [ ] **E7-T007 — Regressão de fallback:** sem encoder de hardware, comportamento seguro e relatório correto; não esconder ganho somente em configuração diferente da baseline.
- [ ] **E7-T008 — Conclusão baseada em wall-clock:** se encoder for fração pequena, registrar e voltar aos gargalos de preparação/render; não gastar a missão mexendo em presets.

---

# 14. ETAPA 8 — COMBINAÇÃO, ORÇAMENTO DE 30 SEGUNDOS E DECISÃO DE ARQUITETURA

**Objetivo:** combinar ganhos que realmente interagem e decidir o que entra na produção.

- [ ] **E8-T001 — Construir orçamento do caminho crítico:** preparar cabelo, movimentos, boca, render, write/encode, mux/validação/publicação; refletir paralelismo real e overhead.
- [ ] **E8-T002 — Aplicar Lei de Amdahl / limites:** estimar impacto máximo de cada hipótese; rejeitar micro-otimização sem efeito no total.
- [ ] **E8-T003 — Combinar ganhos por ordem controlada:** cenário A, B, C, medindo interações e regressões; evitar atribuir ganho de uma mudança à outra sem controle.
- [ ] **E8-T004 — Investigar escalonamento:** afinidade de personagens/rigs a worker, prefetch, lotes e scheduling de poses; medir cache hit e contenção.
- [ ] **E8-T005 — Verificar cold vs warm:** ganhar no primeiro export é prioridade; warm cache é melhoria adicional, não substituto para meta.
- [ ] **E8-T006 — Selecionar arquitetura final do V6:** manter motor otimizado, promover backend V6 novo ou composição híbrida **apenas se** fidelidade, memória e A/B justificarem.
- [ ] **E8-T007 — Evitar complexidade desnecessária:** descartar spikes, flags de laboratório redundantes, código morto e caches inúteis, mantendo rollback controlado.
- [ ] **E8-T008 — Meta ≥3 medições:** registrar mediana completa de cenário idêntico, dispersão, hardware, SHA, logs e pixels; validar ≤30 s sem excluir preparo.

---

# 15. ETAPA 9 — MATRIZ DE QUALIDADE, SEGURANÇA E REGRESSÃO

**Gate de promoção obrigatório para qualquer substituição substancial do renderer/pipeline.**

- [ ] **E9-T001 — Paridade pixel/RGBA pré-encode:** controle estático 7 amostras, 30 frames consecutivos e trechos de transição; alfa/cor/composição, com tolerância justificada previamente.
- [ ] **E9-T002 — Comportamento do cabelo:** sem reset, sem dupla reação, sem personagem inerte, continuidade emenda e seek; avaliar curvas e inspeção visual.
- [ ] **E9-T003 — Boca, olhos e rosto:** ciclo 30 frames, fala, blink, expressões, crop e ordem de rosto; evitar atlas facial inválido.
- [ ] **E9-T004 — Corpo/roupa/acessórios:** geometria, juntas, tints, bordas e flip; nenhum corte durante poses intermediárias.
- [ ] **E9-T005 — Cena e mídia:** fundo, balões, texto, assets por ID, áudio/vídeo, clip start/end, z-order, rotação, sobreposições e alpha.
- [ ] **E9-T006 — Segurança de processo:** validar IPC, propriedade de job, paths permitidos, CSP, preload, protocolo de mídia, transações e cancelamento.
- [ ] **E9-T007 — Estabilidade:** rodadas repetidas com e sem cabelo, consumo de RAM completo, vazamentos, cache, falha de encoder e fechamento do app.
- [ ] **E9-T008 — Testes automatizados:** suites V6 relevantes, `typecheck`, auditoria arquitetural, build e gates Windows; nenhum threshold diminuído para passar.
- [ ] **E9-T009 — Revisar diffs e compatibilidade:** sem alterações acidentais de outras áreas; commits locais rastreáveis, rollback e ausência de artefatos pessoais.
- [ ] **E9-T010 — Comparar export completo do projeto autorizado:** mesmo número de frames, duração, qualidade e conteúdo; relatar divergências em vez de escondê-las.

**A paridade de H.264 não deve ser inferida por hash binário do MP4**, pois encode pode variar. Use FFprobe para estrutura, comparação RGBA/PNG quando aplicável, métricas perceptuais auxiliares e inspeção humana. Corrigir visualmente bugs anteriores é permitido, mas documentar a diferença planejada.

---

# 16. ETAPA 10 — ENTREGA, LIMPEZA E CONTINUIDADE

- [ ] **E10-T001 — Fixar implementação aprovada no V6:** botão existente, contratos públicos e projetos antigos preservados; sem recurso experimental exposto indevidamente.
- [ ] **E10-T002 — Remover código morto e ferramentas temporárias não úteis:** preservar scripts de profiling e benchmarks que agreguem valor permanente.
- [ ] **E10-T003 — Documentar arquitetura V6 resultante:** propriedade de dados, fluxo por frame, cache/invalidação, workers, filas, abort, encoder, configuração e troubleshooting.
- [ ] **E10-T004 — Testes finais reproduzíveis:** três exportações completas comparáveis com cabelo ligado e controle sem cabelo; registrar medianas, dispersão e MP4s válidos.
- [ ] **E10-T005 — Registrar resultado frente à meta:** tempo inicial REAL comparável, tempo final, ganho percentual, correções visuais, perfis de memória, limites e evidências.
- [ ] **E10-T006 — Commits e handoff:** hashes reais, arquivos tocados, testes executados, estado `git status`, instruções de retomada e riscos pendentes.
- [ ] **E10-T007 — Se meta não atingida:** registrar gargalo restante, limite comprovado, hipóteses descartadas, melhor caminho e próxima tarefa de maior retorno; nunca declarar sucesso falso.

---

# 17. EXPERIMENTOS DE ALTO IMPACTO — BACKLOG INICIAL

Ideias **a investigar**, não decisões antecipadas. Converter em tarefas quando merecerem prioridade.

| ID | Experimento V6 | Motivo | Primeiro teste barato | Risco principal |
|---|---|---|---|---|
| H-001 | Substituir atlas obrigatório por comandos de transformação + peças V6 | 21 bakes / 23,7 s na baseline histórica | 1 pose real, 7 transições, diff RGBA | roupas/juntas/face/cabelo diferentes |
| H-002 | Fundo/corpo/roupa imutáveis e variantes de face/cabelo | Preparo pré-job ~10,5 s | medir normal vs hairless e reutilizar material | cache visual obsoleto |
| H-003 | Boca pré-preparada uma vez por identidade visual | 8,6 s de subfase | contar re-bakes por Turbo/worker | fase temporal incorreta |
| H-004 | Estados de cabelo derivados do tempo/eventos | Reset e inconsistência visual relatados | curvas de 30 frames ao redor de poses | descontinuidade e perda de naturalidade |
| H-005 | Compositor V6 sem React por frame | Custo de DOM/captura | 1 quadro completo equivalente | portabilidade/paridade |
| H-006 | `paint` com fence atômica verificável | `capturePage` tem readback | sete quadros e token no bitmap | stale frames/alpha |
| H-007 | 2–3 buffers de frames em voo | Sobrepor render e encode | 30 quadros reais e backpressure | ordem/memória |
| H-008 | Prefetch de assets por segmento com LRU limitada | evitar `decode`/IPC repetido | perf de misses e bytes | RAM alta |
| H-009 | Render incremental por área alterada | poucos elementos mudam | diff por região vs full canvas | halos/sobreposição sujos |
| H-010 | Worker affinity por personagem e rig | aquecer cache real | acompanhar rigKey/lookups/evictions | load imbalance |
| H-011 | Eliminador de PNG intermediário | codificação/decoding redundante possível | medir bytes e tempo de roundtrip | alpha/crop/premultiply |
| H-012 | Encoder hardware apenas depois de raster barato | encode pode se tornar próximo gargalo | capability + 30 frames | qualidade/driver/fallback |
| H-013 | Pré-computação das respostas do cabelo só após evento | 120 Hz com resposta curta | microbench de 7 eventos e comparação | semântica de sobreposição |
| H-014 | Compilar draw plan estático por revisão | reduzir resolução de cena repetida | contagem de alocações por frame | invalidadores insuficientes |
| H-015 | O achatamento de expressão vem de crop/atlas reescalado para viewport fixa | BUG-VIS-01 | medir bounds e `viewBox` no frame exato, preview vs MP4 | falso diagnóstico sem comparar altura física |
| H-016 | Expressão altera o raster/rig durante resposta pós-pose, dando aparência de aceleração | BUG-VIS-02 | comparar offsets 30 frames pose-only vs pose+expressão e geometria | confundir aparência com física |
| H-017 | Transições somente de expressão acionam preparação pesada desnecessária | performance + BUG-VIS-01/02 | classificar planos e medir `faceSignature`/`poseSlot` por tipo | alterar a semântica de transições legítimas |

**Pergunta obrigatória ao terminar cada experimento:** quanto esse ganho reduz o **tempo completo**, em cenário cold real, e qual custo de memória/qualidade adiciona? Se só acelera uma subfunção de 1%, não vender como grande avanço.

---

# 18. PROTOCOLO DE BENCHMARK V6

## 18.0. PRIMEIRO experimento obrigatório — nova baseline (107 s relatados)

**Prioridade imediata do Codex, antes de prometer ganho:** recuperar o projeto **`Teste de Importação — Personagens do Pacote`** e confirmar identidade/revisão e preset. O usuário observou **1:47 = 107 segundos com cabelo animado** numa execução. Não se sabe ainda se as condições coincidem com a baseline histórica, nem se o cronômetro incluiu preparo/validação. **Refazer o export completo agora**, em cópia verificada, para obter uma baseline local nova e reproduzível. Fazer o mesmo com cabelo desligado. **Não utilizar outros projetos para validar exportação**.

**Ciclo inteligente de execução:**

1. Confirmar **backup íntegro e imutável** da cópia autorizada; guardar hash de conteúdo, projeto e presets localmente. Não limpar nem modificar dados pessoais.
2. Fixar **1080p, 30 FPS, Turbo 2×, encoder/preset reais e duração total** se forem de fato as opções do projeto/última execução. Se diferentes, registrar; nunca falsificar igualdade com os 107 s.
3. Capturar `t0` imediatamente antes da preparação do cabelo, `t1` após preparo, `t2` após IPC/início do job, `t3` fim do bake, `t4` fim de render/encode, `t5` finalização/validação/publicação. Registrar **tempo de parede** e subfases sem somar etapas paralelas duas vezes.
4. Uma rodada **com cabelo ON** e uma **OFF** para diagnóstico inicial; se houver estabilidade, rodar pelo menos 3 execuções comparáveis nas decisões de adoção/finais, com mediana e dispersão. Registrar cache frio/quente sem apagar caches do usuário.
5. Comparar os dois modos para descobrir **custo incremental do cabelo** e o custo comum de pose/face/motion. Evitar repetir export completo após cada microalteração: use perfis e testes de 7 mudanças/30 frames no mesmo projeto, depois export completo nos gates.
6. Reproduzir e filmar os bugs de expressão/altura e expressão+cabelo durante esta baseline; preservar amostras antes de corrigir e critérios posteriores para confirmar o reparo.
7. Registrar cada medição no painel do Markdown: `observação do usuário ≠ mediana medida ≠ relato histórico`. Se não tiver acesso ao projeto/preset/FFmpeg ou ao Windows para rodar, marcar **BLOQUEADO POR AMBIENTE**, continuar investigação estática e testes de funções puras, sem inventar resultados.

**Meta:** ≤30 s totais **após** correções visuais. Frente ao relato de 107 s, isso equivale a reduzir **77 s (~72,0%)**, ou ~**3,57×** de aceleração; só é comparação válida quando os cenários coincidirem.

## 18.1. Identidade da comparação

Antes de comparar duas variantes, exigir:

1. **Mesmo projeto autorizado** e mesma revisão do conteúdo, confirmado em cópia local por manifesto/hash; não publicar IDs reais nem paths.
2. Exatamente mesmo intervalo de frames, FPS, resolução, áudio, vídeo, preset de cabelo, estado das animações, Turbo, encoder e qualidade.
3. Informar explicitamente se é **primeiro export frio**, reexport quente, cache parcialmente quente, perfil sintético ou benchmark de função.
4. Build SHA, alterações locais e versão de Electron/Node, SO/driver/hardware registrados.
5. Medida monotônica de início do preparo **até arquivo final validado** e relatório de subfases com sobreposição clara.
6. Execuções completas de comparação repetidas (preferir ≥3 para decisões finais); registrar mediana e variabilidade.
7. Consumo de memória por processo e GPU, nunca só RSS do Main.
8. Validação visual e contagem de frames. Não declarar ganho só por uma medição rápida.

## 18.2. Exemplo de registro

| Experimento | Build | Cabelo | Cache | Tempo total | Preparo cabelo | Preparo movimento | Render/encode | MP4/visual | Decisão |
|---|---|---|---|---:|---:|---:|---:|---|---|
| **Relato mais recente do usuário (não reproduzido pelo Codex)** | desconhecido | **ligado** | a confirmar | **107 s (1min47s)** | não medido | não medido | não medido | usuário observou bugs | **não é baseline validada** |
| Baseline histórica documental | não vincular sem SHA | ligado | frio | 54,7158 s | 10,5030 s | 23,7045 s | 17,7905 s | relatório histórico | referência, não A/B |
| Primeira baseline local | PENDENTE | ligado | a registrar | — | — | — | — | — | não medido |
| Controle local | PENDENTE | desligado | a registrar | — | — | — | — | — | não medido |
| Candidato A | PENDENTE | ligado | a registrar | — | — | — | — | — | não medido |

**Cuidado:** `preparo movimento` e `render/encode` são etapas do job, mas boca/captura são subfases da renderização; nunca inflar soma. Um experimento de 30 frames não confirma 309. Uma melhoria no export sem cabelo não garante melhoria com cabelo.

## 18.3. Gates rápidos e finais

**Gate 0 — Estático:** typecheck, testes unitários de geometry/cache/determinismo, sem usuário ou projeto.

**Gate 1 — Quadro isolado:** paridade semântica, compositing/pixel RGBA de uma pose completa, sem vídeo MP4 real.

**Gate 2 — Trecho real autorizado:** 7 transições e 30 frames consecutivos; checar **achatamento da expressão**, **pose+expressão e curva pós-pose**, cabelo/boca/olho/roupa/crop. Teste apenas na cópia do projeto autorizado.

**Gate 3 — Export completo autorizado:** **toda duração real do projeto**, incluindo mudanças de pose/expressão e reação do cabelo; 309 quadros **somente** se a cópia atual realmente tiver 309. Comparar com o novo baseline ON/OFF, ffprobe e inspeção visual. Não encurtar para bater meta.

**Gate 4 — Estabilidade:** ≥3 rodadas completas por configuração relevante, frio controlado, memória, qualidade, rollback e entrega.

Pode pular entre tarefas de diferentes etapas, mas não pular os **gates necessários** de adoção de backend.

---

# 19. REGRAS DE SEGURANÇA, INSTALAÇÃO E RISCO

1. `AGENTS.md` manda preservar dados, IPC, propriedade dos domínios e commits sem push. **Este plano não sobrepõe essas regras.**
2. Tudo que for instalado ou baixado para experimentos deve viver **dentro da pasta do projeto**, usando executáveis locais, `node_modules`, `tools/` ou pastas temporárias dentro do checkout. Respeitar licenças, binários Windows, Electron ABI e empacotamento.
3. Não executar `git reset --hard`, `git clean -fd`, limpeza de cache pessoal, migração de perfil ou exclusão de mídia. Não apagar arquivos por conveniência de benchmark.
4. Não publicar mídia, personagem, projeto, IDs, nomes de usuário, caminhos absolutos, relatórios com dados privados ou segredos em commits/logs compartilháveis.
5. Não mudar interfaces, rotas e dados salvos de outra parte do aplicativo só para facilitar o export; mudanças compartilhadas exigem testes em todos os consumidores afetados.
6. Toda otimização de cache precisa de identidade visual correta, invalidação, orçamento e limpeza. Cache rápido que exporta cabelo/expressão antigos é **defeito crítico**.
7. Toda otimização concorrente precisa preservar ordem de quadros, aborto, sincronização, leases de buffer e verificação por FFprobe.
8. Trocar uma implementação visual por outra exige **paridade antes de performance**. Não esconder regressão atrás de H.264 com perdas.
9. A única pasta de projetos de testes reais permitida contém a **cópia verificada** do projeto autorizado; preservar original e mídia vinculada.
10. Não reduzir FPS, resolução, bitrate/qualidade, duração ou número de personagens para anunciar meta de 30 segundos.

---

# 20. TEMPLATE DE DECISÃO DE ARQUITETURA (ADR)

Quando optar por mudanças amplas, registrar em `docs/editor-v6/` ou nesta seção:

```md
## ADR-V6-XXX — Título
- **Problema observado:** com código, perfil e reprodução.
- **Alternativas avaliadas:** manter, substituir, híbrido; custos reais.
- **Decisão:** opção e por quê.
- **Benchmark:** SHA, comando, cenário, antes/depois, cold/warm, mediana.
- **Paridade:** frames, pixel RGBA, cabelo/boca/roupa, ffprobe.
- **Riscos:** memória, distribuição Windows, drivers, IPC, cache.
- **Rollback:** caminho seguro atual e condição de reverter.
- **Commit(s):** hashes reais.
```

Não criar ADR para um ajuste trivial; registrar decisões que alguém precisará entender ao manter o motor.

---

# 21. ESTADO DE RETOMADA ENTRE SESSÕES

O Codex deve manter sempre esta seção curta e fiel ao Git real.

**Último estado confirmado:** `Dev-V2`, commit-base `aad4b46`; o diff não commitado contém ajustes de fixtures/testes e este Markdown. Nenhuma alteração de produto foi feita nesta etapa.

**Última ação:** `node scripts/editor-v6/rapid-gates-windows.cjs --gate=offscreen --scope=all` aprovado (110 testes Vitest, 6 Node, 4 nativos e 2 verificações Electron). O gate primeiro apontou uma fixture obsoleta: simulava importação direta de áudio, embora o V6 agora selecione a Biblioteca por ID. Também se explicitou a tolerância de quantização 8-bit já medida na borda da composição de face: diferença máxima de 1 LSB, alpha exato e limite de pixels afetados.

**Próxima ação:** revisar e commitar a etapa de testes/medição; em seguida, continuar diagnóstico visual focado na cópia autorizada e corrigir a instrumentação do benchmark OFF para medir o mesmo intervalo clique→MP4 validado do ON. Priorizar expressão isolada e pose seguida de expressão (18 quadros dentro da reação de 30); evitar reexports completos a cada ajuste mínimo.

**Baseline local:** ON 159,22 s clique→MP4 validado, preset 1; OFF 77,64 s apenas de job, portanto ainda sem comparação direta. Ambos têm 2394 quadros, 1920×1080/30, Turbo, 4 áudios, build `aad4b46` e cópia verificada isolada. Estado do cache OFF não foi registrado. O relato de 107 s e a referência de 54,7158 s seguem sem condições equivalentes demonstradas.

**Limites abertos:** bugs visuais sem reprodução confirmada; meta ≤30 s não alcançada; driver da GPU e versão Chromium ainda não anotados; nenhuma alteração de produto nesta etapa.

## Diário técnico — 05/11/2026

- A exportação ON terminou e validou em 159,22 s. Preparo do cabelo: 28,60 s; 37 transições; pacote serializado ~85,5 MiB. Fases registradas: preparo de movimentos 18,64 s, renderização 98,02 s, finalização 13,17 s. Captura: 297 readbacks; 14,03 s acumulados e 17,65 s de round-trip acumulado entre workers. Essas subfases podem sobrepor-se e não são aditivas.
- Recursos ON, em amostra única: working set de Main ~0,93 GiB, benchmark renderer ~1,02 GiB, export renderer ~0,92 GiB, GPU ~0,92 GiB e FFmpeg ~0,29 GiB; FFmpeg atingiu ~325% CPU. Falta verificar repetibilidade, pressão de memória compartilhada, GC e disco.
- A exportação OFF completa passou validação e FFprobe. O relatório mede 77,64 s de job, render 46,50 s e finalização 12,17 s, mas não registra clique→validação; não comparar esse intervalo com ON.
- Quadros amostrados de expressão nas quatro tracks mostram variação de rosto e nenhum achatamento inequívoco nas miniaturas. O caso track 3 em 1794–1830 envolve pose e expressão em sequência; não demonstra ainda aceleração nem correção do cabelo.
- A composição dual de face divergiu em 17 pixels, apenas cor de borda, máximo 1/255 e alpha idêntico. O teste declara limite tight de 1 LSB e 0,2% dos pixels, baseado nesta evidência, sem mascarar diferença geométrica.
- O teste do painel agora valida seleção de áudio existente na biblioteca e vínculo por ID. O fluxo de produção já usava essa API; somente a fixture estava defasada.
- `npm run typecheck`, `npm run audit:architecture` e `npm run build` passaram antes desta etapa. O gate offscreen repetido passou em 6,78 s. Os testes sintéticos de geometria/paridade não substituem aceite visual do projeto inteiro.

---

# 22. ORDEM FINAL AO CODEX — COMECE A TRABALHAR

**Este Markdown é uma especificação viva de execução, não um relatório para apresentar e encerrar.**

1. Confirmar que a missão é **somente Editor V6**.
2. Verificar checkout, `AGENTS.md`, status do Git, scripts e código real.
3. Executar tarefas da Etapa 0, refazer baseline **com cabelo ON e OFF** no projeto único; atualizar o painel com evidências, incluindo comparação honesta com o **relato de 107 segundos**.
4. **Corrigir primeiro BUG-VIS-01 e BUG-VIS-02 da Etapa 0A:** expressão não pode achatar verticalmente o personagem; expressão simultânea à pose não pode acelerar, reiniciar ou distorcer artificialmente a reação do cabelo. Criar perfis e testes focados; não aceitar melhoria de tempo com esses defeitos.
5. Investigar profundamente as seis frentes: **desacoplamento interno**, **tempo absoluto**, **cache visual**, **pipeline assíncrono**, **encoder/transporte** e **profiling permanente**.
6. Fazer hipóteses próprias, investigar alternativas atuais, criar ferramentas locais e experimentar sem medo de refatoração grande — mas com paridade, reversibilidade e testes.
7. Manter tarefas, backlog, commits, experimentos, ADRs e estado de retomada **atualizados no arquivo**. Se estiver na Etapa 8 e surgir trabalho de Etapa 0, crie, priorize e execute. Nenhuma numeração restringe autonomia.
8. Não parar após micro-otimizações ou uma checklist bonita: buscar melhorias **reais** no export V6 com cabelo e sem cabelo, sem burlar o escopo.
9. Promover para produção apenas a solução V6 que demonstrar equivalência e ganho total consistente. Se a meta não for atingível com as evidências disponíveis, registrar resultados honestos, limitações e próximo experimento de maior valor.

> **Princípio máximo:** aperfeiçoe o Editor V6 atual. Pode substituir profundamente o mecanismo **interno de exportação do próprio V6**, mas não transforme a missão em desenvolvimento de outro editor. Elimine trabalho desnecessário, preserve o visual, meça o tempo verdadeiro e mantenha o projeto protegido.

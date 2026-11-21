---
id: V6-ENGINE-PLAN-1.3
tipo: validacao-e-operacao
status: proposto
branch: Dev-v3
atualizado: 2026-11-21
anterior: PLANO-1.2.md
---

# Plano 1.3 — Provas, medição, migração, rollout e riscos

## 1. Hierarquia de gates

- **P0 segurança de dados:** nenhuma escrita, migração ou remoção irreversível de projeto/asset sem validação, backup e autorização apropriada.
- **P1 correção funcional:** estados autorais, animações habilitadas, frames, áudio, mídia, alpha, camadas e texto sem regressões impeditivas.
- **P2 estabilidade:** cancelamento, falhas de worker, distribuição Windows, memória e retomada de uso.
- **P3 desempenho:** clique -> MP4 validado, com perfil e qualidade idênticos ao controle.
- **P4 limpeza:** só remover caminhos antigos depois de passar P0–P3.

Nenhuma melhora de FPS autoriza perder boca, cabelo, áudio ou 1080p. Diferença que represente correção de bug deve ser revisada como mudança de contrato, não mascarada como paridade.

## 2. Matriz de fixtures mínimas [FIX]

| ID | Caso | Obrigatório |
| --- | --- | --- |
| FIX-01 | 1 personagem estático, fundo e alpha | geometria e cor |
| FIX-02 | pose e expressão em cortes consecutivos | pivôs, escala, primeiro/último frame |
| FIX-03 | piscada durante fala e transição | estados faciais corretos |
| FIX-04 | boca com ciclo completo e máscaras | sem rosto furado |
| FIX-05 | cabelo posterior reagindo à pose | determinismo e suavidade |
| FIX-06 | 2–4 personagens e cabelo simultâneo | ordem e memória |
| FIX-07 | texto/balão, objetos e camadas | raster, fontes e z-order |
| FIX-08 | vídeos sobrepostos, recorte e troca | posição, prioridade, timestamps |
| FIX-09 | música, fala/som, mute e gain | mux e sincronismo |
| FIX-10 | export [in, out), Turbo e 24/30 FPS | bordas, contagem, PTS |
| FIX-11 | fontes alteradas e ativos ausentes | invalidação e erros úteis |
| FIX-12 | job longo, cancelamento, falha, reinício | limpeza e recuperação |

Armazenar fixtures sintéticas versionadas; não depender de arquivos pessoais do usuário.
Golden não é só snapshot SVG; incluir PNG RGBA, metadados do MP4 e hashes de entradas.
Conservar anotações de bugs antigos para não congelar um defeito.

## 3. Comparação de pixels e movimento

- Antes do codec: comparar geometria, alpha, ordenação e pixels em espaço de cor definido.
- Depois do codec: comparar frames decodificados com tolerância documentada, porque H.264 é com perdas.
- Usar métricas **e inspeção de diferenças**: PSNR/SSIM/erro localizado são diagnósticos, não licença para esconder boca/rosto deslocados.
- Registrar crop de divergências e mapa de diferenças com frame, personagem, revisão e backend.
- Inspecionar sequências ao redor de bordas (`n-1, n, n+1`) e ciclos, não só imagens isoladas.
- Confirmar seek aleatório = execução sequencial no mesmo instante, inclusive cabelo.
- Confirmar que fragmentar em 2/4/20 partes dá mesmo conteúdo, junção e áudio.
- A prévia **não** precisa ser igual ao MP4 para animações que intencionalmente omite.

## 4. Benchmark justo [BENCH]

**Sequenciamento obrigatório (DEC-019/020):** durante a construção, permitir testes de regressão, comparação integral de pixels, perfil intensivo de CPU/GPU/RAM, stress de memória/seek/concorrência e experimentos sintéticos, inclusive com carga alta no PC. Respeitar limites de memória/disco, processos e temporários; não tocar dados pessoais. Um smoke MP4 **sintético curto** valida somente funcionalidade, não velocidade. **Não executar ainda** a bateria de exportações reais, comparações fim a fim de velocidade ou o corte de 6.000 quadros; só aplicar o protocolo abaixo quando a engine estiver funcional, integrada e apta à avaliação final, após nova orientação explícita. O desempenho de microbenchmarks não prova a meta de 90 s.

**Histórico, não resultado atual:** export completo [0, 6000), 1080p30, OpenH264 CPU, 4 workers, animações completas/áudio: **163,760 s**. Meta exploratória **<=90 s**.
Fonte: `docs/editor-v6/atual/README.md`, `PESQUISA-1.1.md`, `EXECUCAO-1.1.md`.

Protocolo:
1. Mesmo commit de controle/candidato quando possível, mesmo projeto/snapshot, resolução, duração, FPS, encoder efetivo, áudio e todos os presets.
2. Medir tempo total desde início da ação até arquivo validado. Fases: validação/preparo, carregamento/decodificação, bake, animação, composição, transferências, encode, mux, finalização.
3. Separar CPU time de wall time; múltiplos workers se sobrepõem e tempos internos somados não são tempo total.
4. Triagem em 5 s e 40 s, depois 200 s com 3 rodadas pareadas quando viável; publicar mediana, amplitude, perfil do hardware e variabilidade.
5. Medir peak RSS, uso de VRAM quando aplicável, bytes em pipe, frames capturados/reutilizados e tempo de fila.
6. Executar export completo de cada comparação com caches de job novos, preservando equivalência de caches persistentes entre lados; anotar cold/warm.
7. Não promover mudanças cujo ganho seja ruído, diferença de preparação, desativação de animação ou encoder diferente.
8. Testar projeto longo (12 min) somente depois do corte principal, para verificar crescimento de memória e estabilidade.

Critério de promoção experimental sugerido: **ganho repetível acima da variabilidade observada**, com 10% como alvo inicial de relevância por hipótese. Esse valor pode mudar mediante medições; não é gate de segurança.
Critério final: fidelidade/robustez primeiro, desempenho agregado comprovado e custo de manutenção menor.

## 5. Testes automatizados e ambiente

Comandos existentes, selecionar conforme mudança:

```bash
npm run typecheck
npm run audit:architecture
npm run test:editor-v6
npm run test:editor-v6:export
npm run test:editor-v6:export-overlay
npm run test:editor-v6:hair-motion
npm run bench:editor-v6:project -- <opcoes-validadas>
```

- Alguns scripts exigem Electron, FFmpeg e Windows; CI `windows-2025` não equivale a Windows 11/AMD AMF físico.
- A bateria de benchmark com projeto real está **adiada** pela DEC-020, mesmo que haja autorização antiga para cópia isolada; o Codex só executa provas sintéticas agora.
- Verificar um bundle empacotado; execução em Node/Vitest não prova que biblioteca nativa foi empacotada.
- Cada PR/commit importante deve registrar testes **executados** vs **pendentes**, não inventar aprovação.
- CI rápido da `Dev-v3` existe em `.github/workflows/editor-v6-dev-v3-contracts.yml`; pipeline novo precisa adicionar gates próprios quando houver código.

## 6. Integridade, IPC e publicação

- Renderer/UI não lê SQLite ou arquivos diretamente; processo autorizado valida origem, argumentos e paths.
- Não executar payload de projeto como código ou aceitar caminhos arbitrários sem validar resolução/raiz.
- Assets do usuário são só leitura durante export; saídas temporárias em diretório exclusivo por job.
- Arquivo final só substituído após encode/mux/verificação completa e política explícita de overwrite.
- Em falha/cancelamento: terminar child processes, liberar arquivos, fechar streams, manter MP4 anterior.
- Guardar relatório de diagnóstico sem expor conteúdo pessoal/paths sensíveis por padrão.
- Confirmar que reabrir, salvar, duplicar, undo/redo e limpar cache não migram nem apagam projeto.

## 7. Rollout e reversão [CUTOVER]

1. **Laboratório:** novo motor apenas por harness interno; app continua no renderer anterior.
2. **Dual-run:** opção diagnóstica seleciona backend em export de fixture sem alterar dados salvos.
3. **Candidato:** habilitar novo motor em ambiente de teste após FIX-01..FIX-12 e BENCH.
4. **Padrão:** mudar só o seletor de export quando qualidade, falhas, cancelamento, memória e pacote forem aceitáveis.
5. **Rollback:** manter seleção legacy durante janela de verificação e caminho documentado para retornar.
6. **Remoção:** eliminar render antigo quando não houver consumidor vivo e testes não precisarem dele como único oráculo.

Alterar IR ou animação internamente é livre; modificar formato persistido requer leitura retrocompatível ou migração versionada/reversível. **Nunca exclusão por estar "fora de arquitetura".**

## 8. Registro de riscos e contramedidas

| Risco | Como detectar cedo | Contramedida |
| --- | --- | --- |
| Backend 2D não cobre máscara/rig/texto | FIX-01/02/07 no F1 | trocar backend antes de investir no core |
| Cabelo reintroduz custo dominante | perfis H0–H4 separados | checkpoints, sparse updates, híbrido |
| Preparação cresce demais | 5/40/200 s por fase | limitar bakes, memo por revisão, streaming |
| Vídeo/áudio quebra emendas | FIX-08/09/10 | PTS racional, áudio separado, ffprobe/decodes |
| OOM em assets grandes | teste de pico e stress | cache limitado, buffer pool, processos isolados |
| Render muda visualmente sem controle | comparação pré-encode + sequência | review de discrepância, não tolerância cega |
| Duplicação infinita de caminhos | inventário F7/F8 | único caminho público com fallback temporário |
| Projeto salvo incompatível | testes de roundtrip e backup | adaptador e migração versionada |
| Projeto ganha velocidade só em demo | A/B completo + longo | não promover sem tempo total validado |
| Prévia fica pesada por engano | teste de interação | preview separado, só piscadas automáticas |

## 9. Política de decisão e mudança do plano

- Cada fase pode mudar de ordem ou técnica por evidência. Registrar em `DECISOES.md` o **porquê**, impacto e reversão.
- Não abrir `PLANO-1.4.md` só por passagem de tempo: criar continuação quando esta parte ultrapassaria 300 linhas ou um novo subsistema exigir contrato próprio.
- Alterar `ESTADO.md` apenas em mudança real de gate, entrega, bloqueio ou próxima tarefa.
- Não fazer diários de cada prompt. Git, testes, relatórios e commits já são o histórico factual.
- Se a iniciativa precisar ser interrompida, o editor/MP4 antigos permanecem funcionais.

**Voltar ao [índice e estado atual](README.md).**

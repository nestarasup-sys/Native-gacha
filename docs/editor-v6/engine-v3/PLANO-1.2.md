---
id: V6-ENGINE-PLAN-1.2
tipo: desenho-tecnico-proposto
status: aberto-a-spikes
branch: Dev-v3
atualizado: 2026-11-20
anterior: PLANO-1.1.md
proximo: PLANO-1.3.md
---

# Plano 1.2 — Contrato de frame, animações e cabelo

Os tipos abaixo são **esboços a validar**, não APIs já implementadas.
Os limites importam mais que os nomes. Escolher estrutura mínima após a fatia F1.

## 1. Tempo e invariantes

- O V6 atual usa timeline em 30 quadros/s; export pode ser 24 ou 30 FPS.
- Blocos usam intervalos semiabertos `[startFrame, endFrame)`. Nenhum frame omitido ou duplicado em partes.
- Estado avaliado para instante `t` não depende de quantas vezes `evaluateFrame` foi chamado antes.
- Source time, timeline time, output time e PTS devem ser distintos quando necessário.
- Usar inteiros/racionais ou conversão explícita, nunca `deltaTime` da UI como relógio da exportação.
- Frames de saída vizinhos no mesmo t devem receber mesma pose, expressão, boca e estado de cabelo.
- Cache não atravessa projeto, hash de fontes, preset, resolução ou versão sem prova de identidade.
- Para animação temporal do cabelo, considerar estado dependente da história: resolver por checkpoints/fixed-step determinísticos, não afirmar que cada frame é matematicamente puro isolado.

## 2. IR de exportação (rascunho)

```ts
type EngineJob = {
  contractVersion: number
  projectId: string
  sourceRevision: string
  timelineFps: 30
  output: { startFrame: number; endFrame: number; fps: 24 | 30; width: number; height: number }
  tracks: readonly NormalizedTrack[]
  assets: readonly AssetReference[] // IDs, revisões, tipos; conteúdo fica no loader
  settings: Readonly<AnimationProfile>
}
type FramePlan = {
  outputFrame: number
  sourceTime: { numerator: number; denominator: number }
  layers: readonly DrawCommand[] // ordem total estável: fundo, mídia, personagem, textos...
  audioEvents?: readonly AudioEvent[] // preferencialmente planejados por job, não por pixel
  resourceIds: readonly string[]
}
```

Comandos devem representar: `image`, `atlasCrop`, `solid`, `mask`, `transform`, `text`, `mediaSlot`;
adicionar tipo só quando o primeiro caso real exigir. Geometria e pixels ficam em espaços explícitos:
coordenadas do projeto, locais da peça, pixel nativo do asset, pixel final.
Alpha premultiplicado vs straight precisa ser contrato de backend, nunca pressuposição.
Interpolação deve documentar pivôs, ângulo mínimo, escala, anchor, clipping e arredondamento.
Ordem visual deve ser única e estável; a timeline decide prioridade em empate.

## 3. Planejar uma vez, amostrar várias

Separar por custo e natureza:
1. `normalizeProject`: validação, normalização, ordenação, intervalos, assinaturas de fonte.
2. `prepareAssets`: decode/cache de imagem, geometria estável, rig, atlas se útil.
3. `prepareAnimationIntervals`: movimentos de pose, expressão, eventos de fala, reação de cabelo.
4. `evaluateFrame(t)`: selecionar estados, transformações, comandos e referências.
5. `renderFrame(plan)`: desenhar num buffer sem alterar regras.
6. `encodeStream`: timestamps, vídeo/áudio, flush, saída e validação.

O custo de `prepare` só se justifica se amortiza no trecho ou se é necessário à fidelidade.
Não fazer um atlas completo quando há apenas poucos quadros úteis ou mudança de fonte iminente.
Preparação deve poder ser cancelada, medir progresso e liberar recursos.

## 4. Pose e expressão

- Fonte de rig/sprites proveniente das referências do Fabricador/Customizador e snapshots V6.
- Avaliar se o bake de atlas para cada transição é mais barato que compor sprites/partes por frame.
- Trajetórias e parâmetros independem da qualidade gráfica do compositor escolhido.
- Troca de fonte, roupa, olhos ou cabelo pode exigir corte seco; isso deve ser regra declarada.
- Testar início, interior e fim de transição, poses duplicadas, personagem oculto e mudança de revisão.
- Caches de pose/expressão identificados por revisão real; não por objeto mutável sem assinatura.
- Não usar animação de pose/expressão na prévia em playback. O bloco ainda mostra seu estado estático.

## 5. Piscada e boca

- Agenda de piscar reprodutível por `projectId + characterId + frame` ou seed versionado equivalente.
- A prévia consome **somente piscadas**; a exportação aplica piscada com os demais efeitos.
- Fala é dado da timeline; boca é uma amostra específica da exportação, não evento ligado ao relógio HTML.
- Distinguir `idle`, `blink`, `talk`, `talk-blink` e estados combinados durante pose.
- Isolar máscara e recorte facial; preferir composição de regiões pequenas quando qualidade permitir.
- Prevenir artefatos: furo no rosto, dupla boca, olhos errados, alpha de borda e desencaixe com cabelo.
- Ciclo de boca pode ser amostrado por tabela/atlas/preparo, mas o algoritmo deve ser medido.
- Fazer A/B de patch em raster vs variantes preparadas; contar quantidade e bytes de imagens criadas.

## 6. Cabelo — decisão explícita de redesenho [EXP-HAIR]

Não portar o custo atual como obrigação; preservar resultado visual aceitável e a intenção do preset.
O perfil de referência utiliza reação posterior à pose, não uma simulação contínua sem necessidade.
Investigar em ordem:

| Candidato | Ideia | Medir |
| --- | --- | --- |
| H0 — controle | composição/física atual isolada | tempo de rig, amostra, desenho, memória |
| H1 — transformações | peças com pivôs e deformações simples | equivalência, custo/peça, alpha |
| H2 — malha pré-calculada | cache de vértices/offsets por intervalo | custo inicial, tamanho/cache, seek |
| H3 — raster antecipado | frames/reação do cabelo preparados e reusados | memória, tempo de bake, reuso |
| H4 — híbrido | regiões dinâmicas pequenas + restante estático | tempo total e qualidade nas emendas |

**Escolha por qualidade e tempo total de parede**, não apenas pela velocidade isolada da simulação.
Não assumir que malha é sempre melhor que atlas, nem que cache é sempre mais barato que cálculo.

### Regras de simulação de cabelo

- Parâmetros versionados, passo fixo, seeds fixas, comportamento consistente entre workers.
- Reação começa em evento autoral (pose/movimento permitido), termina ao estabilizar; inatividade é custo zero ou quase zero.
- Se física acumula estado, checkpoints por intervalo e função de seek determinístico; não depender do frame anterior produzido por aquele worker.
- Definir reset em mudança de pose, cabelo, fonte, visibilidade e cortes conforme comportamento visual aprovado.
- Rig separado de textura; reutilizar textura decodificada, sem `toDataURL` ou upload redundante por frame.
- Otimizar composição de **cabelo posterior** independentemente de face/boca; medir a junção.
- Testar flipping, escalas extremas, 2+ personagens, mudanças rápidas, fala e piscada simultâneas.
- Preservar qualidade de borda/antialiasing e geometria ao redimensionar.

## 7. Cena, texto, vídeo e áudio

- Para cada layer: z-order explícito, máscara, blend, resolução e referência a asset.
- Texto/balão devem conservar layout, fonte, quebras e alinhamento; documentar diferenças de engine.
- Imagens/fundos não mudam sem evento na timeline; renderizar/cachear por estado visual quando útil.
- Vídeo de mídia não é textura estática. Definir composição de clipes simultâneos, source-in, duração, layout, playback rate (se existir) e EOF.
- FFmpeg continua responsável pela codificação/mux, com timestamps de origem/saída explícitos.
- Áudio resolve intervalos e offsets; misturar sem alterar volume por acidente nem adicionar frame de atraso.

## 8. Recursos, memória e paralelismo

- Ter **asset loader** e **render buffer pool** separados da engine pura; limites mensuráveis e política LRU.
- Não reter base64 de todos os atlas junto com duplicatas decodificadas por tempo indefinido.
- Particionar um job por intervalos com preparo compartilhado apenas quando seguro; custo de IPC incluso.
- Pipeline bounded: limite de frames em voo, backpressure do FFmpeg e cancelamento por `AbortSignal`/equivalente.
- Não mover frames gigantes pelos processos se composição direta/stream local reduzir cópias.
- Testar assets maiores que limites de experimentos anteriores e perfis altos de RAM sem OOM.
- Medir alocação, cópias, raster, flush e GPU/CPU separadamente; instrumentação não pode distorcer benchmark.

## 9. Interface de teste mínima

```ts
prepare(job, resources): Promise<PreparedJob>
framePlan(prepared, outputFrame): FramePlan
render(framePlan, resources, targetBuffer): Promise<RenderStats>
dispose(prepared): Promise<void>
```

O export orquestra encode/cancelamento; `PreparedJob` possui caches com vida limitada.
`render` não pode abrir o documento do usuário, reconstruir a timeline ou criar eventos.
Os nomes acima são ilustrativos; evitar abstração até G1/G2.
**Continua:** [Plano 1.3 — testes e troca de motor](PLANO-1.3.md).

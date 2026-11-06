# Matriz de oportunidades — hipóteses rastreáveis

**Status:** priorização inicial de leitura e desenho experimental. **Nenhum ganho deste arquivo é medição nova.**

| ID | Problema/pergunta | Evidência disponível | Hipótese / experimento | Prioridade | Estado |
|---|---|---|---|---|---|
| AUD-001 | Mapa completo de dependências? | Pesquisa 01 e árvore do repo | Confirmar links restantes, runtime e decisões de ownership | P0 | PESQUISADO EM CÓDIGO / RUNTIME PENDENTE |
| AUD-002 | Por que cabelo ON ≈50s e OFF ≈9s? | [RELATO] mesmo vídeo 10s, sem relatórios brutos | Repetir A/B controlado e medir preparação→MP4 | P0 | PROTOCOLO PREPARADO |
| EXP-CAB-001 | Personagem redesenhado apesar de cabelo em repouso? | `composeHairFrame` + preparação dupla do hair | Instrumentar 0 / 1 / múltiplas reações | P0 | HIPÓTESE |
| EXP-CAB-002 | RGBA ROI/camada posterior substitui full canvas? | Código WebGL→Canvas→SVG e reação 29 frames | Spike ROI com alpha + oclusão | P0 | HIPÓTESE |
| EXP-CHAR-001 | Preparações/representações repetidas entre módulos? | Renderizador normal/sem cabelo + fontes compartilhadas | Revisão de materiais e cache por identidade completa | P1 | HIPÓTESE |
| EXP-ELE-001 | `capturePage` é gargalo residual? | Captura tokenizada e BGRA por quadro | A/B capturePage x paint com frameId | P1 | HIPÓTESE |
| EXP-ELE-002 | Shared texture D3D evita readback? | Disponível na API Electron, não ativo | PoC nativo isolado (após EXP-ELE-001) | P2 | HIPÓTESE |
| EXP-FFM-001 | Encoder CPU é custo dominante depois do preparo? | `rawvideo` e modo `encoder:'cpu'` | Comparar CPU/AMF no hardware real, mesma qualidade | P1 | HIPÓTESE |
| EXP-RAS-001 | DrawPlan nativo pode renderizar subconjunto com paridade? | Protótipo possui `unsupported` | Cenas reais com bloqueadores explícitos | P2 | HIPÓTESE |
| EXP-UI-001 | Clock/timeline re-renderizam desnecessariamente? | RAF e virtualização já presentes | Trace de scrub/scroll/drag real | P1 | HIPÓTESE |
| EXP-DATA-001 | Cache/salvamento atravessam ownership? | JSON, CAS, SQLite, refs | Mapear chaves de revisão e recuperação | P1 | HIPÓTESE |
| REF-001 | Qual arquitetura implementar? | Depende dos experimentos anteriores | ADR comparando opções com benchmark e riscos | P1 | BLOQUEADO |

**Critério de prioridade:** custo total evitável no **mesmo projeto**, probabilidade de preservar paridade, tamanho da mudança, risco de memória/dados/driver e manutenção. Não usar ranking como prova de ganho.

**Observação importante:** no modo `hairPoseReactionOnly`, `selectEditorV6HairlessTransitionBakes` já evita um segundo bake das transições; priorizar outras formas de duplicidade antes de culpar essa operação (ver `motion/hairBakeBatch.ts`).

[Plano detalhado](PLANO_EXECUTAVEL.md) · [Pesquisa 01](pesquisas/01-ARQUITETURA-GERAL-E-INTEGRACOES.md).

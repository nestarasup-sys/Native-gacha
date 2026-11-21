---
id: V6-ENGINE-DECISIONS
tipo: registro-de-decisoes
status: ativo
branch: Dev-v3
atualizado: 2026-11-21
---

# Decisões e hipóteses versionáveis

**Aceita:** acordada explicitamente com o usuário ou necessária para preservar dados.
**Proposta:** recomendação técnica revisável, ainda não comprovada.
**Em teste:** experimento ativo.
**Rejeitada:** hipótese cuja evidência a desaconselha.

| ID | Status | Decisão | Motivo / condição de revisão |
| --- | --- | --- | --- |
| DEC-001 | Aceita | V6 é o editor; engine própria produz a exportação offline | Usuário confirmou separação |
| DEC-002 | Aceita | Prévia não executa animações automáticas além de piscadas | Usuário rejeitou prévia de animações pesadas |
| DEC-003 | Aceita | Substituir arquitetura de render, cabelo, boca e timeline interna é permitido | Importa o resultado final, não preservar módulos legados |
| DEC-004 | Aceita | V7 não faz parte da iniciativa Dev-v3 | V7 experimental e fora de escopo |
| DEC-005 | Aceita | Preservar projetos, fontes, IDs e MP4 válido | Proteção de dados e confiabilidade do produto |
| DEC-006 | Proposta | Não implementar codec/rasterizador do zero; reutilizar bibliotecas maduras | Reduzir risco tecnológico, medir licença/empacotamento |
| DEC-007 | Proposta | Fazer spike de compositor antes de construir o core inteiro | Evitar abstrações sobre tecnologia inviável |
| DEC-008 | Proposta | IR temporário, versionado, distinto do schema salvo | Evoluir animações sem migrar usuário involuntariamente |
| DEC-009 | Proposta | Motor antigo fica como referência/fallback até cutover validado | Comparação e recuperação de regressões |
| DEC-010 | Proposta | Avaliar cabelos por H0–H4, sem portar custo atual automaticamente | Simulação e raster podem ser redesenhados |
| DEC-011 | Proposta | Medir tempo total e qualidade antes de eleger backend | Objetivo é MP4 final, não microbenchmark |
| DEC-012 | Aceita | Plano evolui por evidência; não exigir preservar implementações atuais | Usuário autorizou explorar com liberdade |
| DEC-013 | Em teste | Usar Sharp como primeiro laboratório offline sobre `EditorV6NativeFramePlan` | Smoke sintético H.264 e 15 testes locais passaram; sem paridade real, 1080p ou Windows empacotado |
| DEC-014 | Proposta | Avaliar backend novo antes de portar a simulação de cabelo | Experimento C++ anterior foi mais lento no fixture simples e falhou em projeto curto; custo de animação ainda precisa ser medido |
| DEC-015 | Em teste | Adaptador puro V6 -> IR de frame v1 e materialização de assets apenas no compositor | 7 testes novos no Windows aprovados; contrato F1 não cobre texto, boca, cabelo ou vídeo |
| DEC-016 | Em teste | Timebase puro de 24/30 fps preserva bordas `editorV6OutputFrame` e seek absoluto | CI 44838231747 passou; ainda não integrado ao exportador |
| DEC-017 | Aceita | SVG/librsvg é uma referência gráfica intermediária, não golden Chromium | Cenas V6 atuais sintéticas comparadas em CI; avaliação real por Chromium continua obrigatória |
| DEC-018 | Em teste | Fixture Chromium/Edge Windows para conferir RGBA do novo compositor antes da migração | CI 44862607942 compara RGBA completo e registrou divergência RGB em crop/flip/rotação; A/B de seis kernels não separou causa. Alpha desta fixture ficou exato; falta paridade Chromium de patches/máscaras, texto e personagem completo. |
| DEC-019 | Aceita | Durante a construção, o Codex pode utilizar intensamente CPU/GPU/RAM para testes automatizados, perfil e stress sintéticos isolados | Usuário autorizou carga alta agora; medir pixels, etapas, recursos e determinismo com limites seguros e sem tocar em dados pessoais |
| DEC-020 | Aceita | Adiar **benchmarks reais de exportação e comparação de velocidade ponta a ponta**, incluindo cortes de 5/40/200 s e 6.000 frames, até a engine estar completa e integrada para a etapa final de avaliação | A meta <=90 s não pode ser alegada por microbenchmark; smoke sintético curto de MP4 é prova funcional permitida, não benchmark |
| DEC-021 | Aceita | Entregar lotes amplos de implementação em Dev-v3; Codex deve sincronizar `origin/Dev-v3` com segurança, validar, fazer commit/push sem force e devolver relatório | Usuário enviará o prompt manualmente, depois encaminhará a resposta para revisão do GitHub antes do próximo lote; nenhuma outra branch será publicada |

## Critérios para mudar decisão

1. Declarar qual `DEC-XXX` mudou, teste/observação que motivou, impacto na UI/projeto/export.
2. Registrar alternativa escolhida, custo, riscos e plano de reversão.
3. Atualizar o plano dono da mudança; **não** abrir arquivo de ata por sessão.
4. Decisões aceitas pelo usuário não mudam silenciosamente por conveniência do código.
5. Decisão proposta não autoriza modificar dado real, eliminar funcionalidades ou declarar melhoria sem provas.

## Questões abertas [Q]

- [Q-01] Qual backend (Sharp, Skia, outro) entrega geometria de personagem, alpha, texto e velocidade no Windows empacotado?
- [Q-02] Qual técnica de cabelo vence em tempo total e qualidade sob presets reais?
- [Q-03] Como o contrato autoral deve definir clipes de vídeo simultâneos e sua ordem?
- [Q-04] Que partes dos atlas atuais são asset útil e quais são custo transitório evitável?
- [Q-05] Qual versão mínima do IR representa todos os recursos dos projetos já salvos?

Resolver pelo gate correspondente, não por preferência antecipada.

---
id: V6-ENGINE-DECISIONS
tipo: registro-de-decisoes
status: ativo
branch: Dev-v3
atualizado: 2026-11-20
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

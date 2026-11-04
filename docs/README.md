# Documentação do projeto

## Referência atual

- [README do aplicativo](../README.md): visão geral do produto.
- [Dados locais portáteis](APP_DATA_PORTABLE.md): localização e proteção dos dados.
- [Estrutura escalável dos dados](APP_DATA_ESCALAVEL.md): catálogo, migração e backup.
- [ADR-001: Electron modular](architecture/ADR-001-modular-electron.md): limites entre camadas.
- [ADR-002: fluxo de personagens](architecture/ADR-002-fluxo-personagens.md) e [contrato de produção](architecture/CHARACTER_PRODUCTION_CONTRACT.md): Fabricador, Customizador e Studio Principal.
- [Gênero do corpo de referência no Roupas DEV](architecture/ROUPAS_DEV_GENERO_PREVIA.md): preferência por conjunto e substituição visual do tronco na prévia.
- [Investigação de refatoração (27/10/2026)](architecture/INVESTIGACAO_REFATORACAO_APP_2026-10-27.md): Base de Vídeos/Roteiros e mapa do restante do app.
- [Auditoria da refatoração geral V1 — Fase 0 (01/11/2026)](architecture/AUDITORIA_REFATORACAO_GERAL_V1_FASE_0.md): mapa arquitetural, riscos, fases e tickets iniciais.
- [Programa da refatoração geral V1](architecture/PROGRAMA_REFATORACAO_GERAL_NATIVE_GACHA.md) e [registro de execução V2](architecture/PROGRAMA_REFATORACAO_GERAL_V2_NATIVE_GACHA.md): decisões, testes, módulos refatorados e atualização pós-V2.
- [Prompt de continuidade para Codex — Refatoração Geral V3](CODEX_REFATORACAO_GERAL_V3.md): plano executável, priorizando defeitos de cabelo na exportação, CI e revisão das alterações pós-V2. **Somente Dev-V2 local; sem publicação de código automática.**
- [Editor V6 — exportação MP4](editor-v6/EXPORTACAO.md): contratos e estado experimental da animação de cabelo, incluindo limitações e testes ainda necessários.
- [Editor V6 — plano de excelência V4](editor-v6/ROADMAP_V4_EXCELENCIA.md): auditoria pós-V3, CI, sincronismo de áudio/vídeo, oportunidades de timeline, exportação e experiência criativa.
- [Editor V6 — Rodada 04 de aceleração](editor-v6/RODADA_04_V4_ACELERACAO_EXPORT.md): primeira otimização de leitura BGRA, correções de CI/encoder e meta de 10–15 s.
- [Codex — Rodada 05 de velocidade real](editor-v6/CODEX_RODADA_05_V4_EXPORT_10_15S.md): benchmark isolado do Editor V6 06 com Preset 2, experimentos A/B e critérios de qualidade, memória e segurança.
- [Editor V6 — Rodada 05 (benchmark real com áudio)](editor-v6/RODADA_05_V4_RETOMADA_BENCHMARK.md): correção do benchmark que rejeitava projetos reais com trilha sonora.
- [Editor V6 — Rodada 06 (malha de cabelo mais eficiente)](editor-v6/RODADA_06_V4_MALHA_CABELO_GPU.md): menos cálculos/alocações por quadro e golden numérico de paridade.
- [Editor V6 — plano histórico de aceleração](editor-v6/PLANO_ACELERACAO_EXPORT.md): medições, tentativas rejeitadas e gargalos anteriores; não confundir com baseline atual.
- [Editor V6 V4 — Rodada 01 (boca, cabelo e memória)](editor-v6/RODADA_01_V4_BOCA_CABELO_MEMORIA.md): retenção corrigida, superfície de cabelo reutilizada, diagnóstico do quadrado facial e validação pendente.
- [Codex — Rodada 02 V4 (boca isolada e RAM)](editor-v6/CODEX_RODADA_02_V4_BOCA_CABELO_RAM.md): prompt executável para validar o trabalho, corrigir a boca em peça independente e medir exportações longas.
- [Refatoração V3 — execução e revisão após publicação](architecture/PROGRAMA_REFATORACAO_GERAL_V3_NATIVE_GACHA.md): resultados técnicos, aceite sintético, limitações e pendências da CI.
- [Registro de importação](IMPORTAR_ZIP.md): proveniência histórica e cuidados de publicação.

## Histórico

Os documentos `architecture/CICLO_*.md` e os relatórios datados registram decisões e entregas passadas. São contexto histórico, não instruções operacionais atuais; em caso de divergência, prevalecem o código e os documentos de referência acima.

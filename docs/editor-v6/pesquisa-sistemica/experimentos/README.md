# Experimentos — área de protocolos e resultados

**Estado:** protocolos escritos; **nenhum experimento foi executado nesta criação de estrutura**.

- [EXP-001 — cabelo ON/OFF](EXP-001-CABELO-ON-OFF.md): reproduzir 50s→9s controladamente e decompor fases.
- [EXP-002 — captura offscreen](EXP-002-CAPTURA-OFFSCREEN.md): `capturePage` versus `paint` e hipótese futura de textura compartilhada.
- [EXP-003 — compositor ROI de cabelo](EXP-003-ROI-CABELO.md): reagir 29 quadros sem reconstruir o personagem inteiro.

Resultados sempre incluem: revisão, build/dirty, hash da cópia autorizada, PC/driver, casos 150/300 frames, opções, warm/cold, tempo total de parede e subfases, amostras, PNG/RGBA, áudio, memória, erros e conclusão. **Não armazenar dados brutos privados ou paths pessoais neste repositório.**

Não confundir plano de teste com execução. Não alterar dados do usuário para obter baseline. O `benchmark-project-export.cjs` atual tem fixture específica; não remover guardas para aceitar outro projeto.

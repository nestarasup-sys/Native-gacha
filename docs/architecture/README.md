# Arquitetura e contratos

## Referências de engenharia

- [ADR-001 — modularizar Electron](ADR-001-modular-electron.md): limites entre IPC, serviços, repositórios e validação.
- [ADR-002 — propriedade dos dados de personagens](ADR-002-fluxo-personagens.md): responsabilidades de Fabricador, Customizador e Studio.
- [Contrato de produção de personagens](CHARACTER_PRODUCTION_CONTRACT.md): invariantes e integrações a preservar.
- [Extrações de Roupas DEV](EXTRACOES_ROUPAS_DEV.md): módulos isolados, segurança de importação, invariantes preservadas e validação.
- [Investigação progressiva de refatoração](INVESTIGACAO_REFATORACAO_APP_2026-10-27.md): registro extenso de achados e execuções, não um conjunto de garantias da branch atual.

A fonte de verdade para comportamento executável são o código, os contratos compartilhados e os testes. Verifique as conclusões datadas antes de promover uma orientação a regra vigente.

## Material histórico

Os ciclos de refatoração, relatórios de outubro de 2026, o incidente de cache de roupas e registros de aceite de issues foram **movidos sem descarte** para [arquivo da arquitetura](../archive/architecture/README.md). Use-os para entender decisões anteriores, não como roteiro operacional atualizado.

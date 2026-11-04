# R37 — estado de implementação e critérios de promoção (2026-11-04)

## Descoberta
O protótipo **já existia** em `src/shared/editorV6PartMotionPrototype.ts` (R31); não foi necessário criar um segundo compilador concorrente. Ele produz uma draw-list geométrica determinística de peças interpoladas, mas declara `exportReady: false`. O caminho de produção continua usando os atlas tradicionais.

## Rodadas incrementais desta sessão
1. CI Windows remota ampliada com auditoria de arquitetura, TypeScript e regressões de preparação de movimentos.
2. Testes do protótipo reforçados: repetibilidade, ordem, identidade da fonte e operadores visuais ainda ausentes.
3. Teste do protótipo incluído como gate obrigatório no laboratório Windows; relatório em Markdown e JSON para cada execução.

## Próximos gates técnicos
- Implementar operadores em módulos isolados, primeiro tint de pele/contorno e pontes de juntas; não usar como exportador.
- Compor roupas, rosto, boca, olhos e cabelo em ordem de camadas idêntica ao renderer de referência.
- A/B pixel a pixel BGRA/RGBA de 7 amostras e 30 quadros, incluindo flipX, transparência e pivôs.
- Testar 720p/1080p, MP4 Turbo com dois workers, cancelamento, memória e saída emenda.
- Rodar três repetições de exportação real com cache frio, sem dados privados na CI.
- Só então avaliar flag experimental explicitamente opt-in; nunca ativar silenciosamente na `Dev-V2`.

## Limites
A CI GitHub usa Windows Server 2025 e fixtures sintéticas. Ainda não há evidência de equivalência RGBA para R37 nem benchmark real pós-R35. O trabalho desta sessão **não** afirma ganhos de desempenho nem aprova o novo compositor para produção.

# Editor V6 — modos selecionáveis para benchmark (Zona de Guerra)

**Somente na branch `dev-v2-zona-de-guerra`.** O painel de exportação exibe seis botões com seleção exclusiva. Todos mantêm 1080p/30FPS, CPU H.264, Turbo 2x, animação de cabelo/rosto/boca e verificação do token do bitmap. R36 (paint) e R37 (compositor incompleto) **não** ficam habilitados.

| Botão | Motion bakes | Bocas em voo | Espera após captura desatualizada | Medir recorte da face |
| --- | ---: | ---: | ---: | --- |
| 01 Controle | 2 | 2 | 16 ms | Sem encode |
| 02 Movimentos 1× | 1 | 2 | 16 ms | Sem encode |
| 03 Boca 1× | 2 | 1 | 16 ms | Sem encode |
| 04 Captura 8 ms | 2 | 2 | 8 ms | Sem encode |
| 05 Rosto clássico | 2 | 2 | 16 ms | PNG antigo |
| 06 Combinado | 1 | 2 | 8 ms | Sem encode |

Estes modos são **hipóteses A/B**, não promessas de aceleração: diminuir a concorrência pode melhorar a pressão de memória ou piorar a duração; tentar uma nova captura em 8 ms pode custar CPU adicional. O evento R36 `paint` não substitui `capturePage` em nenhum modo.

## Como testar

1. Faça backup e abra uma cópia imutável do novo projeto de 309 quadros. Trabalhe somente com esta branch atualizada.
2. Na janela **Exportar vídeo**, escolha um dos seis botões. Só um fica ativo. Use a mesma pasta, mesmo preset de cabelo, 1080p/30FPS, CPU H.264, Turbo e ciclo de boca.
3. Exporte e confira o MP4; no relatório `exports/<job-id>.report.json`, os campos `options.testMode` e `exportTestSettings` identificam exatamente qual estratégia rodou. `runtime.buildSha` identifica o commit do código compilado.
4. Teste os modos em rodadas intercaladas (por exemplo, 01–04–02–06–03–05, depois em ordem inversa) para reduzir viés de aquecimento. Para comparação fria, use cópias/perfis isolados; não apague caches pessoais.
5. Registre tempo de preparo do cabelo, Main, tempo total, `motionPreparation`, `mouthAnimation`, `captureReadbacks`, `captureStaleReadbacks`, 309/309 quadros, emenda, qualidade e falhas.
6. Execute três rodadas comparáveis por modo antes de escolher o vencedor; compare a mediana, não o menor tempo isolado.

**Baseline histórica ativa:** [54,716 s](baselines/native_gacha_nova_baseline_2026-11-05.md) de uma exportação fria. Não é média de três rodadas, e não prova o desempenho de qualquer um dos novos modos. Relatórios não devem ser enviados integralmente ao GitHub, pois podem conter caminhos locais. Use o comparador sanitizado ou compartilhe somente os tempos/métricas relevantes.

A opção **03 Boca 1×** passa pela preparação do backend com limite de **um** job concorrente; o comportamento é coberto por regressão com contagem de concorrência 1 versus 2. A opção **05 Rosto clássico** executa o encode PNG só para o teste A/B, preservando o mesmo recorte de alpha da versão otimizada.

## Comparador offline por modo

O resumo sanitizado no GitHub **não contém o identificador original do projeto**. Não é possível recuperar ou inventar esse hash. Para provar que uma exportação candidata é do mesmo projeto, informe o relatório **original da baseline** como referência local:

```powershell
npm run bench:editor-v6:compare -- --reference-report="C:\\...\\baseline-original.report.json" --candidate="C:\\...\\modo01-1.report.json" --candidate="C:\\...\\modo01-2.report.json" --candidate="C:\\...\\modo01-3.report.json"
```

Acrescente quantos `--candidate` forem necessários, inclusive dos outros modos. O programa não imprime caminhos nem IDs. Ele agrupa mediana por `options.testMode`, exige três execuções por modo para apontar vencedor e recusa resultados sem confirmação do mesmo projeto. Mesmo assim a paridade visual precisa ser inspecionada no MP4.

## Resultado visível no app

Após concluir, o painel informa o **modo efetivamente usado** e o tempo aproximado da exportação **incluindo a preparação do cabelo**, além de mostrar o MP4 e relatório. Ao usar pasta fixa, o nome do arquivo contém o identificador do modo (`- captura-8 - <job-id>.mp4`, por exemplo). Sem modo selecionado nos chamadores históricos, a nomenclatura anterior permanece.

### Gate de equivalência física

O fixture de overlays agora produz **dois MP4s Turbo reais** na CI Windows: Controle (16 ms) e Captura 8 ms, com os mesmos 60 quadros e três vídeos sobrepostos. Os 60 quadros decodificados em RGB devem ser **idênticos byte a byte**, além de exigir que o relatório confirme `testMode: captura-8`, captura segura e dois workers. Isso verifica a opção 04 no caminho de produção sem precisar de mídia privada.

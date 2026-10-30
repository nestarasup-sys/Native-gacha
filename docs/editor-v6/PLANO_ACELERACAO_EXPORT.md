# Editor V6 — plano de aceleração máxima do export

Data: 30/10/2026. Base inicial de análise: branch `Dev-V2`, commit `b79aaaf`.
Estado: em andamento. Otimizações, medições e verificações ficam registradas abaixo; a comparação real está concluída para a configuração atual, e a otimização do gargalo de preparação ainda está pendente.

## Objetivo

Reduzir o tempo entre clicar em Exportar e receber o MP4 validado, incluindo preparação, renderização, codificação, áudio e publicação. Buscar o maior ganho comprovado no computador disponível, preservando resolução, 30 FPS, movimentos, expressões, roupas, transparências, ordem das camadas e sincronização de áudio.

A prévia continua com o comportamento atual: a presença das animações na exportação não exige habilitá-las na prévia.

Não prometer um multiplicador antes das medições. A duração total e a estabilidade determinam se uma otimização entra em produção.

## Ponto de partida confirmado no código

| Área | Recursos existentes | Oportunidade a investigar |
| --- | --- | --- |
| Preparação de poses | `prepareMotions.ts` agrupa transições por chave e reaproveita resultados do projeto | Evitar buscas completas repetidas e medir o custo de anexar cada resultado ao documento |
| Serviço de movimento | `motionIpc.ts` possui cache em memória/disco, janelas reutilizadas e concorrência configurável | Medir acertos reais, invalidação, tamanho e contenção antes de aumentar concorrência |
| Renderização | `exportWorker.tsx` mantém imagens preparadas e chaves visuais | Reduzir resolução de cena, trabalho React e preparação repetida por quadro |
| Captura | Export possui reaproveitamento de bitmap e tempos por fase | Identificar quando captura, IPC, cópia de memória ou espera do Chromium dominam |
| Paralelismo | Turbo usa até dois trechos; fallback usa um renderizador | Distribuir trabalho pelo custo e testar limites de CPU, GPU e memória |
| Codificação | Seleção automática NVENC/QSV/AMF com OpenH264 de recuperação | Medir o caminho completo; encoder rápido pode continuar esperando quadros |
| Finalização | Concatenação com cópia de vídeo, mixagem única, validação e publicação protegida | Medir composição de vídeos, áudio, emendas e tempo de finalização separadamente |

Referências: [exportação](EXPORTACAO.md), [preparação de transições](PREPARACAO_TRANSICOES.md), [arquitetura](ARQUITETURA_E_INTEGRACAO.md) e [testes offscreen](TESTES_DE_ESTRESSE_OFFSCREEN.md). Estes documentos continuam sendo a referência dos contratos existentes.

## 1. Estabelecer uma medição confiável — prioridade máxima

- Separar tempo total em leitura/validação, preparação de poses, preparação facial, abertura de workers, renderização/codificação, mixagem/junção, validação e publicação.
- Aproveitar `motionPreparation` e `frameTiming` dos relatórios existentes. Acrescentar métricas compatíveis quando necessário, sem somar tempos concorrentes como se fossem tempo total.
- Registrar acertos e falhas dos caches no serviço, bytes carregados, pico de memória e quantidade de workers/processos. `requested` na preparação não equivale a rasterização: pode recuperar cache do serviço.
- Capturar no relatório o RSS inicial e o pico amostrado do processo principal, identificando explicitamente que esse dado não inclui renderizadores, GPU ou FFmpeg. Correlacionar com medições externas antes de inferir o pico total do app.
- Registrar o tempo agregado de preparação dos atlases do loop da boca em `mouthAnimation.preparationMilliseconds`, separado do tempo de renderização; a soma cobre trechos processados em paralelo e não deve ser tratada como tempo de parede.
- Dividir o orçamento dos atlases do loop da boca pela concorrência real de trechos do export. O limite passa a controlar o total simultâneo em Turbo, e continua respeitando o teto de pixels por atlas.
- Identificar o caminho que limita o término do export. Ordenar as próximas mudanças pelo tempo recuperável nesse caminho.
- Registrar máquina, versão do app, encoder, resolução, intervalo, opções, estado dos caches e duração da mídia para cada comparação.

**Entrega:** tabela de referência e três maiores custos, com evidência. Nenhum ganho é declarado usando apenas a velocidade do encoder ou uma fixture pequena.

### Primeira linha de base disponível

O relatório local `f75c3a26-0e6f-433d-9b05-dfc8de17fdb9.report.json` registra 5.700 quadros (190 s), exportados em 361,3 s: fator 1,90× a duração. A tentativa usou AMF, Turbo em duas partes concorrentes e criou 20 partes de 300 quadros. Renderizou 1.649 quadros e reutilizou 4.051 bitmaps. A preparação registrou 89 transições distintas em 55,9 s, sem reaproveitamento; o loop opcional de boca produziu 201 atlases e somou 143.620.670 bytes ao longo dos 20 trechos. O limite de 64 MiB em `prepareMouthLoops.ts` é aplicado a cada trecho, não ao total do relatório; portanto, esse valor agregado não demonstra violação do limite. Como duas partes rodam ao mesmo tempo, o pico simultâneo pode chegar à soma dos orçamentos por trecho; o relatório atual não mede esse pico. Esta é uma referência histórica anterior à preparação de movimentos em lote, não uma comparação posterior nem prova de ganho. O relatório fica em `app-data` local e não deve ser adicionado ao Git.

### Comparação sintética de um e dois workers

Em 30/10/2026, `node scripts/editor-v6/test-stress-offscreen.cjs --export-stress --compare-workers` exportou seis vezes o mesmo documento sintético de estresse, carregado uma vez no Electron offscreen e executado na ordem 1, 2, 2, 1, 1, 2 workers. Cada rodada exportou 7.200 quadros (240 s), 320×180, sem mídia ou áudio, com as 284 transições já persistidas; todas as rodadas decodificaram 60 quadros de amostra e confirmaram as 120 transições visíveis. O encoder foi o caminho CPU (`libopenh264`).

| Workers | Rodadas | Mediana do export | Mediana da renderização | Fator export/duração | Pico máximo de RSS do processo principal |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 3 | 42,991 s | 42,306 s | 0,179× | 249.565.184 bytes |
| 2 | 3 | 24,830 s | 24,082 s | 0,103× | 243.818.496 bytes |

Nesta fixture, dois workers reduziram a mediana do tempo total em 42,2% (1,73× mais rápido). A finalização ficou perto de 0,62–0,68 s, então a diferença está na renderização, não na junção. Em uma rodada de Turbo de 20 quadros por segundo/24,8 s, o relatório somou 30,1 s em `ipcDrawMs`, 25,5 s em `rafWaitMs` e 16,1 s em `captureMs` entre partes concorrentes; esses tempos se sobrepõem e não são tempos de parede. O perfil aponta o caminho de desenho/captura por quadro como próximo alvo de investigação. O pico RSS é somente do processo principal e não inclui renderizadores, GPU nem FFmpeg. Esta comparação sintética escolhe dois workers para o perfil testado, mas não substitui o teste no projeto real, não representa outros tamanhos/resoluções e não prova ganho de uma mudança de código. Relatórios e MP4s estão na pasta ignorada `out/editor-v6-stress/runs/2026-10-30T10-51-55-879Z-23232/`; não devem ser adicionados ao Git.

A primeira otimização implementada indexa assets e movimentos uma vez, agrupa chaves em tempo linear e aplica os resultados em uma passagem por blocos, evitando percursos repetidos da timeline e cópias sucessivas de grupos. A preparação dos atlases de boca agora respeita o limite individual e o orçamento dividido entre trechos Turbo simultâneos; excesso impossível é detectado antes de rasterizar. O relatório registra o RSS do processo principal e o tempo acumulado de preparação dos atlases, separados de memória total e tempo de parede. Também separa em `phaseMilliseconds` a criação da pasta temporária, leitura de personagens, preparação de movimentos, testes de encoder, tentativas de renderização, finalização/validação e publicação. A tentativa mantém seu próprio tempo de parede; finalização mede concatenação, áudio e validações, sem confundir trabalho paralelo com tempo total. O tempo total e o pico de RSS agora incluem a publicação do MP4; o relatório só muda para `completed` depois que o arquivo é publicado. O amostrador de RSS inicia imediatamente antes do bloco `try/finally` que o encerra, para que falhas durante a configuração síncrona não deixem um timer órfão. O serviço de movimentos compartilha uma rasterização ainda em andamento para pedidos simultâneos com a mesma chave; cada consumidor pode cancelar sem interromper os demais, e o trabalho é abortado quando ninguém mais aguarda. Testes Electron cobrem deduplicação, isolamento de cancelamento e persistência das métricas de fases no relatório final. `npm run test:editor-v6` passou (170 testes aprovados, um ignorado), `npm run test:editor-v6:motion-service` passou, `npm run test:editor-v6:export` passou com build e cenários de Turbo/fallback/cancelamento, e `npm run audit:architecture` passou sem violações. A medição posterior no projeto completo continua pendente; até lá não se atribui redução de tempo às mudanças.

### Comparação no projeto real de estresse

Em 30/10/2026, o benchmark isolado exportou seis vezes a cópia verificada do projeto `72fbea64-4b18-4d31-9a0c-317f0f519a06`, revisão `2026-10-30T10:09:29.520Z`, na ordem 1, 2, 2, 1, 1, 2 workers. A máquina é um AMD Ryzen 5 4600G (6 núcleos/12 threads), 15,4 GiB de RAM; Electron usou encoder automático, selecionando AMF. As seis rodadas preservaram 5.700 quadros (190 s), 1920×1080, 30 FPS, 28 clipes de áudio, uma entrada de vídeo e saída de áudio. Foram solicitadas 89/89 transições em cada rodada; `reused=0` significa que nenhuma transição já estava embutida no documento do projeto, não informa acertos ou falhas do cache em memória/disco do serviço. A preparação das transições levou aproximadamente 54 s por rodada. A boca gerou de 198 a 201 estados por export, sem estados ignorados ou obsoletos; os 317–319 s de `mouthAnimation.preparationMilliseconds` são tempo agregado entre trechos paralelos, não tempo de parede.

| Workers | Rodadas | Mediana total | Mediana de renderização | Pico máximo de RSS observado no processo principal |
| --- | ---: | ---: | ---: | ---: |
| 1 | 3 | 394,543 s | 313,092 s | 2,679 GiB |
| 2 | 3 | 356,972 s | 275,144 s | 3,286 GiB |

Dois workers reduziram a mediana total em 9,5% (37,571 s; 1,11×) e a renderização em 12,1%, mas elevaram o maior RSS observado em 22,7%. O RSS cresceu ao longo do benchmark sequencial (1,235 GiB na primeira rodada até 3,286 GiB na sexta); isso é um sinal para investigar retenção/ciclo de vida de memória e não permite declarar dois workers como padrão seguro. A diferença entre boca com 198 e 201 estados decorre da divisão dos trechos concorrentes. A primeira comparação real está concluída, porém não existe relatório pré-mudança da mesma revisão e com as mesmas opções; portanto, esses números comparam apenas 1 vs. 2 workers e não demonstram ganho das otimizações anteriores. Projeto e mídias originais foram comparados com a cópia de backup: os 297 arquivos do projeto tiveram hashes idênticos. Relatórios e vídeos ficam na pasta ignorada `out/editor-v6-stress/runs/actual-project-2026-10-30T11-22-38-700Z-25376/`, fora do Git.

**Custos dominantes medidos:** renderização (275–313 s por export), preparação acumulada de boca (aprox. 318 s somados entre trechos) e preparação de movimentos (aprox. 54 s). O relatório atual não mede hits e misses do cache do serviço, e o tempo de preparação permaneceu próximo de 54 s nas seis rodadas; acrescentar métricas de cache antes de decidir se chaves, persistência ou orçamento precisam mudar. O pico RSS sequencial também exige perfil de memória isolado por rodada, incluindo renderizadores e FFmpeg, antes de alterar a concorrência padrão.

Como evidência complementar, `npm run bench:editor-v6:motion-preparation` comparou uma implementação legada e indexada em uma fixture sintética de 120 personagens e 2.400 planos, por cinco rodadas: medianas de 139,82 ms e 8,59 ms (16,27×), com os mesmos 2.400 planos concluídos. Esse benchmark cobre o índice de preparação antecipada no renderer, não o `prepareExportMotions` do exportador nem o projeto real; portanto, serve para validar a técnica de indexação e não para estimar o ganho de export.

## 2. Remover trabalho repetido da preparação — prioridade alta

- Construir índices de assets, personagens, blocos e transições uma vez por preparação; evitar percorrer toda a timeline dentro de cada grupo.
- Investigar aplicação dos resultados em lote para reduzir cópias repetidas do documento, preservando IDs, anexos e semântica das funções compartilhadas.
- Preparar somente estados realmente usados e visíveis no intervalo exportado, respeitando estados herdados de blocos anteriores ao início do intervalo.
- Compartilhar uma tarefa em andamento quando a mesma chave for pedida novamente. Cancelar um consumidor não pode interromper trabalho ainda necessário por outro.
- Medir preparação de boca por trecho/lote e reaproveitar estados equivalentes quando a chave incluir todas as dependências visuais.

**Aceite:** pedidos e trabalho efetivo acompanham combinações únicas válidas; a saída permanece equivalente em intervalos completos e parciais.

## 3. Tornar os caches confiáveis e úteis — prioridade alta

- Auditar as chaves existentes antes de criar outro cache. Considerar revisão/conteúdo da fonte, personagem, rig, roupa, pose, expressão, parâmetros e versão do algoritmo conforme cada resultado realmente depende deles.
- Editar a folha original ou uma pose deve invalidar os resultados dependentes. Não aceitar uma imagem antiga só porque seu ID continua igual.
- Manter cache descartável, com limite em bytes, descarte por uso e recuperação diante de entrada incompleta/corrompida.
- Preservar separação entre catálogo-fonte, personagem e documento do Editor V6. Cache não vira cópia permanente do catálogo nem reescreve projetos.
- Reavaliar preparação antecipada ociosa já existente: priorizar estados úteis, suspender durante interação e evitar disputar recursos com export ativo.

**Aceite:** export aquecido evita preparação desnecessária; editar uma dependência atualiza a imagem correta; falha de cache causa reconstrução segura.

## 4. Reduzir o custo de cada quadro — prioridade alta

- Usar os tempos de resolução de cena, preparação de assets, commit React, espera de desenho, captura e IPC para escolher o primeiro alvo.
- Investigar índices temporais para localizar blocos ativos sem varrer a timeline inteira a cada quadro, preservando sobreposições e limites de blocos.
- Reutilizar composição estática, geometria e imagens quando suas dependências não mudarem. Separar camadas estáticas e animadas apenas se a medição justificar o custo adicional.
- Auditar as chaves visuais: incluir atlas, recorte, boca, piscar, pose, transformação e ordem de camadas. Uma chave incompleta pode congelar animações.
- Reaproveitar captura estática mantendo todos os quadros devidos no stream de 30 FPS. Vídeo e áudio continuam avançando mesmo quando um bitmap de personagem se repete.
- Reduzir alocações e cópias BGRA no caminho worker → main → FFmpeg quando as medições apontarem esse custo. Preservar tamanho, stride, alpha e ciclo de vida dos buffers.
- Só trocar esperas de desenho por outro mecanismo após demonstrar captura correta de SVG, fontes, imagens e transparências em Chromium.

**Aceite:** diminuir o custo da fase dominante sem quadros antigos, cortes de camada ou divergência visual.

## 5. Usar melhor CPU, GPU e memória — prioridade após reduzir desperdício

- Comparar um e dois workers com o mesmo projeto. Testar quantidades maiores apenas como experimento limitado por recursos, sem aumentar o padrão automaticamente.
- Investigar fila dinâmica de partes: partes desiguais em custo não devem deixar um worker ocioso enquanto outro termina sozinho.
- Equilibrar tamanho dos trechos, custo de abertura e reutilização de workers. Mais partes também aumentam preparação, emendas e validações.
- Respeitar pressão de memória e limites de sessões do encoder. Limitar tanto tarefas quanto bytes em trânsito; manter contrapressão na escrita do FFmpeg.
- Comparar encoder por hardware e CPU no tempo total e na qualidade. Alterações de parâmetros precisam preservar compatibilidade entre partes.
- Manter recuperação previsível e cancelamento completo. Reaproveitar partes após falha só pode ser proposto com validação de integridade e compatibilidade demonstrada.

**Aceite:** escolher a configuração com menor tempo total estável; não selecionar a que apenas usa mais CPU/GPU.

## 6. Experimentos estruturais — somente se os custos restantes justificarem

| Experimento | Quando investigar | Condição para adotar |
| --- | --- | --- |
| Compositor dedicado Canvas/WebGL | DOM/React ou captura dominam após as otimizações anteriores | Paridade de roupas, máscaras, texto, efeitos e camadas; manter contratos compartilhados |
| Transferência de frames em lotes | IPC domina e há memória disponível | Fila limitada, cancelamento imediato e nenhuma perda de quadros |
| Caminho de captura/codificação com menos cópias | Cópias BGRA dominam e a plataforma permite | Compatibilidade comprovada com Electron e fallback funcional |
| Cache de trechos renderizados | Reexports parciais são frequentes e predominantes | Dependências completas, encoder compatível, limites de disco e publicação segura |

Cada experimento precisa de comparação isolada e possibilidade de remoção. Evitar substituir o renderizador inteiro sem evidência de que ele limita o export.

## Matriz de validação e desempenho

Usar como referência principal obrigatória o **único projeto atualmente existente no Editor V6**, que o usuário já montou como teste de estresse. Medir o export completo desse projeto antes e depois das otimizações, preservando sua timeline, personagens, vídeos, falas, pensamentos, poses, expressões e presets. Registrar o ID e a revisão do documento no início da execução para comparar exatamente o mesmo conteúdo, mesmo que outros projetos sejam criados depois.

Preservar o projeto original e suas mídias. Criar uma cópia de segurança verificável antes da execução e usar cópia isolada para cenários que alterem fontes, dados ou provoquem falhas. Salvar MP4s e relatórios de cada rodada em destinos distintos. Fixtures sintéticas ficam como complemento para isolar regressões e cenários ausentes; a aprovação de desempenho exige a comparação no projeto de estresse existente.

| Cenário | O que conferir |
| --- | --- |
| Cena estática longa | Reutilização de bitmap sem reduzir duração ou contagem de quadros |
| Muitas poses e roupas | Preparação por combinação, vínculos e alinhamento corretos |
| Fala, pensamento, expressões e presets PT | Variações visuais, boca, piscar e transições sem congelamentos |
| Timeline desordenada de 3–4 minutos | Sobreposições, memória, distribuição de carga e tempo total |
| Vídeos e áudios sobrepostos | Recortes, ganho, silêncio, composição e sincronização |
| Export parcial e cortes durante movimento | Estado anterior ao início e continuidade nas emendas |
| Fonte editada após cache aquecido | Invalidação correta; nenhuma imagem antiga |
| Cancelamento, falha de worker/encoder | Processos liberados, destino anterior preservado e recuperação |

Para cada candidato: comparar referência e mudança no mesmo ambiente, alternando a ordem, com pelo menos três rodadas por condição relevante. Separar cache frio, aquecido e reabertura do app; nunca limpar dados pessoais para simular cache frio.

Registrar mediana, dispersão, memória, quadros renderizados/reutilizados e falhas. Usar ganho `tempo de referência / tempo novo` e fator `tempo de export / duração do vídeo`; fator menor indica export mais rápido. Não misturar resoluções, opções ou qualidade entre variantes.

Validar contagem de quadros, 30 FPS, resolução, duração, áudio e emendas com os mecanismos existentes. Conferir amostras visuais nos pontos difíceis; hash do MP4 comprimido não demonstra equivalência visual. Testes sonoros automatizados ficam silenciosos; reprodução no PC somente quando solicitada, com volume baixo.

## Sequência de entregas

1. **Diagnóstico:** concluído para o projeto `72fbea64-4b18-4d31-9a0c-317f0f519a06`, com backup verificado e comparação de workers; estabelecer a captura de um relatório baseline da mesma revisão/opções para avaliar mudanças de código.
2. **Preparação:** índices, aplicação em lote e eliminação de pedidos repetidos conforme evidência.
3. **Cache:** invalidação auditada, limites e preparação antecipada útil.
4. **Quadros:** reduzir resolução de cena, commits, captura ou cópias conforme o maior custo restante.
5. **Agendamento e encoder:** testar distribuição de partes e limites de concorrência.
6. **Experimentos estruturais:** executar somente os que atacarem gargalos comprovados.

Cada entrega deve conter diff pequeno, verificação focada, comparação antes/depois, documentação dos contratos alterados e commit local. Executar typecheck, auditoria de arquitetura, testes relevantes do Editor V6 e build quando a implementação atingir esses caminhos. Não rodar export pesado para validar uma alteração apenas documental.

## Conclusão de cada etapa

- [ ] Ganho no tempo total reproduzido ou hipótese descartada com registro.
- [x] Comparação de workers realizada no projeto de estresse existente, com o mesmo conteúdo e opções; [ ] comparação antes/depois das otimizações com relatório baseline equivalente.
- [ ] Qualidade, movimentos, presets e áudio preservados.
- [ ] Pico de memória e consumo de disco conhecidos e limitados.
- [ ] Cache atualizado corretamente após edição de fontes.
- [ ] Cancelamento, fallback e destino existente protegidos.
- [ ] Dados originais preservados e commit local revisado.

O plano termina quando os custos dominantes foram tratados ou possuem limite técnico medido, e novas tentativas não apresentam ganho repetível sem comprometer qualidade ou estabilidade. “Aceleração máxima” é uma busca orientada por essas medições, não uma promessa de velocidade ilimitada.

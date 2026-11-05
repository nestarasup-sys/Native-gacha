# PAINEL DA MISSÃO — atualização 05/11/2026

**Objetivo:** exportar com animação de cabelo em até 30 s no projeto autorizado, sem reduzir qualidade, corrigindo os defeitos de continuidade e disparo.

**Baseline informado:** 92 s (condições históricas não documentadas). **Melhor export completo com cabelo medido nesta retomada:** 206,74 s (uma rodada aquecida); mediana de 3 rodadas: 228,53 s. **Controle sem cabelo:** melhor 53,86 s; mediana 54,66 s.

**Qualidade visual:** saída estrutural validada; SSIM alto entre rodadas. Continuidade do cabelo ainda pendente de inspeção. **Etapa ativa:** Etapa 5 (perfil de performance) e investigação da animação.

**Tarefa ativa:** E5-T002 — validar e ampliar a otimização WebGL por segmentos; no recorte inicial de 20 s, export caiu para 33,41 s, ainda acima da meta local de 10 s.

**Tarefas concluídas nesta retomada:** E0-T001 (backup verificado), E0-T002 (runner do projeto autorizado), E0-T003 (baseline cabelo/controle sem cabelo), E5-T001 (perfil do gargalo). **Pendentes:** E4-T001 (validar continuidade/cobertura visual), E5-T002 (otimização estrutural), E5-T003 (alcançar ≤30 s e repetir em 3 exports).

**Último commit de código da missão:** `1854a62b0df336b58a86b3c2880d724a816c7fde` (`perf(editor-v6): retain grow-only hair mesh buffer`). Branch `Dev-V2`; após este commit, 10 commits à frente de `origin/Dev-V2`.

**Resultado segmentar mais recente:** 42,64 s ponta a ponta (9,23 s preparo + 33,41 s export) para 20 s de vídeo; baseline comparável 59,76 s (9,38 + 50,37). SSIM do vídeo resultante contra os baselines: All=1.000000. Ganho neste trecho, não prova ainda a meta de export integral ≤30 s.

**Loop incremental implementado:** runner de cabelo/controle usa 20 s e uma execução por padrão; `--start-frame=N`, `--duration-seconds=N`, `--full-timeline` e `--repeat=1..3` permitem escolher recortes e reservar repetição para gates. **Próxima ação prioritária:** ampliar para 40 s e perseguir ≤15 s, cobrindo outros personagens/transições antes de validar timeline integral.

---

# MISSÃO EDITOR V6+RESTO DO APP QUE TRABALHA COM ELE: REENGENHARIA PROFUNDA DO SISTEMA DE EXPORTAÇÃO E ANIMAÇÃO DE CABELO

## ## 1. SUA MISSÃO — LEIA COM ATENÇÃO

Você recebeu uma missão de engenharia avançada, investigação técnica, otimização extrema e possível reestruturação arquitetural.

\*\*Não quero ajustes superficiais. Não quero que você altere dois parâmetros, execute um teste simples e considere o trabalho concluído. Quero que você investigue o sistema profundamente, questione as decisões arquiteturais existentes, desenvolva hipóteses próprias, pesquise soluções modernas e implemente melhorias realmente significativas.\*\*

Você tem autonomia para pensar, pesquisar, experimentar, instalar ferramentas, desenvolver utilitários internos, substituir componentes, refatorar módulos e, se necessário, reconstruir partes inteiras do pipeline.

O objetivo não é preservar a arquitetura atual a qualquer custo.

\*\*O objetivo é encontrar a melhor maneira possível de produzir o mesmo resultado visual, com animações corretas, na menor quantidade de tempo possível.\*\*

Pense como um engenheiro de performance, especialista em computação gráfica, arquiteto de sistemas e pesquisador de novas soluções trabalhando juntos.

Não se limite ao que o aplicativo já faz. Explore também o que ele poderia fazer.

---

## ## 2. CONTEXTO E RESULTADOS ATUAIS

Atualmente, o aplicativo possui dois modos de exportação:

1. \*\*Exportação sem animação de cabelo.\*\*
2. \*\*Exportação com animação de cabelo ativada.\*\*

No projeto utilizado como referência, a exportação com animação de cabelo ativada levou:

\*\*1 minuto e 32 segundos (92 segundos).\*\*

## ### META OBRIGATÓRIA

Reduzir esse tempo para \*\*30 segundos ou menos\*\*.

Isso representa:

- Redução mínima de aproximadamente 67,4% do tempo atual.
- Aceleração de aproximadamente 3,07 vezes em relação ao resultado de referência.
- Preservação da qualidade visual e das funcionalidades do export.

Trate 30 segundos como um critério objetivo de sucesso, não apenas como uma intenção.

Não quero que você simplesmente diminua resolução, FPS, qualidade de renderização, duração ou complexidade visual para produzir números artificialmente melhores.

\*\*O objetivo é acelerar o processamento real, mantendo resultados visualmente equivalentes ou superiores.\*\*

O modo sem animação de cabelo também deve ser investigado, porque ele funciona como uma referência importantíssima para identificar o custo adicional introduzido pelo sistema de cabelo.

---

## ## 3. PROJETO AUTORIZADO PARA TESTES

\*\*TODOS OS TESTES DE EXPORTAÇÃO DEVEM SER REALIZADOS EXCLUSIVAMENTE NO PROJETO:\*\*

\*\*"Teste de Importação — Personagens do Pacote"\*\*

Esta restrição é absoluta.

Não utilize outros projetos como ambientes de teste, mesmo que pareçam mais simples, rápidos ou convenientes.

Você pode criar ferramentas, arquivos temporários, caches, instrumentação, benchmarks e recursos auxiliares dentro da pasta do projeto de desenvolvimento, mas os testes funcionais de exportação devem utilizar somente o projeto autorizado.

Preserve os dados originais e mantenha backups das partes que forem submetidas a alterações estruturais.

---

## ## 4. PROBLEMAS VISUAIS JÁ IDENTIFICADOS

Durante a exportação atual com animação de cabelo, observei problemas que indicam possíveis falhas estruturais.

### PROBLEMA A — ANIMAÇÃO DO CABELO EXECUTANDO DUAS VEZES OU REINICIANDO

Após um personagem terminar uma transição de pose, a animação do cabelo deveria apresentar um movimento natural e contínuo.

Entretanto, algumas vezes percebi que o cabelo parecia realizar seu balanço, e aproximadamente na metade do movimento a animação reiniciava ou sofria algum tipo de reset.

Visualmente, isso dava a impressão de que a reação do cabelo era acionada duas vezes, ou de que seu estado temporal era reinicializado antes de finalizar o movimento.

Investigue possíveis causas como:

- Acionamentos duplicados do evento de transição.
- Reinicializações indevidas da simulação.
- Falhas no controle do tempo ou dos frames.
- Interações conflitantes entre animação de pose e animação secundária.
- Interpolação inconsistente.
- Estados sendo recriados quando deveriam persistir.
- Problemas de sincronização entre renderização, física e timeline.
- Erros de cache ou reaproveitamento de estados.

Essas são hipóteses, não diagnósticos. Você deve descobrir a causa real por meio de análise do código, instrumentação e testes.

## ### PROBLEMA B — PERSONAGENS QUE NÃO ANIMAM O CABELO

Em outros momentos, determinados personagens mudam de pose, mas o cabelo simplesmente não apresenta a reação esperada.

Investigue:

- Condições que impedem o disparo da animação.
- Falhas no reconhecimento de transições.
- Inconsistências entre personagens ou rigs.
- Problemas na associação dos elementos de cabelo.
- Estados que ficam travados.
- Dependências incorretas entre componentes.
- Diferenças de comportamento entre preview e exportação.

Não quero remendos individuais para cada personagem.

\*\*Quero resolver a causa estrutural e garantir um comportamento consistente para todos os personagens compatíveis.\*\*

## ### PROBLEMA C — OUTRAS POSSÍVEIS ANOMALIAS

Os problemas anteriores são apenas os que consegui observar.

Sua investigação deve procurar proativamente outros defeitos, incluindo movimentos abruptos, saltos de posição, atrasos, ausência de reação, oscilações artificiais, diferenças entre frames, perda de continuidade e animações que reiniciam indevidamente.

Não presuma que aquilo que relatei representa a lista completa de defeitos.

---

## ## 5. PRIMEIRA ETAPA: ENTENDA O SISTEMA INTEIRO

Antes de propor mudanças importantes, mapeie como a exportação realmente funciona.

Analise o código e identifique:

- Como os personagens e suas poses são representados.
- Como as transições são calculadas.
- Como a animação de cabelo é gerada.
- Como cada frame é produzido.
- Como os frames são compostos.
- Como os dados são enviados ao encoder.
- Como o vídeo final é codificado e salvo.
- Quais operações utilizam CPU, GPU, memória, disco e processos externos.
- Quais tarefas são executadas sequencialmente.
- Quais tarefas poderiam ocorrer em paralelo.
- Quais cálculos são repetidos desnecessariamente.
- Quais estados poderiam ser reutilizados.
- Quais componentes introduzem sincronizações ou esperas.
- Qual é o custo real de ativar a animação de cabelo.

O sistema atual utiliza um mecanismo denominado \*\*Turbo 2x\*\*.

\*\*IMPORTANTE: Turbo 2x não é uma obrigação arquitetural.\*\*

Não presuma que ele representa a melhor solução.

Você pode aprimorá-lo, substituí-lo, desenvolver outro mecanismo, oferecer uma estratégia de exportação completamente diferente ou combinar várias abordagens.

A arquitetura existente é um ponto de partida, não uma limitação criativa.

---

## ## 6. PESQUISA EXTERNA EXTREMAMENTE PROFUNDA

Realize uma pesquisa técnica ampla e direcionada na internet.

Não se limite a uma biblioteca ou ao primeiro resultado encontrado.

Investigue soluções atuais e relevantes em:

- Repositórios open source, especialmente GitHub.
- Frameworks de renderização.
- Engines de animação 2D.
- Sistemas de simulação de cabelo e física secundária.
- Algoritmos de animação procedural.
- Técnicas de renderização offscreen e headless.
- Composição e processamento de frames.
- Aceleração GPU.
- Processamento paralelo e multithreading.
- Sistemas de cache e pré-computação.
- Pipelines assíncronos.
- FFmpeg e alternativas de codificação.
- Renderização por lotes.
- Sistemas de renderização em memória.
- Otimizações específicas da linguagem e das bibliotecas utilizadas pelo projeto.
- Técnicas modernas de profiling e benchmarking.
- Estratégias utilizadas por softwares de animação e vídeo para reduzir o custo de exportação.

Pesquise também abordagens menos convencionais.

Por exemplo: será que a animação do cabelo realmente precisa ser simulada integralmente para cada frame? Será que pode ser calculada analiticamente? Será que o sistema pode reaproveitar movimentos sem comprometer a aparência? Será que componentes atualmente dependentes da timeline podem ser desacoplados?

Questione o problema em vez de simplesmente otimizar a implementação atual.

\*\*Não quero pesquisa extensa apenas em quantidade de páginas. Quero pesquisa que gere hipóteses úteis, experimentos e decisões melhores.\*\*

Compare alternativas considerando velocidade, compatibilidade, complexidade, qualidade visual, manutenção e custo de integração.

---

## 7. CRIATIVIDADE TÉCNICA: PENSE ALÉM DAS OTIMIZAÇÕES CONVENCIONAIS

Esta é uma das partes mais importantes da missão.

Não se limite a:

- Diminuir delays.
- Trocar um parâmetro.
- Aumentar um número de threads.
- Mudar um preset de encoder.
- Ativar uma opção chamada turbo.

Essas mudanças podem fazer parte da solução, mas são insuficientes como estratégia de investigação.

Quero que você formule ideias próprias e considere alternativas como:

### A. Animação matemática ou procedural

Investigue substituir simulações custosas por modelos matemáticos leves, determinísticos e visualmente naturais.

Considere sistemas de molas amortecidas, funções de resposta temporal, interpolação analítica ou outras técnicas adequadas.

A ideia é verificar se podemos produzir um movimento de cabelo convincente sem precisar executar uma simulação pesada em todos os frames.

### B. Pré-cálculo inteligente

Analise a possibilidade de calcular antecipadamente somente as informações realmente necessárias para a animação.

Em vez de recalcular tudo durante a geração dos frames, investigue separar preparação de movimento e renderização.

Meça o custo total, incluindo o pré-cálculo.

### C. Reutilização inteligente de resultados

Verifique se existem frames, elementos, transformações, máscaras, poses, texturas, geometrias ou estados que possam ser reutilizados.

Não renderize novamente aquilo que não mudou, caso seja possível preservar a exatidão visual.

### D. Pipeline realmente paralelo

Investigue se preparação, animação, renderização, composição e codificação podem funcionar em pipeline, evitando que uma etapa fique esperando desnecessariamente pela outra.

Considere filas limitadas, buffers, workers e estratégias que impeçam gargalos de memória.

### E. Renderização orientada às mudanças

Verifique se a arquitetura atual recalcula toda a cena quando apenas uma pequena parte foi modificada.

Explore atualizações incrementais e invalidação inteligente de cache.

### F. Exportação desacoplada do sistema de preview

Investigue se o processo de exportação está preso a limitações de uma arquitetura pensada para exibição em tempo real.

Se estiver, considere um mecanismo específico para exportação, capaz de calcular qualquer frame diretamente a partir do tempo da timeline.

### G. Novas tecnologias e substituição de componentes

Caso exista uma alternativa comprovadamente superior, considere substituir mecanismos de renderização, codificação ou animação.

Não preserve uma biblioteca apenas porque ela já faz parte do aplicativo.

\*\*Essas ideias são pontos de partida, não uma lista fechada. Quero que você encontre possibilidades melhores do que as que estou sugerindo.\*\*

---

## ## 8. AUTONOMIA PARA CRIAR SUAS PRÓPRIAS FERRAMENTAS

Você tem autorização para desenvolver ferramentas auxiliares para melhorar sua capacidade de investigar e modificar o aplicativo.

Isso inclui, quando for útil:

- Ferramentas de profiling automatizado.
- Scripts de benchmarking.
- Comparadores de exportação.
- Analisadores de diferenças entre frames.
- Sistemas de medição por etapa.
- Testes automatizados de transições.
- Visualizadores de estados de animação.
- Ferramentas para detectar eventos duplicados.
- Instrumentação de CPU, GPU, memória e I/O.
- Scripts para executar e registrar experimentos.
- Utilitários para identificar gargalos automaticamente.

Se uma ferramenta própria permitir executar dezenas de experimentos com mais rapidez e precisão, desenvolva-a.

Se uma ferramenta existente for melhor, utilize-a.

\*\*Não perca horas construindo algo que poderia resolver com uma solução pronta, mas também não fique dependente de ferramentas inadequadas apenas porque já estão instaladas.\*\*

O objetivo é aumentar sua capacidade de investigação e desenvolvimento.

---

## ## 9. PERMISSÕES PARA ALTERAÇÕES

Você possui autorização para, dentro do escopo do projeto:

- Instalar dependências e bibliotecas.
- Baixar repositórios e ferramentas open source.
- Criar scripts e utilitários.
- Refatorar módulos.
- Modificar componentes arquiteturais.
- Substituir bibliotecas e pipelines.
- Criar implementações alternativas.
- Introduzir sistemas de cache.
- Utilizar novos mecanismos de aceleração.
- Alterar profundamente a implementação da animação.
- Desenvolver um novo exportador, se justificável.
- Eliminar componentes comprovadamente redundantes.

## \*\*RESTRIÇÃO DE INSTALAÇÃO:\*\*

Tudo que você baixar, instalar ou desenvolver como dependência ou ferramenta auxiliar deverá permanecer exclusivamente dentro da pasta do projeto de desenvolvimento.

Utilize ambientes isolados e caminhos locais. Não realize instalações globais nem altere configurações do sistema operacional fora dessa pasta.

Preserve a integridade dos dados, respeite as licenças das dependências e mantenha a possibilidade de reverter alterações importantes.

A autorização para mudanças profundas não significa autorização para destruir arquivos originais, comprometer outras funcionalidades ou eliminar comportamentos sem validação.

---

## 10. METODOLOGIA OBRIGATÓRIA: EXPERIMENTAÇÃO RÁPIDA, INTENSA E INTELIGENTE

Não quero um ciclo lento de investigação sem execução prática.

Quero uma abordagem experimental agressiva e orientada por evidências.

## ### FASE 1 — ESTABELECER A BASE REAL

Execute benchmarks do projeto autorizado com animação de cabelo ligada e desligada.

Registre:

- Tempo total do export.
- Tempo gasto em cada etapa importante.
- Número de frames.
- Resolução.
- FPS.
- Configurações de qualidade.
- Encoder utilizado.
- Consumo de CPU e GPU.
- Consumo de memória.
- Gargalos identificados.
- Diferenças de custo entre os dois modos.

Utilize as mesmas condições para comparações confiáveis.

O valor de 92 segundos é a referência inicial informada, mas você deve verificar o comportamento real do ambiente atual.

## ### FASE 2 — PERFILAR ANTES DE OTIMIZAR

Instrumente as partes relevantes do programa e descubra onde o tempo está sendo consumido.

Não conclua que o cabelo é o principal gargalo apenas porque ativá-lo aumenta o tempo total.

Pode existir uma interação estrutural entre animação, renderização e codificação.

Investigue essa possibilidade.

## ### FASE 3 — CRIAR HIPÓTESES DE ALTO IMPACTO

Classifique oportunidades pela combinação de:

1. Potencial de economia de tempo.
2. Custo de implementação.
3. Probabilidade de sucesso.
4. Risco para a qualidade.
5. Possibilidade de testar rapidamente.

Dê preferência a hipóteses com alto impacto e validação barata.

Não dedique grande esforço a micro-otimizações enquanto gargalos arquiteturais relevantes continuarem sem investigação.

## ### FASE 4 — TESTES CURTOS E FOCADOS

Para cada hipótese:

1. Defina exatamente o que pretende melhorar.
2. Escolha uma medição adequada.
3. Implemente a alteração ou um protótipo mínimo.
4. Execute um teste rápido.
5. Compare com o resultado anterior.
6. Verifique o impacto visual e funcional.
7. Mantenha, refine ou reverta a alteração.

Crie testes parciais, instrumentados ou de microbenchmark quando eles ajudarem a reduzir o tempo de investigação.

\*\*Porém, a aprovação final deve ocorrer em exportações completas do projeto autorizado.\*\*

Não confunda uma melhoria em um microbenchmark com uma melhoria comprovada no export final.

## ### FASE 5 — COMBINAR AS MELHORES SOLUÇÕES

Depois de identificar otimizações eficazes, investigue como combiná-las.

Uma melhoria de renderização pode viabilizar outra de animação. Um cache pode permitir outro tipo de paralelismo. Um novo modelo matemático pode eliminar a necessidade de determinado processamento.

Pense no sistema como um conjunto de componentes interdependentes.

Não avalie todas as otimizações exclusivamente de maneira isolada.

## ### FASE 6 — ITERAR ATÉ ATINGIR A META

Repita o ciclo de profiling, hipótese, implementação e validação.

Não encerre o processo simplesmente porque obteve uma melhoria de 10%, 20% ou 40%.

\*\*A meta é 30 segundos ou menos.\*\*

Se uma abordagem atingir um limite, procure outra.

Se a arquitetura atual demonstrar um limite estrutural, considere uma arquitetura diferente.

Não fique tentando indefinidamente pequenas variações de uma solução que já demonstrou não ser suficiente.

---

## ## 11. CORREÇÃO E REDESENHO DA ANIMAÇÃO DO CABELO

A correção funcional tem a mesma importância que a velocidade.

Quero que você investigue a possibilidade de a animação de cabelo estar mal acoplada à lógica de mudança de pose.

Considere separar claramente:

- O instante em que uma pose muda.
- O movimento principal do personagem.
- A reação secundária do cabelo.
- A evolução temporal dessa reação.
- A conclusão ou estabilização do movimento.
- A continuidade do estado durante outras transições.

O sistema ideal deve permitir que a animação seja calculada de maneira consistente, inclusive quando frames forem processados em ordem diferente, se a arquitetura de exportação exigir isso.

Avalie a viabilidade de uma implementação determinística, baseada no tempo da timeline e no histórico relevante de eventos, em vez de depender exclusivamente de estados mutáveis atualizados frame a frame.

Essa abordagem poderia, se tecnicamente adequada:

- Eliminar reinícios acidentais.
- Facilitar a renderização paralela.
- Permitir calcular frames específicos diretamente.
- Melhorar a consistência entre preview e export.
- Simplificar testes automatizados.
- Reduzir processamento desnecessário.

Não adote essa solução automaticamente. Compare-a com outras possibilidades e escolha a arquitetura mais adequada aos dados reais do projeto.

O resultado desejado é um cabelo que reaja de maneira natural às mudanças de pose, com movimento contínuo, sem disparos duplicados e sem personagens ficando parados indevidamente.

---

## ## 12. CRITÉRIOS DE QUALIDADE E REGRESSÃO

Toda melhoria de velocidade deve preservar os requisitos funcionais.

Verifique:

- Mesma duração de vídeo.
- Mesmo FPS.
- Mesma resolução.
- Mesmas poses e transições previstas.
- Ausência de frames perdidos ou duplicados indevidamente.
- Ausência de glitches visuais.
- Movimentos de cabelo consistentes.
- Continuidade temporal.
- Ausência de deformações inesperadas.
- Manutenção dos demais recursos do exportador.
- Compatibilidade dos arquivos finais.

Compare visualmente os exports, mas não utilize o vídeo antigo com defeitos como referência absoluta de comportamento.

A qualidade de referência deve preservar o resultado visual pretendido, corrigindo as falhas conhecidas.

Crie, quando possível, validações automáticas que identifiquem:

- Descontinuidades bruscas.
- Reinicializações de movimentos.
- Ausência de animação após uma transição esperada.
- Divergências de duração.
- Perda ou duplicação de frames.
- Alterações visuais não justificadas.

---

## ## 13. NÃO CAIA NAS ARMADILHAS COMUNS DE OTIMIZAÇÃO

Evite estes comportamentos:

\*\*1. Otimização cosmética:\*\* mudar alguns parâmetros sem demonstrar ganho expressivo.

\*\*2. Pesquisa passiva:\*\* consumir muita documentação sem gerar experimentos.

\*\*3. Apego à arquitetura atual:\*\* insistir em uma abordagem apenas porque ela já existe.

\*\*4. Generalizações sem evidências:\*\* presumir gargalos antes de medi-los.

\*\*5. Complexidade desnecessária:\*\* introduzir uma solução sofisticada quando uma abordagem simples resolveria melhor o problema.

\*\*6. Falsos ganhos:\*\* reduzir qualidade, ignorar fases do processamento, aproveitar caches exclusivos do teste sem contabilizá-los ou medir apenas uma etapa do export.

\*\*7. Correções locais frágeis:\*\* resolver um personagem ou uma pose sem eliminar a causa do defeito.

\*\*8. Testes insuficientes:\*\* validar somente a performance e ignorar a qualidade da animação.

\*\*9. Excesso de cautela arquitetural:\*\* evitar modificações profundas mesmo diante de evidências de que a estrutura atual é ineficiente.

\*\*10. Excesso de experimentação improdutiva:\*\* executar dezenas de testes quase idênticos sem aprender algo novo.

Quero decisões fundamentadas em medições, criatividade e raciocínio de engenharia.

---

## ## 14. BENCHMARKS E DOCUMENTAÇÃO DA EVOLUÇÃO

Mantenha um registro objetivo dos experimentos.

Para cada mudança relevante, documente:

| Informação | O que registrar | |---|---| | Hipótese | Qual problema você tentou resolver | | Alteração | O que foi implementado | | Tempo anterior | Resultado antes da alteração | | Tempo novo | Resultado após a alteração | | Ganho | Economia absoluta e percentual | | Qualidade | Impacto visual e funcional | | Decisão | Manter, refinar ou reverter | | Próximo passo | Hipótese mais promissora |

Registre também as configurações utilizadas e diferencie os tempos obtidos em testes parciais dos obtidos em exportações completas.

Sempre que possível, repita medições relevantes para distinguir ganhos reais de variações normais de execução.

Considere medições em condições de cache frio e quente quando isso afetar o resultado real para o usuário.

Não esconda experimentos malsucedidos. Eles também ajudam a entender o sistema.

---

## ## 15. RESULTADO FINAL ESPERADO

Quero que você entregue uma melhoria implementada e testada, não apenas um relatório com sugestões.

Ao final, apresente:

### A. Diagnóstico estrutural

Explique quais eram os gargalos reais e por que a implementação anterior era lenta.

### B. Diagnóstico dos defeitos de animação

Explique as causas confirmadas dos resets, movimentos duplicados, personagens sem reação e outros problemas encontrados.

### C. Modificações realizadas

Apresente as principais mudanças no código e na arquitetura, incluindo ferramentas e dependências introduzidas.

### D. Resultados objetivos

Mostre o tempo antes e depois, tanto no modo com animação de cabelo quanto no modo sem animação.

### E. Evidências de correção visual

Explique como verificou a continuidade e o comportamento da animação, preferencialmente com testes automatizados e análise de frames.

### F. Comparação das alternativas

Indique quais soluções foram experimentadas, quais funcionaram, quais foram descartadas e por quê.

### G. Estado da meta

Informe explicitamente se a exportação completa atingiu 30 segundos ou menos, preservando as condições de qualidade definidas.

Caso a meta não seja alcançada, não declare sucesso. Informe os resultados reais, os gargalos remanescentes e as alternativas mais promissoras.

---

## 16. PRINCÍPIO CENTRAL: PENSE NA SOLUÇÃO, NÃO APENAS NO CÓDIGO EXISTENTE

Quero reforçar algo.

\*\*Você não está aqui apenas para melhorar o que existe. Você está aqui para descobrir se existe uma forma fundamentalmente melhor de fazer a mesma coisa.\*\*

Talvez a solução esteja em um algoritmo mais eficiente.

Talvez esteja em eliminar cálculos desnecessários.

Talvez esteja em substituir uma simulação inteira por uma resposta matemática simples.

Talvez esteja em transformar um processo sequencial em um pipeline paralelo.

Talvez esteja em uma biblioteca que ainda não utilizamos.

Talvez esteja em uma abordagem completamente diferente, que você descubra durante a pesquisa.

Não sabemos antecipadamente.

É exatamente por isso que quero investigação, autonomia e experimentação.

Não confunda esforço com progresso. Dez mudanças aleatórias não são necessariamente melhores que uma descoberta arquitetural importante.

\*\*Procure as mudanças que alteram significativamente a relação entre custo computacional e qualidade final.\*\*

Você tem liberdade para inovar, inclusive contrariando decisões anteriores do projeto quando houver justificativa técnica.

---

## ## 17. ORDEM FINAL: EXECUTE, NÃO APENAS PLANEJE

A partir deste momento:

1. Inspecione o projeto e compreenda o pipeline.
2. Faça medições reais.
3. Pesquise soluções atuais e alternativas criativas.
4. Desenvolva ferramentas auxiliares quando elas acelerarem a investigação.
5. Corrija estruturalmente os problemas da animação de cabelo.
6. Implemente as otimizações mais promissoras.
7. Execute ciclos rápidos e rigorosos de experimentação.
8. Valide resultados visuais e funcionais.
9. Continue buscando melhorias significativas até atingir a meta ou demonstrar, com evidências, os limites encontrados.

\*\*NÃO PARE NA PRIMEIRA MELHORIA. NÃO SE LIMITE AO TURBO 2X. NÃO PRESUMA QUE A ARQUITETURA ATUAL É A MELHOR.\*\*

Se chegar a um obstáculo, investigue caminhos alternativos.

Se identificar uma solução inovadora, teste-a.

Se a implementação existente estiver estruturalmente errada, reconstrua o componente necessário de maneira controlada.

Não peça confirmação para decisões técnicas rotineiras já autorizadas neste escopo. Use seu julgamento, documente decisões importantes e preserve a capacidade de reversão.

Sua responsabilidade é produzir a melhor implementação possível, não apenas executar instruções mecanicamente.

\*\*META PRINCIPAL: EXPORTAÇÃO COM ANIMAÇÃO DE CABELO EM NO MÁXIMO 30 SEGUNDOS, NO PROJETO "Teste de Importação — Personagens do Pacote", SEM SACRIFICAR A QUALIDADE, E COM OS DEFEITOS DE ANIMAÇÃO CORRIGIDOS.\*\*

\*\*MENTALIDADE EXIGIDA: PESQUISAR → QUESTIONAR → MEDIR → INVENTAR → IMPLEMENTAR → TESTAR → COMPARAR → REFINAR.\*\*

Comece pela análise do sistema real e avance para execução prática. Não transforme esta missão em um simples planejamento teórico. # 18. SISTEMA AUTÔNOMO DE EXECUÇÃO, PLANEJAMENTO DINÂMICO E ATUALIZAÇÃO CONTÍNUA DO MARKDOWN

## ## REGRA FUNDAMENTAL

\*\*ESTE ARQUIVO MARKDOWN NÃO É APENAS UM PROMPT. ELE DEVE FUNCIONAR COMO SEU PLANO DE EXECUÇÃO VIVO, REGISTRO DE DESCOBERTAS, GERENCIADOR DE TAREFAS E HISTÓRICO DE ENGENHARIA.\*\*

Você é responsável por criar, organizar, executar, modificar, expandir e manter esse documento atualizado durante todo o desenvolvimento.

Não espere que eu organize as tarefas manualmente.

Não espere que eu peça para adicionar novas etapas.

Não espere que eu diga qual deve ser sua próxima atividade.

\*\*Você tem autonomia total sobre o planejamento técnico, a priorização e a organização das tarefas dentro do escopo autorizado.\*\*

O Markdown deve refletir o estado real da implementação, e não somente suas intenções.

---

## ## 18.1. ETAPA 0 — PREPARAÇÃO AUTÔNOMA DA MISSÃO

Antes de iniciar as demais fases, crie no próprio Markdown a:

# ETAPA 0 — RECONHECIMENTO, PREPARAÇÃO E ESTRUTURAÇÃO DA MISSÃO

Essa etapa deve incluir tarefas como:

- \[ \] Inspecionar a estrutura completa do projeto.
- \[ \] Identificar a arquitetura e as tecnologias utilizadas.
- \[ \] Localizar os módulos de exportação, animação e renderização.
- \[ \] Identificar o funcionamento atual do Turbo 2x.
- \[ \] Mapear os caminhos de execução dos dois modos de exportação.
- \[ \] Verificar ferramentas e dependências disponíveis.
- \[ \] Preparar instrumentação e ambiente isolado de benchmarks.
- \[ \] Estabelecer um baseline confiável de performance.
- \[ \] Criar um mecanismo para registrar experimentos.
- \[ \] Identificar riscos e preparar formas de reversão.
- \[ \] Criar e organizar as próximas etapas de desenvolvimento.

Essas tarefas são apenas um ponto de partida.

\*\*Você deve adicionar, remover, dividir, combinar ou reorganizar tarefas conforme descobrir as necessidades reais do projeto.\*\*

A Etapa 0 não precisa permanecer limitada à preparação inicial. Se posteriormente descobrir que precisa de uma nova ferramenta, inspeção estrutural ou benchmark fundamental, poderá adicionar uma tarefa à Etapa 0 mesmo que esteja trabalhando na Etapa 5, 8 ou 12.

---

## ## 18.2. O MARKDOWN É UM DOCUMENTO VIVO

Você deve modificar continuamente o próprio arquivo de planejamento.

Sempre que:

- Descobrir um novo problema.
- Identificar um gargalo.
- Encontrar uma oportunidade de otimização.
- Desenvolver uma hipótese.
- Criar uma ferramenta.
- Implementar uma melhoria.
- Executar um benchmark.
- Corrigir um bug.
- Descartar uma abordagem.
- Alterar uma decisão arquitetural.
- Criar um commit.
- Identificar uma dependência entre tarefas.
- Descobrir que uma etapa precisa ser reaberta.

## \*\*ATUALIZE O MARKDOWN.\*\*

Não deixe informações importantes existirem apenas na sua memória ou no histórico da conversa.

O documento deve permitir que outra IA ou outro desenvolvedor compreenda exatamente o que já foi feito, o que está funcionando, o que falhou e qual deve ser o próximo passo.

---

## ## 18.3. AUTONOMIA TOTAL ENTRE ETAPAS

## \*\*AS ETAPAS NÃO SÃO UMA SEQUÊNCIA RÍGIDA.\*\*

Você tem liberdade para:

1. Criar novas etapas em qualquer momento.
2. Adicionar tarefas a etapas antigas.
3. Voltar para etapas anteriores.
4. Executar tarefas de etapas diferentes quando fizer sentido.
5. Alterar a ordem de execução.
6. Dividir tarefas complexas em subtarefas.
7. Unificar tarefas redundantes.
8. Reabrir tarefas concluídas quando surgirem novas evidências.
9. Cancelar tarefas que perderam relevância.
10. Criar etapas experimentais temporárias.
11. Reestruturar todo o planejamento, se necessário.

## ### EXEMPLO

Imagine que você esteja na Etapa 5, otimizando o pipeline de renderização.

Durante um benchmark, descobre que seria útil desenvolver um analisador de eventos duplicados na animação.

Você poderá:

- Voltar à Etapa 0.
- Adicionar a tarefa \`E0-T014 — Desenvolver analisador de eventos duplicados\`.
- Registrar por que ela foi criada.
- Executá-la.
- Validar seu funcionamento.
- Registrar o commit.
- Marcar a tarefa como concluída.
- Retomar a Etapa 5.

\*\*Não existe obrigação de concluir uma etapa inteira antes de avançar para outra.\*\*

A prioridade é resolver o problema da maneira mais inteligente, não obedecer artificialmente à numeração das fases.

Entretanto, dependências técnicas reais devem ser respeitadas. Não execute uma atividade que dependa de outra ainda não concluída sem uma justificativa apropriada.

---

## ## 18.4. FORMATO OBRIGATÓRIO DAS TAREFAS

Cada tarefa deve possuir um identificador único e estável.

Utilize uma estrutura semelhante a:

\`E0-T001\` — Etapa 0, Tarefa 001.

\`E3-T007\` — Etapa 3, Tarefa 007.

\`E5-T012\` — Etapa 5, Tarefa 012.

Não reutilize identificadores de tarefas removidas ou canceladas.

## ### MODELO DE TAREFA

### \[ \] E3-T007 — Otimizar cálculo das transformações do cabelo

\*\*Status:\*\* Pendente \*\*Prioridade:\*\* Alta \*\*Categoria:\*\* Performance / Animação \*\*Hipótese:\*\* Existem transformações recalculadas desnecessariamente a cada frame. \*\*Objetivo:\*\* Reduzir o custo de processamento sem alterar o comportamento visual. \*\*Dependências:\*\* E0-T004 \*\*Critério de conclusão:\*\* Implementação validada por benchmark e teste visual. \*\*Commits:\*\* Nenhum \*\*Resultado:\*\* Aguardando execução.

Ao iniciar:

\`### \[\~\] E3-T007 — Otimizar cálculo das transformações do cabelo\`

Ao concluir:

\`### \[x\] E3-T007 — Otimizar cálculo das transformações do cabelo\`

\*\*Status:\*\* Concluída \*\*O que foi feito:\*\* Descrição concreta das alterações. \*\*Arquivos modificados:\*\* Caminhos relevantes. \*\*Teste realizado:\*\* Comando ou procedimento executado. \*\*Resultado anterior:\*\* Tempo medido antes. \*\*Resultado novo:\*\* Tempo medido depois. \*\*Ganho observado:\*\* Diferença absoluta e percentual. \*\*Validação visual:\*\* Aprovada/reprovada, com evidências. \*\*Commit:\*\* Hash real do commit. \*\*Observações:\*\* Descobertas ou limitações. \*\*Novas tarefas geradas:\*\* IDs das tarefas relacionadas.

Se uma tarefa for bloqueada, cancelada ou falhar, registre esse estado explicitamente.

Nunca marque uma tarefa como concluída apenas por ter escrito código. Ela só estará concluída quando satisfizer seus critérios de aceitação.

---

## ## 18.5. STATUS PADRONIZADOS

Utilize os seguintes estados:

- \`\[ \]\` Pendente.
- \`\[\~\]\` Em execução.
- \`\[x\]\` Concluída e validada.
- \`\[!\]\` Bloqueada.
- \`\[-\]\` Cancelada ou substituída.

Tarefas que falharem devem manter evidências do resultado e indicar claramente se serão reabertas, reformuladas ou abandonadas.

\*\*Nunca invente resultados de testes, comandos executados ou hashes de commits.\*\*

---

## ## 18.6. SISTEMA DE COMMITS E RASTREABILIDADE

Sempre que concluir uma alteração significativa e validada, registre-a adequadamente no Git.

Prefira commits pequenos, coerentes e reversíveis.

Sugestões de formato:

\`perf(export): reduzir custo da composição de frames\`

\`fix(hair): eliminar reinicialização duplicada durante transições\`

\`refactor(render): separar preparação e renderização\`

\`test(export): adicionar benchmark automatizado\`

\`tool(profiling): criar analisador de gargalos\`

Cada tarefa concluída deve indicar os commits relacionados.

Um commit pode atender a várias tarefas, e uma tarefa pode exigir múltiplos commits.

Se não houver commit, registre o motivo.

Antes de modificar arquivos, verifique o estado do repositório. Preserve alterações preexistentes de terceiros e não execute resets destrutivos.

Não crie commits vazios apenas para preencher o documento.

---

## ## 18.7. PAINEL DE CONTROLE NO INÍCIO DO MARKDOWN

Mantenha, próximo ao início do arquivo, um painel resumido e atualizado.

## ### PAINEL DA MISSÃO

\*\*Objetivo:\*\* Export com cabelo em até 30 segundos.

\*\*Baseline informado:\*\* 92 segundos.

\*\*Melhor resultado validado:\*\* Ainda não medido.

\*\*Resultado atual:\*\* Ainda não medido.

\*\*Export sem cabelo:\*\* Ainda não medido.

\*\*Estado da qualidade visual:\*\* Pendente de validação.

\*\*Etapa principal atual:\*\* Etapa 0.

\*\*Tarefa em execução:\*\* Nenhuma.

\*\*Tarefas concluídas:\*\* 0.

\*\*Tarefas pendentes:\*\* A determinar.

\*\*Último commit:\*\* Nenhum registrado.

\*\*Principal gargalo conhecido:\*\* Ainda não confirmado.

\*\*Próxima ação prioritária:\*\* Inspecionar a arquitetura.

Atualize esse painel conforme o desenvolvimento avança.

O objetivo é que qualquer pessoa consiga abrir o Markdown e entender imediatamente a situação da missão.

Não apresente números estimados como se fossem resultados medidos.

---

## ## 18.8. BACKLOG GLOBAL DE DESCOBERTAS E IDEIAS

Crie uma seção permanente chamada:

## # BACKLOG DE IDEIAS, HIPÓTESES E OPORTUNIDADES

Utilize-a para registrar ideias que surgirem durante a investigação, mesmo quando ainda não forem prioridade.

Para cada ideia, registre:

- Identificador.
- Descrição.
- Problema que poderia resolver.
- Potencial estimado de impacto.
- Custo estimado de implementação.
- Evidências existentes.
- Experimento mais barato para validá-la.
- Decisão atual.

\*\*Não descarte uma boa ideia apenas porque ela não pertence à etapa atual.\*\*

Quando uma ideia se tornar relevante, transforme-a em tarefa formal e mantenha o vínculo com sua origem.

Evite que o backlog cresça indefinidamente sem triagem. Revise, consolide e descarte ideias quando houver evidências suficientes.

---

## ## 18.9. SISTEMA DE DESCOBERTAS QUE GERAM NOVAS TAREFAS

Toda descoberta importante deve responder:

1. O que foi descoberto?
2. Qual evidência sustenta essa descoberta?
3. Que parte do sistema é afetada?
4. Isso altera nossas prioridades?
5. Precisamos criar, modificar ou reabrir alguma tarefa?
6. Existe algum experimento rápido capaz de esclarecer o problema?

Se descobrir que um gargalo presumido não existe, atualize o planejamento.

Se descobrir outro gargalo mais importante, repriorize as tarefas.

Se perceber que uma melhoria depende de uma reestruturação ainda não prevista, crie as tarefas necessárias.

\*\*O planejamento deve se adaptar à realidade observada. A realidade não deve ser forçada a seguir o planejamento original.\*\*

---

## ## 18.10. REGISTRO DE EXPERIMENTOS

Crie uma seção ou arquivo Markdown complementar para os experimentos, vinculada ao planejamento principal.

Cada experimento deverá possuir:

- ID único.
- Data.
- Hipótese.
- Configuração utilizada.
- Projeto de teste.
- Versão do código ou commit.
- Comando executado.
- Resultado.
- Comparação com baseline.
- Conclusão.
- Próxima decisão.

Diferencie claramente:

\*\*Microbenchmark:\*\* mede uma operação específica.

\*\*Teste parcial:\*\* avalia uma parte do pipeline.

\*\*Export completo:\*\* mede o processo integral do projeto autorizado.

Somente o export completo, preservando as condições de qualidade, pode comprovar o cumprimento da meta de 30 segundos.

Guarde evidências e logs relevantes em diretórios organizados dentro da pasta do projeto, sem poluir o repositório com arquivos temporários desnecessários.

---

## ## 18.11. MEMÓRIA TÉCNICA E CONTINUIDADE ENTRE SESSÕES

Organize o Markdown para permitir retomada imediata do trabalho, inclusive quando o contexto da IA for reiniciado ou outra IA assumir a execução.

Mantenha uma seção chamada:

## # ESTADO ATUAL E INSTRUÇÕES DE RETOMADA

Ela deverá conter:

\*\*Última atividade executada:\*\* O que foi efetivamente realizado.

\*\*Alterações ainda não validadas:\*\* Quais modificações precisam de teste.

\*\*Tarefa ativa:\*\* ID e descrição.

\*\*Próxima ação concreta:\*\* O próximo comando, investigação ou implementação.

\*\*Decisões arquiteturais importantes:\*\* Resumo e referências.

\*\*Problemas ainda abertos:\*\* Lista objetiva.

\*\*Experimentos promissores:\*\* IDs dos testes.

\*\*Último estado conhecido do Git:\*\* Branch, commit e alterações pendentes.

\*\*Riscos relevantes:\*\* Questões que exigem atenção antes de continuar.

Ao retomar o trabalho, leia essa seção e confronte-a com o estado real do código e do Git.

Não presuma que o Markdown está correto caso os arquivos tenham sido alterados externamente.

Atualize as divergências antes de prosseguir.

---

## ## 18.12. ORGANIZAÇÃO DO PROJETO

Você pode criar uma estrutura semelhante a:

\`\`\`text projeto/ ├── PLANO\_OTIMIZACAO.md ├── docs/ │   ├── arquitetura/ │   ├── descobertas/ │   ├── benchmarks/ │   ├── experimentos/ │   └── decisoes/ ├── tools/ │   ├── profiling/ │   ├── benchmarking/ │   └── validation/ └── ...arquivos originais do aplicativo \`\`\`

Essa estrutura é apenas uma sugestão.

Você possui autonomia para adaptar os nomes, diretórios e organização ao projeto real.

\*\*Evite criar burocracia documental desnecessária.\*\*

O Markdown principal deve continuar sendo a fonte central de verdade, com links para documentos auxiliares quando necessário.

Não duplique grandes quantidades de informação em vários arquivos.

---

## ## 18.13. POLÍTICA DE ATUALIZAÇÃO CONTÍNUA

Durante a execução, siga este ciclo:

## \*\*ANTES DE UMA TAREFA:\*\*

- Verifique o painel e as prioridades.
- Confirme o estado real do Git.
- Identifique dependências.
- Registre o início da tarefa.
- Defina o critério de conclusão.

## \*\*DURANTE A TAREFA:\*\*

- Execute a investigação ou implementação.
- Registre descobertas relevantes.
- Crie novas tarefas quando necessário.
- Atualize hipóteses e decisões.
- Não interrompa o desenvolvimento para registrar detalhes irrelevantes.

## \*\*APÓS A TAREFA:\*\*

- Execute os testes apropriados.
- Compare resultados.
- Valide qualidade e funcionalidades.
- Registre arquivos modificados.
- Crie o commit quando apropriado.
- Atualize o status.
- Atualize o painel.
- Selecione a próxima ação mais valiosa.

\*\*A documentação deve acompanhar a execução, não substituí-la.\*\*

---

## ## 18.14. GESTÃO INTELIGENTE DE PRIORIDADES

Não utilize apenas a ordem numérica das etapas para decidir o próximo trabalho.

Avalie constantemente:

- Impacto potencial na meta de 30 segundos.
- Gravidade dos bugs identificados.
- Custo de implementação.
- Probabilidade de sucesso.
- Risco de regressão.
- Dependências técnicas.
- Tempo necessário para obter evidências.
- Oportunidade de desbloquear outras otimizações.

Se estiver executando uma tarefa de baixo impacto e descobrir uma oportunidade claramente superior, poderá interromper a atividade atual de maneira segura, registrar seu estado e priorizar a nova hipótese.

Entretanto, evite alternar compulsivamente entre tarefas sem finalizar experimentos úteis.

\*\*Autonomia não significa desorganização. Significa capacidade de tomar decisões melhores conforme surgem novas informações.\*\*

---

## ## 18.15. CRITÉRIO DE CONCLUSÃO DA MISSÃO

A missão não deve ser considerada concluída apenas porque todas as tarefas inicialmente planejadas foram marcadas.

O planejamento existe para alcançar resultados, não o contrário.

A conclusão técnica exige:

- Export completo com animação de cabelo em até 30 segundos, medido em condições representativas.
- Preservação dos parâmetros de qualidade.
- Correção validada dos problemas de animação identificados.
- Ausência de regressões críticas conhecidas.
- Resultado documentado.
- Código organizado e rastreável.
- Testes e evidências registrados.
- Estado final do Git identificado.

Se o objetivo não for alcançado, registre claramente o desempenho atingido e as limitações restantes, sem apresentar a missão como concluída.

---

## ## 18.16. INSTRUÇÃO DE EXECUÇÃO PERMANENTE

\*\*A PARTIR DE AGORA, VOCÊ DEVE AGIR COMO RESPONSÁVEL TÉCNICO PELA MISSÃO E PELO PRÓPRIO PLANEJAMENTO.\*\*

Não espere receber uma lista perfeita de tarefas.

Crie-a.

Não espere que alguém identifique todos os problemas.

Investigue-os.

Não espere autorização adicional para reorganizar fases e prioridades dentro do escopo permitido.

Reorganize-as quando houver motivo.

Não permaneça preso a uma etapa se outra atividade oferecer maior valor.

Não deixe o Markdown desatualizado.

Não confunda tarefas marcadas com progresso real.

\*\*LEIA → PLANEJE → EXECUTE → MEÇA → DOCUMENTE → REGISTRE COMMIT → REPRIORIZE → CONTINUE.\*\*

Sua primeira ação deve ser criar a Etapa 0, inicializar o painel da missão e estruturar o backlog.

\*\*Sua segunda ação deve ser começar a executar as tarefas reais da Etapa 0, sem interromper o trabalho depois de produzir o planejamento.\*\*

A partir daí, mantenha um ciclo contínuo de execução, aprendizado e atualização do Markdown.

Você tem liberdade para criar a Etapa 10 antes de concluir a Etapa 2, voltar à Etapa 0 durante a Etapa 7, reabrir uma tarefa antiga ou reconstruir parte do planejamento.

\*\*O ÚNICO COMPROMISSO FIXO É COM A QUALIDADE, A SEGURANÇA DOS DADOS, A RESTRIÇÃO DO PROJETO DE TESTES E A META DE PERFORMANCE.\*\*

\*\*O PLANO SERVE À MISSÃO. A MISSÃO NÃO SERVE AO PLANO.\*\*  # 19. PROTOCOLO DE ENGENHARIA EXPERIMENTAL EXTREMA — ENCONTRE SOLUÇÕES QUE AINDA NÃO FORAM CONSIDERADAS

## 19.1. NÃO CONFUNDA OTIMIZAÇÃO COM MELHORAR O CÓDIGO EXISTENTE

Existe uma diferença fundamental entre:

\*\*Pergunta limitada:\*\* Como tornar este código mais rápido?

\*\*Pergunta correta:\*\* Qual é a maneira computacionalmente mais eficiente de obter exatamente o resultado visual desejado?

A segunda pergunta deve orientar toda a investigação.

Antes de otimizar uma operação, questione:

- Essa operação realmente precisa existir?
- Precisamos executá-la em todos os frames?
- Precisamos calcular tudo novamente?
- Poderíamos calcular o resultado diretamente?
- Poderíamos evitar produzir dados intermediários?
- Existe uma representação de dados muito mais barata?
- Um cálculo realizado uma vez poderia substituir milhares de cálculos?
- Precisamos simular a animação, ou podemos determinar matematicamente seu estado em qualquer instante?
- Estamos usando o hardware da maneira mais eficiente?
- O próprio formato de organização do pipeline está criando o problema?

\*\*ELIMINAR UMA OPERAÇÃO DESNECESSÁRIA É POTENCIALMENTE MELHOR DO QUE EXECUTÁ-LA MAIS RÁPIDO.\*\*

Investigue oportunidades de simplificação algorítmica antes de recorrer indiscriminadamente a mais processamento.

---

## ## 19.2. MAPA DE GARGALOS E CAMINHO CRÍTICO

Crie uma representação do pipeline real:

\*\*Preparação → Animação → Renderização → Composição → Transferência de dados → Codificação → Finalização\*\*

Essa sequência é apenas ilustrativa. Descubra a estrutura verdadeira do aplicativo.

Instrumente o pipeline para descobrir:

- Tempo total de cada operação.
- Operações repetidas por frame.
- Operações que bloqueiam outras.
- Sincronizações desnecessárias.
- Tempo de espera de workers.
- Cópias de memória.
- Transferências CPU/GPU.
- Gargalos de alocação e coleta de lixo.
- Operações que poderiam ser sobrepostas.
- Componentes que já estão no limite do hardware.

\*\*Não some ingenuamente tempos de operações que ocorrem em paralelo.\*\*

Identifique o caminho crítico que determina a duração real da exportação.

Utilize profiling, rastreamento de eventos, análise de CPU/GPU e benchmarks direcionados.

Crie tarefas automaticamente a partir dos gargalos identificados.

---

## ## 19.3. ORÇAMENTO DE PERFORMANCE: 30 SEGUNDOS

O objetivo não é simplesmente executar operações mais rapidamente.

É fazer o pipeline inteiro caber dentro de um orçamento máximo de 30 segundos.

Crie uma tabela dinâmica:

| Componente | Tempo atual | Meta sugerida | Melhor tempo validado | |---|---|---|---| | Preparação | A medir | A definir | A medir | | Animação | A medir | A definir | A medir | | Renderização | A medir | A definir | A medir | | Composição | A medir | A definir | A medir | | Codificação | A medir | A definir | A medir | | Finalização | A medir | A definir | A medir | | Export completo | 92s informados | ≤30s | A medir |

Os orçamentos individuais devem ser definidos com base no perfil real do sistema e considerar operações simultâneas.

Calcule também o limite teórico de ganhos das otimizações propostas, utilizando a Lei de Amdahl ou outros modelos adequados quando aplicáveis.

Se determinada operação representa apenas 2% do tempo total, não dedique horas tentando acelerá-la enquanto um gargalo de 60% permanece intacto.

\*\*ATAQUE PRIMEIRO AS LIMITAÇÕES QUE REALMENTE IMPEDEM ATINGIR OS 30 SEGUNDOS.\*\*

---

## 19.4. EXPERIMENTOS COMPETITIVOS E ARQUITETURAS ALTERNATIVAS

Não trabalhe obrigatoriamente com uma única ideia de implementação.

Quando identificar um problema arquitetural importante, considere múltiplas soluções concorrentes.

Exemplo para a animação de cabelo:

\*\*Alternativa A:\*\* Otimizar o sistema existente.

\*\*Alternativa B:\*\* Substituir a simulação por um sistema matemático determinístico.

\*\*Alternativa C:\*\* Pré-calcular curvas de movimento e consultá-las durante o export.

\*\*Alternativa D:\*\* Criar um mecanismo híbrido que utilize técnicas diferentes conforme o tipo de movimento.

\*\*Alternativa E:\*\* Uma abordagem própria descoberta durante a investigação.

Essas alternativas não são obrigatórias nem exaustivas.

Teste inicialmente as hipóteses de modo econômico, preferencialmente com protótipos isolados e benchmarks pequenos.

Compare:

- Velocidade.
- Qualidade visual.
- Consumo de memória.
- Complexidade arquitetural.
- Estabilidade.
- Facilidade de manutenção.
- Compatibilidade com o pipeline.

\*\*NÃO ESCOLHA UMA SOLUÇÃO APENAS PORQUE FOI A PRIMEIRA QUE FUNCIONOU.\*\*

Quando uma alternativa demonstrar vantagem relevante, investigue sua viabilidade prática.

Não mantenha várias arquiteturas experimentais no produto final sem uma justificativa técnica.

---

## ## 19.5. AUDITORIA ADVERSARIAL DAS PRÓPRIAS SOLUÇÕES

Depois de implementar uma otimização importante, realize uma revisão crítica independente da hipótese original.

Assuma temporariamente o papel de um engenheiro tentando demonstrar que sua solução está errada.

Pergunte:

1. O ganho é real ou consequência do cache?
2. O benchmark está medindo o processamento completo?
3. Algum trabalho foi apenas deslocado para outra etapa?
4. O resultado depende de um estado específico do projeto?
5. A implementação introduziu inconsistências temporais?
6. O algoritmo falha quando existem várias transições próximas?
7. A solução piora outros cenários de exportação?
8. O consumo de memória aumentou excessivamente?
9. Existe uma abordagem mais simples?
10. O ganho permanece quando combinado com outras otimizações?

Não aceite um resultado apenas porque parece promissor.

\*\*TENTE REFUTAR SUA PRÓPRIA CONCLUSÃO ANTES DE CONSIDERÁ-LA VALIDADA.\*\*

---

## ## 19.6. TESTES VISUAIS AUTOMATIZADOS E ANÁLISE TEMPORAL

Desenvolva ferramentas para investigar visualmente o export e detectar problemas que talvez não sejam percebidos em observações rápidas.

Considere:

- Comparação entre frames.
- Análise de continuidade temporal.
- Identificação de movimentos que reiniciam abruptamente.
- Medição de deslocamento do cabelo após transições.
- Detecção de movimentos duplicados.
- Detecção de ausência de reação.
- Comparação de curvas de movimento.
- Identificação de possíveis frames congelados.
- Verificação de sincronização entre poses e animação secundária.

Crie, quando útil, uma visualização das curvas de posição, velocidade ou deslocamento ao longo do tempo.

Isso pode ajudar a identificar resets, oscilações duplicadas e interrupções prematuras.

Use a saída antiga para localizar defeitos, mas não para exigir a reprodução desses defeitos.

\*\*O sistema novo deve ser comparado com o comportamento visual correto esperado, não com erros existentes.\*\*

Lembre-se de que métricas automáticas podem gerar falsos positivos; complemente-as com inspeção visual.

Todos os testes funcionais devem respeitar o projeto autorizado.

---

## ## 19.7. EXPERIMENTOS DE CAUSA E EFEITO

Quando possível, desenvolva maneiras de desativar temporariamente partes do pipeline para descobrir quanto elas realmente custam.

Exemplos:

- Medir renderização sem codificação final, somente como diagnóstico.
- Medir codificação utilizando frames previamente produzidos.
- Comparar diferentes estratégias de transferência de dados.
- Avaliar o custo da animação separadamente da composição.
- Investigar a diferença entre cálculo de movimento e atualização visual.
- Medir operações com e sem reutilização de recursos.
- Verificar se existem múltiplas renderizações desnecessárias do mesmo estado.

Esses experimentos são diagnósticos, não substituem o teste final.

\*\*A exportação completa com todos os recursos ativos continua sendo a única evidência válida de cumprimento da meta.\*\*

---

## ## 19.8. PROTOCOLO DE REPRODUTIBILIDADE

Não permita que uma melhoria pareça funcionar em uma medição e desapareça na próxima.

Registre:

- Hash do código.
- Configurações do export.
- Quantidade de frames.
- Resolução e FPS.
- Configuração de animação.
- Encoder.
- Perfil de hardware.
- Versões de dependências relevantes.
- Condições de cache.
- Tempos de execução.
- Variações entre medições.

Diferencie tempo de preparação, tempo de geração e tempo de finalização.

Meça o período desde o acionamento efetivo da exportação até a existência de um arquivo final íntegro e utilizável.

Não exclua do tempo processos necessários ao funcionamento real.

Se a preparação gerar caches reutilizáveis, documente separadamente o custo do primeiro export e dos posteriores.

Não utilize um benchmark de cache quente para prometer um resultado que não é reproduzível no uso normal.

---

## ## 19.9. SISTEMA AUTOMÁTICO DE DECISÕES

Após cada experimento relevante, atribua um resultado:

\*\*ADOTAR:\*\* ganho comprovado e qualidade preservada.

\*\*REFINAR:\*\* potencial relevante, mas resultado ainda insuficiente.

\*\*INVESTIGAR:\*\* resultado inconclusivo.

\*\*REVERTER:\*\* regressão, risco excessivo ou perda visual.

\*\*DESCARTAR:\*\* hipótese refutada ou benefício incompatível com seu custo.

Registre os motivos.

As tarefas futuras devem ser geradas e priorizadas a partir dessas decisões.

Não continue tentando otimizar indefinidamente uma abordagem que demonstrou ser pouco promissora.

---

## ## 19.10. REVERSIBILIDADE E RAMIFICAÇÕES EXPERIMENTAIS

Para modificações arquiteturais importantes, utilize Git e mecanismos adequados para manter os experimentos isolados e reversíveis.

Você pode utilizar branches, commits ou worktrees quando isso simplificar comparações.

Preserve o estado funcional conhecido.

Não misture várias alterações não relacionadas em um único experimento se isso impedir identificar qual delas provocou ganho ou regressão.

Após validar uma arquitetura superior, integre suas melhorias de maneira controlada.

Não deixe protótipos descartados interferindo no funcionamento normal.

---

## ## 19.11. PESQUISA COM RESULTADO PRÁTICO

Toda pesquisa externa relevante deve produzir ao menos uma das seguintes saídas:

- Uma hipótese verificável.
- Um algoritmo potencialmente melhor.
- Uma ferramenta útil.
- Uma biblioteca candidata.
- Uma alteração arquitetural justificável.
- Um experimento para validar uma ideia.
- Evidências que permitam descartar um caminho.

Registre links e versões das fontes mais importantes.

Evite transformar pesquisa em acumulação de conteúdo sem utilidade prática.

\*\*O objetivo não é demonstrar quanto foi pesquisado, e sim quanto conhecimento útil foi convertido em decisões melhores.\*\*

---

## 19.12. SISTEMA DE AGENTES ESPECIALISTAS, QUANDO DISPONÍVEL

Caso o ambiente disponibilize subagentes ou mecanismos reais de delegação, considere dividir investigações independentes entre especialistas.

Possíveis responsabilidades:

\*\*Especialista em performance:\*\* Profiling, CPU/GPU, memória e gargalos.

\*\*Especialista em animação:\*\* Física secundária, comportamento temporal e determinismo.

\*\*Especialista em arquitetura:\*\* Pipeline, cache, paralelismo e substituição de componentes.

\*\*Especialista em pesquisa:\*\* Bibliotecas, algoritmos e implementações externas.

\*\*Especialista em validação:\*\* Benchmarks, análise visual e regressões.

Cada especialista deve devolver resultados concretos e rastreáveis.

Não crie agentes fictícios nem alegue paralelismo quando a ferramenta não oferecer essa capacidade.

Evite alterações simultâneas conflitantes nos mesmos arquivos.

A coordenação principal é responsável por consolidar descobertas, atualizar o Markdown e decidir quais soluções integrar.

---

## ## 19.13. DESCOBERTA DE OPORTUNIDADES NÃO SOLICITADAS

Você não está limitado aos problemas explicitamente descritos pelo usuário.

Se descobrir uma ineficiência significativa que possa ser corrigida com segurança, registre-a e avalie sua prioridade.

Isso inclui melhorias em:

- Estruturas de dados.
- Organização de eventos.
- Representação de poses.
- Reutilização de transformações.
- Gerenciamento de memória.
- Fluxo de frames.
- Paralelização.
- Operações gráficas.
- Serialização.
- Construção e gerenciamento de caches.
- Inicialização do exportador.
- Sincronização entre sistemas.

## \*\*TENHA INICIATIVA TÉCNICA.\*\*

Uma descoberta não planejada pode ser mais valiosa do que dez tarefas inicialmente previstas.

---

## 19.14. NÃO PERMITA QUE A DOCUMENTAÇÃO PREJUDIQUE A PRODUTIVIDADE

Embora o Markdown deva permanecer atualizado, evite gastar mais esforço documentando atividades triviais do que resolvendo os problemas reais.

Adote diferentes níveis de documentação:

\*\*Mudanças pequenas:\*\* Registro curto na tarefa correspondente.

\*\*Mudanças importantes:\*\* Resultado, benchmark, arquivos e commit.

\*\*Mudanças arquiteturais:\*\* Decisão técnica, alternativas, justificativa, riscos e resultados.

\*\*Descobertas críticas:\*\* Evidências detalhadas e novas tarefas vinculadas.

O documento deve ser uma ferramenta de engenharia, não uma burocracia que torne a investigação mais lenta.

---

## 19.15. CICLO INCREMENTAL DE PERFORMANCE — SEGMENTOS PRIMEIRO

Exportar milhares de quadros completos três vezes a cada alteração consome tempo sem aumentar proporcionalmente a informação obtida. A partir desta retomada, o ciclo iterativo usa trechos determinísticos do único projeto autorizado e reserva o render completo para validar marcos.

### Fases e limiares

1. **Triagem rápida:** renderizar inicialmente uma janela de 20 s (600 quadros a 30 FPS), com a configuração de qualidade intacta. Escolher no próprio projeto uma janela que cubra cabelo visível, ao menos uma troca de pose/transição relevante e composição representativa; registrar `startFrame`, `endFrame`, timecode e eventos cobertos. Se a janela atual não contiver esses eventos, movê-la com base na timeline, sem editar o projeto-fonte.
2. **Loop de otimização:** medir uma baseline dessa janela; alterar uma causa por vez; executar uma validação funcional do mesmo trecho por candidato. Não fazer três repetições de rotina. Repetir apenas quando ruído, instabilidade ou empate puderem inverter uma decisão; fazer então A/B alternado curto, no máximo duas medições por variante inicialmente.
3. **Meta local:** reduzir a exportação de 20 s para 10 s ou menos, preservando 1920×1080, 30 FPS, preset, cabelo, áudio/vídeo e qualidade. Registrar separadamente preparação do cabelo, render/captura e finalização para que a janela de render não esconda custos fixos do fluxo.
4. **Cobertura progressiva:** ao aproximar/atingir 10 s, ampliar para 40 s (1.200 quadros), incluindo novos tipos de mídia/transições e mais personagens. Otimizar esta janela até 15 s ou menos; repetir a expansão por blocos conforme necessário para cobrir os caminhos pesados distintos da timeline.
5. **Validação de marcos:** quando uma otimização estrutural passar pelos segmentos que ela afeta, validar uma exportação integral. Fazer a comparação completa de repetibilidade/qualidade somente nos marcos finais ou quando a mudança afetar determinismo, sincronização, codecs ou a timeline inteira. Nunca extrapolar a duração integral multiplicando linearmente o tempo de um trecho sem medir preparação, startup, áudio, mux/finalização e aquecimento.
6. **Regressões visuais e temporais:** um segmento curto não basta para defeitos de animação. Para bugs A/B, inspecionar janelas curtas centradas nos eventos reais e incluir quadros antes/durante/depois da transição. Rodar o timeline completo para aprovação final de continuidade.

### Regras para resultados comparáveis

- O projeto só pode ser copiado do backup hash-verificado e nunca usado como saída de teste; toda exportação escreve numa pasta isolada em `out/editor-v6-stress/runs/`.
- Fixar e registrar configuração, preset/fingerprint, `startFrame`/`endFrame`, eventos cobertos, cache frio/quente, build, versão do encoder e tempos de parede. Não comparar trechos diferentes como se fossem a mesma carga.
- Manter validação de quadro, FPS, dimensão, áudio, vídeo e transições aplicáveis ao trecho. O relatório deve indicar explicitamente que é benchmark parcial e quantos quadros foram validados.
- Não alterar duração/qualidade do arquivo final nem do projeto. O recorte existe somente nas opções do harness e não persiste no manifesto.
- Contar toda a preparação e overhead na validação integral; o limiar local de 10/15 s é um gate de render do segmento, não prova da meta final de ≤30 s.
- Cada alteração deve ter hipótese, uma métrica primária, critério visual, resultado e decisão (ADOTAR/REFINAR/INVESTIGAR/REVERTER/DESCARTAR). Se a medição for ruidosa, reduzir ruído antes de aumentar a quantidade de exports.

### Protocolo de gasto de benchmark

Uma execução parcial válida por hipótese é o padrão. Fazer uma segunda execução apenas se a primeira indicar melhora/regressão pequena ou se houver ruído relevante; comparar A/B em ordem alternada quando aquecimento/cache puder distorcer. Não rodar três exportações integrais por candidato. Uma exportação integral fica autorizada como gate após ganho segmentar convincente, e as três integrais são reservadas ao aceite final quando a meta estiver próxima ou alcançada.

---

## # 20. DESAFIO FINAL: SUPERE SUA PRÓPRIA PRIMEIRA SOLUÇÃO

Quando encontrar uma solução que pareça boa, pergunte:

\*\*"Se eu estivesse desenvolvendo este aplicativo do zero hoje, sabendo tudo que descobri, ainda escolheria essa arquitetura?"\*\*

Se a resposta for não, investigue o motivo.

Quando alcançar 30 segundos, realize uma validação final rigorosa para confirmar que o ganho é real e que a animação está correta.

Se identificar uma otimização adicional simples, segura e de alto impacto, você poderá aplicá-la e validá-la.

Não adicione complexidade desnecessária apenas para perseguir números menores.

O objetivo é o melhor equilíbrio entre velocidade, qualidade, robustez e manutenção.

\*\*PRINCÍPIO DEFINITIVO: NÃO OTIMIZE O QUE NÃO PRECISA EXISTIR. NÃO PRESERVE UMA ARQUITETURA INEFICIENTE POR COSTUME. NÃO CONFUNDA CÓDIGO NOVO COM PROGRESSO. NÃO CONFUNDA BENCHMARK PARCIAL COM EXPORTAÇÃO REAL.\*\*

\*\*PENSE, EXPERIMENTE, COMPARE, QUESTIONE SUAS CONCLUSÕES E IMPLEMENTE O QUE AS EVIDÊNCIAS DEMONSTRAREM SER MELHOR.\*\*

---

# ESTADO ATUAL E INSTRUÇÕES DE RETOMADA — 05/11/2026

**Última atividade executada:** medido o custo de estado WebGL (~68 ms por quadro-worker), prototipada a retenção de drawing buffer com crescimento monotônico, viewport/scissor por dimensão e cópia do sub-retângulo correspondente. Uma exportação segmentar completou e comparou em SSIM com dois baselines. O ganho foi adotado para a próxima expansão segmentar; a validação integral continua pendente.

**Alterações de runtime pendentes de validação ampla:** cache/retenção do buffer WebGL foi testado em 600 quadros de qualidade original, mas ainda deve passar por outros trechos e pelo timeline integral.

**Tarefa ativa:** E5-T002 — consolidar a otimização do buffer WebGL; ampliar a amostra e reduzir o recorte de 40 s para ≤15 s. A identificação de estado WebGL resolveu o custo antigo de ~68 ms por quadro-worker no recorte 0–599.

**Próxima ação concreta:** executar uma janela de 40 s (1.200 quadros) sobre a cópia verificada, incluindo novos blocos de personagem/vídeo/transições. Manter resolução, FPS, áudio e preset; medir um passe. Se qualidade e ganho se mantiverem, continuar refinando; ao aproximar de 15 s, fazer a validação integral como gate.

**Projeto de teste único:** `Teste de Importação — Personagens do Pacote`; ID `2d6fb9ec-cfea-45ea-91ff-366fbc1abd59`; atualização `2026-11-05T09:22:12.521Z`; 2.394 quadros/79,8 s/30 FPS. Backup verificável: `out/editor-v6-stress/backups/authorized-import-package-2026-11-05T09-54-16-913Z-20828/`; manifesto `backup-manifest.json`; 3.462 arquivos, 862.295.797 bytes; SHA-256 das origens igual ao destino e às origens após a cópia. Os testes executaram somente sobre cópias isoladas deste projeto.

**Configuração efetivamente medida:** 1920×1080, 30 FPS, duração integral, Turbo, dois workers, encoder selecionado `h264_amf`, 4 vídeos e 4 áudios. Slot 2 não estava salvo na sessão copiada; o primeiro benchmark falhou antes de exportar. Slot 1 veio do fallback padrão do app quando não há preset salvo. Portanto o resultado atual não é comparável diretamente à referência histórica de 92 s, cuja configuração não foi registrada.

**Janela de triagem após a adoção do protocolo:** quadros 0–599 (20 s), 1920×1080/30 FPS, Turbo/dois workers, preset 1 do fallback, 8 transições de movimento preparadas, dois segmentos de vídeo e dois áudios presentes. A janela inclui mudanças de pose dos personagens e a troca de vídeo nos quadros 482/510. Nenhuma opção do manifesto persistido foi alterada. Saída validou 600/600 quadros e áudio/vídeo.

**Benchmark segmentar com cabelo:** uma execução, 60,03 s ponta a ponta (9,28 s de preparação + 50,75 s de export); renderização 41,17 s, finalização 4,06 s. A execução anterior de diagnóstico sem os subestágios detalhados levou 59,73 s ponta a ponta/50,24 s de export. A diferença é pequena e não é tratada como ganho: builds, aquecimento e carga do sistema variam.

**Perfil antes da otimização (mesma janela):** `hairCompositionMs` mediu 21,1–21,3 s somados por worker (p50 69–70 ms, p95 85–89 ms). `hairCompositionOtherMs` ainda parecia 20,4–20,5 s por worker porque o relógio estava incluindo operações de estado WebGL que não eram instrumentadas. Nova medição separou a consulta de perda (4–5 ms no worker) e configuração de estado (~20,1 s no worker; p50 67–69 ms). A causa operacional encontrada foi a reutilização de um único canvas WebGL, redimensionado para cada textura de cabelo em cada quadro.

**Controle sem cabelo no mesmo trecho:** uma execução, 22,26 s total, renderização 11,49 s, finalização 4,00 s, 600/600 quadros e áudio/vídeo válidos. Comparado ao cabelo, o export com cabelo acrescentou ~28,5 s no trecho e ~9,3 s em preparação. A comparação é do mesmo intervalo/configuração, mas ocorreu em processos sequenciais, portanto é evidência indicativa, não A/B alternado controlado.

**Falha de instrumentação registrada:** a primeira execução após introduzir métricas WebGL abortou no retry Turbo→CPU porque `exportRunner` não inicializava acumuladores novos (`recordTiming` recebeu bucket inexistente). A lista de acumuladores foi corrigida; a execução seguinte completou e validou o recorte. Esse erro pertence ao coletor de perfil, não à exportação de produção.

**Experimento `EXP-E5-004` — mover consultas de perda WebGL por quadro:** hipótese: duas chamadas `isContextLost()` por render de camada poderiam sincronizar o renderer; protótipo reduziu as checagens para o começo/fim da composição do quadro. Um único A/B no mesmo recorte, ambos 600 quadros válidos e mesma saída de vídeo (SSIM All=1.000000): baseline instrumentado exportou em 50,42 s; candidato, 54,39 s (+7,9%). Como o candidato não trouxe ganho e relaxa a detecção durante o desenho, a decisão é **DESCARTAR** e manter a validação por chamada. O sistema/ordem de processos não foram alternados, então a diferença não prova causalidade; ela basta para não adotar uma mudança sem benefício demonstrado.

**Experimento `EXP-E5-005` — buffer WebGL grow-only e estado persistente:** um desenho compartilhado era redimensionado ao alternar as dimensões naturais das peças de cabelo. Mudanças: manter o buffer no maior tamanho encontrado; atualizar viewport/scissor apenas quando as dimensões do alvo mudam; manter programa, buffers e textura atuais ligados; limpar somente o retângulo ativo; copiar do retângulo inferior correspondente ao viewport. No recorte 0–599, export caiu de 50,37 s para 33,41 s (-33,7%); render/codificação de 40,75 s para 23,81 s (-41,6%); preparo permaneceu ~9,2 s; total ponta a ponta caiu de 59,76 s para 42,64 s (-28,6%). `hairCompositionMs` saiu de ~21,0 s por worker para 0,76–0,88 s. Os 600 quadros, 1920×1080/30 FPS, áudio e vídeo foram validados; SSIM contra ambos os baselines: Y/U/V/All=1.000000. Decisão: **ADOTAR no loop segmentar**, com confirmação em janela de 40 s ainda pendente. A meta local de 10 s no trecho de 20 s não foi alcançada e não se extrapola este resultado para a timeline inteira.

**Limitação ainda em investigação:** a captura Chromium ainda custa ~15 s somados por worker no recorte após a otimização e provavelmente é o próximo gargalo por parede, mas precisa ser correlacionada com a janela mais ampla. O objetivo agora é ver se a redução de rasterização também se mantém com mais tipos de conteúdo, sem alteração visual ou temporal.

**Baseline completo com cabelo (Preset 1 padrão):** 251,821 s frio; 228,527 s e 206,735 s aquecidos; mediana 228,527 s; melhor 206,735 s. Mediana aquecida de renderização/codificação 177,15 s, preparação de cabelo 26,35 s e finalização 13,17 s. 140 rigs, 39/39 transições, 37 amostras de bake; bundle de 89.661.643 bytes. Saída validou 2.394 quadros, 1920×1080, 30 FPS, áudio e vídeo. SSIM run 1 vs 2: All 1.000000 (Y 1.000000, U 1.000000, V 0.999999). As rodadas 2 e 3 têm MP4 com SHA-256 idêntico.

**Controle completo sem cabelo:** 75,251 s frio; 53,859 s e 54,662 s aquecidos; mediana 54,662 s. Renderização aquecida mediana 41,85 s; finalização ~11,98 s. 2.394 quadros, 1920×1080, 30 FPS, 4 vídeos/4 áudios. SSIM das rodadas aquecidas: All 1.000000 (idêntico). Sem cabelo o tempo ainda excede a meta; o tempo de renderização sozinho é maior que 30 s.

**Descoberta de prioridade:** a renderização com cabelo demora cerca de 4× o controle aquecido. `hairCompositionMs` soma alto trabalho de workers, mas a principal etapa por parede é render/captura; os números internos de workers se sobrepõem e não podem ser somados como duração. A meta exige atacar também o pipeline geral de render/captura, não apenas o preparo do preset. `preserveDrawingBuffer: true`, 24×32 vértices por peça e composição WebGL→Canvas2D por frame são alvos de perfil, não causas comprovadas ainda.

**Inspeção visual limitada:** amostras dos frames 450–480 foram verificadas. O vídeo de origem correspondente ao quadro escuro também está preto; isso não é um defeito introduzido pelo export. A inspeção não basta para aprovar continuidade do cabelo. Problemas A/B/C relatados ainda precisam de teste focado nas transições e personagens compatíveis.

**Testes/verificações desta retomada:** `npm run test:editor-v6:quick` — 57 testes/13 arquivos + 6 gates aprovados; `node --test tests/editor-v6/analyzeHairBenchmark.test.cjs` — 7/7; `npm run typecheck`, `npm run audit:architecture` e `npm run build` aprovados. O recorte segmentar com cabelo validou 600/600 quadros, 1080p30, áudio e vídeo. A otimização grow-only comparada com os baselines de mesmo trecho deu SSIM Y/U/V/All=1.000000. Controle sem cabelo, perfis anteriores e teste rejeitado estão descritos acima. A nova otimização foi submetida só à janela 0–599; a janela 40 s e timeline integral ainda faltam. Os resultados completos 3+3 anteriores são baseline histórico; não foram repetidos nesta retomada. Uma chamada anterior via `npm run` falhou antes de iniciar Electron por aspas de paths com espaços; comandos diretos a Node funcionaram. A UI CUA falhou duas vezes ao inicializar e não tocou no app/perfil normal.

**Pesquisa externa aplicada:** [Electron webContents](https://www.electronjs.org/docs/latest/api/web-contents), [MDN OffscreenCanvas](https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas/transferToImageBitmap), [MDN WebCodecs](https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API/Using_the_WebCodecs_API), [FFmpeg codecs](https://ffmpeg.org/ffmpeg-codecs.html). Servem como candidatas de experimento; ainda não demonstraram paridade nem ganho neste app.

**Arquivos alterados nesta etapa:** `electron/main.ts`, `electron/domains/editorV6/exportRunner.ts`, `src/shared/editorV6Export.ts`, `src/renderer/src/features/editorV6/exportHairMeshRenderer.ts`, `src/renderer/src/features/editorV6/exportWorker.tsx`, `scripts/editor-v6/benchmark-project-export.cjs`, `scripts/editor-v6/analyze-hair-benchmark.cjs`, `tests/editor-v6/analyzeHairBenchmark.test.cjs`, `scripts/editor-v6/backup-authorized-project.cjs` e este Markdown. Saídas grandes e cópias estão em `out/` ignorado pelo Git; o perfil original não foi modificado.

**Problemas ainda abertos:** missão de ≤30 s não cumprida; bugs visuais do cabelo não reproduzidos/inspecionados adequadamente; comparação histórica de 92 s não tem configuração idêntica; qualidade visual comparativa de hair/no-hair não aprovada; custo de captura, encoder e composição precisa ser isolado. Os seis exports completos anteriores servem como baseline inicial e não devem ser repetidos a cada hipótese.

### Investigação visual — transições de pose e variação vertical (05/11/2026)

**Relato:** no projeto autorizado, as duas primeiras trocas de pose pareceram estáticas e outras personagens parecem crescer rapidamente na vertical durante a transição.

**Causa ainda não confirmada; sem alteração de runtime nesta investigação.** O plano atual usa transições de 250 ms, amostradas em sete quadros a 30 FPS. As duas primeiras trocas do documento são `test` (pose 1→6 no quadro 450) e `hino` (pose 3→1 no quadro 1350). As revisões de pose diferem entre os endpoints, mas continuam sendo o mesmo personagem, modelo e componentes. O agendador atual gera plano e chave para ambas; a revisão da pose é incluída na chave do cache. Portanto, a hipótese anterior de que a diferença de revisão bloqueasse essas transições foi descartada.

**Reprodução focada no export real, cabelo Preset 1:** foram executados dois trechos isolados de 30 quadros (1 s), sem repetir a timeline inteira:

| Troca | Janela exportada | Resultado técnico | Inspeção visual |
|---|---:|---|---|
| `test`, pose 1→6 | quadros 443–472 | export MP4 validado, 1920×1080/30 FPS, áudio e vídeo; 1/1 transição preparada; parede 12,81 s | há quadros de transição no contato extraído; a pose muda gradualmente, mas o movimento é curto e pode parecer abrupto |
| `hino`, pose 3→1 | quadros 1343–1372 | export MP4 validado, 1920×1080/30 FPS, áudio e vídeo; 1/1 transição preparada; parede 14,30 s | ator está em x=-43% da cena e quase todo fora do enquadramento, reduzindo muito a leitura visual da mudança |

Resultados completos e contatos estão em `out/editor-v6-stress/runs/actual-project-2026-11-05T12-29-47-324Z-8884/` e `out/editor-v6-stress/runs/actual-project-2026-11-05T12-31-53-577Z-8884/` (arquivos ignorados pelo Git). Esses exports curtos confirmam que o pipeline prepara as transições citadas, mas não reproduzem uma falha do agendador. Eles **não aprovam** toda a timeline nem explicam por que o aumento vertical foi percebido.

**Escala dos endpoints:** nos cinco blocos de troca de pose do documento, altura salva varia no máximo ~0,53% entre cada par de endpoints (eixo vertical da timeline); `characterScale` e `characterHeightScale` permanecem iguais. O bake calcula escala de cada endpoint a partir do recorte alfa e escala vertical intermediária a partir das dimensões do recorte de cada amostra. Um recorte intermediário pode variar conforme a silhueta da pose; ainda falta capturar e medir os limites alfa/renderizados ao longo de uma troca que manifeste o salto. Não substituir essa geometria por uma caixa interpolada sem essa medição, pois poderia deformar ou cortar cabelo e membros.

**Próxima ação:** obter o timecode ou personagem/quadro onde o salto vertical é visível e inspecionar os quadros anterior, intermediários e posterior em resolução original; medir caixa alfa e retângulo efetivamente desenhado, identificar se o salto vem do recorte, do conteúdo da pose ou da montagem/exportação e então corrigir no dono da regra. Manter o ciclo curto (uma janela, uma hipótese, uma execução) e validar no mesmo trecho. Nenhuma correção visual foi declarada concluída nesta etapa.

### Revisão do ZIP externo — `Native-Gacha-Dev-V2-editor-v6-corrigido.zip` (05/11/2026)

O ZIP foi extraído isoladamente em `out/zip-review-2026-11-05/`, sem sobrescrever o clone. Tem 1.301 arquivos contra 1.298 rastreados pelo Git; inclui quatro arquivos novos e omite o arquivo rastreado `video-studio-diagnostico-interrompido.zip`. O hash bruto divergia em 624 caminhos, mas, normalizando CRLF/LF, só seis arquivos de código tinham mudanças substantivas: `exportRunner.ts`, `prepareMotions.ts`, `exportWorker.tsx`, `bakeMotion.ts`, `editorV6Export.ts` e `editorV6Motion.ts`. Os quatro novos são `framePipeline.ts`, `editorV6MotionCropExcursion.ts` e seus dois testes. As centenas de outras diferenças eram finais de linha; não foram copiadas em massa.

**O que a proposta faz:** instrumenta a excursão dos recortes alfa intermediários em relação aos endpoints; conta quadros em que a transição do cabelo não tem amostra preparada; e adiciona um frame pump que tenta renderizar enquanto a escrita anterior ao FFmpeg está em andamento. Quando o renderer reutiliza um bitmap mutável (vídeo em camadas), o pump espera a escrita antes de renderizar o próximo quadro. O diagnóstico não muda a escala nem corrige o defeito visual por si só.

**Verificação do subconjunto em worktree isolado:** `npm run typecheck` passou; 58 testes focados passaram (incluindo 7 do frame pump); build Electron passou. O mesmo subconjunto foi testado no clone e uma exportação isolada do projeto autorizado, quadros 893–922, porta 5188, Preset 1, validou 30 quadros a 1920×1080/30 FPS com áudio e vídeo e preparou 1/1 transição. Parede ponta a ponta: 13,25 s, incluindo inicialização/preparo; não é comparável a uma baseline equivalente.

**Limitação encontrada no teste integrado:** o relatório real trouxe `transitionCropExcursions: []` para a transição preparada, então o diagnóstico não identificou a amostra vertical nesse caso. A instrumentação de recorte não cobriu esse caminho de bake (possivelmente uma variante com fala; precisa confirmação no request e no retorno do bake). A exportação curta também não mede ganho do frame pump contra a implementação anterior. Portanto, o ZIP **não demonstra uma correção do crescimento vertical nem uma melhoria de tempo**. A alteração foi mantida apenas na área de revisão isolada; o runtime do V6 não foi integrado a partir deste ZIP. Próximo passo: corrigir a cobertura do diagnóstico e validar sua razão com escala/endpoints; medir o frame pump em trechos idênticos antes/depois sem encadear exports completos por hipótese.

**Estado Git da retomada:** commit desta alteração `1854a62b0df336b58a86b3c2880d724a816c7fde`; commits prévios da missão `cc27b5f382ef699fa323968b0148578be8f09c98`, `7c1a082950da3173c35110eb37f0e405d5de6b2e`, `a96d6ac1178ee2d38a647baa506f60118733da2d` e `da91080da366dd3f23a020baf9215a66334d09e7`. O perfil, mídias, caches e resultados sob `out/` não foram incluídos.

**Experimentos:** `EXP-E0-001` — gate unitário (aprovado; não comprova export); `EXP-E0-002` — backup/identidade do projeto (aprovado por SHA-256); `EXP-E5-001` — baseline de cabelo (3 exports completos válidos, meta falhou); `EXP-E5-002` — controle sem cabelo (3 exports completos válidos, meta falhou); `EXP-E5-003` — SSIM entre rodadas (paridade temporal alta/repetição exata em aquecidos); `EXP-E5-004` — consultas de perda WebGL por camada (DESCARTAR: nenhum ganho, SSIM igual); `EXP-E5-005` — buffer WebGL grow-only/estado persistente (ADOTAR segmentar: -33,7% no tempo de export e SSIM All=1.000000 no trecho). Próxima decisão: ampliar o candidato a 40 s e perseguir ≤15 s.

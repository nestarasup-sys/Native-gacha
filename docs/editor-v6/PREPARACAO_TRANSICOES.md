# Preparação de transições — cache e reutilização

Implementado em 26/10/2026, na branch `Main-desenvolvimento`.

## Comportamento

- O exportador agrupa as transições por `motion.key`, prepara cada conteúdo distinto uma vez e compartilha o atlas entre os blocos equivalentes. Um atlas válido já presente no projeto também pode ser reaproveitado.
- O serviço mantém um cache persistente em `userData/cache/editor-v6-motion-v2`. O cache fica fora dos documentos dos projetos: não acrescenta atlas ao JSON salvo pelo usuário nem disputa com autosave.
- A chave SHA-256 inclui versão do preparador, assinatura da transição e conteúdo do personagem. A assinatura existente inclui poses/revisões, expressão/revisões, rosto, geometria e amostras de fala. Alterações nesses dados deixam de usar a entrada anterior.
- Cada arquivo possui checksum, validação de schema e conferência da chave e dos offsets. Arquivos ausentes, corrompidos ou inválidos são tratados como cache ausente. O resultado é publicado por rename de temporário; falha no cache não impede exportar.
- Limites: 128 entradas e 256 MiB em disco, descarte por uso recente; arquivos individuais acima de 32 MiB não são retidos. Temporários órfãos com mais de uma hora são removidos na próxima manutenção. Cache em RAM: oito atlas ou 24 milhões de caracteres de data URL.
- Uma janela oculta permanece disponível durante o lote, encerrando após 30 segundos sem renderização. Ao fechar a janela principal, preparadores ociosos são liberados imediatamente. Cancelamento e encerramento também fecham preparadores ativos.
- O worker atende vários pedidos. Compartilha fontes e materiais enquanto a revisão do personagem/fontes for compatível, reiniciando a sessão após oito pedidos. O provider retém no máximo 32 consultas; materiais são limitados a quatro entradas após cada preparação. Consultas faciais usam somente cache por pedido para não reter calibrações antigas entre presets. Rigs e superfícies temporárias continuam sendo descartados por transição.
- A preparação antecipada começa 2,5 segundos após o editor salvo ficar ocioso. Interação, arraste, reprodução, edição ou exportação cancelam/suspendem esse trabalho. Há uma pausa entre pedidos. O canal `prepareEditorV6Motion` retorna somente a conclusão; PNGs grandes não voltam para a interface durante o aquecimento do cache.
- A duração de 250 ms e as até sete amostras inteiras em 30 FPS permanecem iguais. Nenhuma redução de resolução/amostras foi aplicada.

## Evidência no projeto local de teste

Inspeção somente de leitura dos planos do projeto pesado criado a partir do Editor V6 03:

| Medida | Resultado |
| --- | ---: |
| Trocas de personagem no intervalo completo | 169 |
| Chaves distintas | 80 |
| Repetições que compartilham atlas | 89 |
| Maior repetição da mesma chave | 8 |

Um cache frio precisa solicitar no máximo 80 conteúdos distintos nesse documento, em vez de 169 pedidos individuais. Se todas as entradas continuarem válidas e couberem no cache, exports seguintes podem recuperar os resultados sem rasterizar novamente. Preparação antecipada pode fazer parte desse trabalho antes do clique em Exportar. Isso não garante que o primeiro export seja imediato.

## Experimento isolado no Electron

Comando: `npm run test:editor-v6:motion-service`. Perfil temporário separado, personagem sintético de 100 × 100, quatro transições distintas por rodada. Três rodadas por variante, com ordem alternada; cache em disco desativado na comparação das janelas. Dados da rodada de referência ficam em `out/editor-v6-motion-service/reference-run.json`; a execução mais recente fica em `result.json` na mesma pasta, fora do Git.

| Variante | Mediana | Mínimo–máximo | Janelas por lote |
| --- | ---: | ---: | ---: |
| Janela nova por transição, reproduzindo o ciclo anterior | 612,9 ms | 532,3–618,9 ms | 4 |
| Uma janela reutilizada | 226,4 ms | 226,2–265,2 ms | 1 |
| Duas janelas reutilizadas | 189,8 ms | 187,0–252,6 ms | 2 |

A consulta ao cache após recriar o serviço levou 16,7 ms para o atlas sintético, retornando o mesmo asset sem abrir renderer. O PNG produzido com recursos aquecidos foi idêntico ao produzido inicialmente (SHA-256 comparado durante o teste).

Esses tempos medem a fixture pequena e o custo de inicialização; não são os tempos dos personagens reais nem uma previsão do MP4 completo. Rodadas adicionais de desenvolvimento mostraram variabilidade e casos em que dois preparadores foram mais lentos. O padrão de produção permanece em **um preparador reutilizado**; concorrência dois está disponível no serviço para experimentos isolados, sem ativação automática no app.

## Verificação

- `npm run typecheck`: aprovado.
- `npm run audit:architecture`: aprovado, sem novas dependências proibidas.
- `npm run test:editor-v6`: 62 testes aprovados e um teste de geração de fixtures ignorado por configuração.
- `npm run test:editor-v6:motion-service`: aprovado. Inclui reutilização de janela/fontes, equivalência do atlas, cache após recriar serviço, retorno leve do IPC antecipado, cancelamento e recuperação, liberação das janelas e comportamento ocioso/interação do hook.
- `npm run test:editor-v6:motion`: aprovado; movimento de pose, expressão e descarte de rigs conferidos em Chromium. O processo imprimiu um aviso de GPU durante encerramento após concluir as verificações.
- `npm run test:editor-v6:surface`: aprovado; captura e SVG da prévia iguais, diferenças de captura nativa limitadas à suavização de texto.
- `npm run test:editor-v6:export`: aprovado; MP4, áudio, Turbo, emenda durante animação, fallback e cancelamento.

A primeira rodada da superfície revelou uma asserção antiga que esperava X/Y por bloco, contrariando a regra atual de posição compartilhada. A verificação foi corrigida para conferir a posição compartilhada e continuar exigindo a imagem original antes da mudança visual. A mensagem singular de progresso esperada pelo teste de export foi preservada.

## Limitações e próxima medição

Não foi exportado o projeto real inteiro de 150 segundos neste ciclo. A redução de 169 para 80 foi obtida dos planos reais; a medição temporal foi feita com a fixture sintética. O próximo comparativo deve exportar o mesmo trecho real com cache frio, cache aquecido e após reabrir o aplicativo, registrando `motionPreparation` do relatório. Esse campo informa total, chaves distintas, pedidos, reaproveitamentos e tempos de espera por pedido. Um pedido pode ser um hit no serviço; `requested` não significa necessariamente uma nova rasterização.

O cache é descartável. Evicção, revisão alterada ou falha de armazenamento causam nova preparação. Não há migração de documentos nem alteração das mídias originais. Preparação em outro processo ainda usa CPU/memória do computador, motivo para suspendê-la durante interação e manter apenas um preparador como padrão.

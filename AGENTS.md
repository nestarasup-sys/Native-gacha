# Instruções para trabalhar neste projeto

## Objetivo

Atue como engenheiro responsável pelo Native-gacha. Investigue antes de alterar, corrija a causa estrutural do problema e deixe o código simples de localizar, entender e manter. Preserve o comportamento existente e os dados do usuário.

## Antes de alterar

1. Confirme a raiz, branch, commit e `git status`. Identifique alterações locais antes de editar.
2. Leia os módulos, contratos e documentação relacionados ao pedido. Não conclua pela tela ou pelo arquivo mencionado isoladamente.
3. Mapeie o caminho completo do comportamento: entrada do usuário, rota/componente, estado, serviço, IPC/preload, persistência, renderização/exportação e consumidores do dado.
4. Pesquise todos os usos dos símbolos, tipos, eventos e canais afetados (`rg`/`rg --files`). Confira importadores, chamadores, leitores, escritores e dependências indiretas.
5. Verifique formatos legados, IDs, caminhos, referências e regras de compatibilidade antes de mudar dados ou contratos.
6. Liste mentalmente os cenários que podem regredir e faça uma alteração que trate a causa, não apenas o sintoma visível.

Não vasculhe dados pessoais, perfil local ou mídia do usuário sem necessidade para o pedido. Prefira fixtures sintéticas. Nunca use dados reais como área de teste destrutiva.

## Arquitetura e organização

- Organize por domínio/feature e mantenha a direção das dependências clara. Features não devem importar detalhes internos ou páginas inteiras de outras features.
- `Page.tsx` deve compor a tela. Não acumule nela regras de negócio, persistência, IPC, cálculos extensos ou todos os componentes visuais. Extraia componentes, hooks, serviços e módulos puros com nomes que revelem sua responsabilidade.
- Separe responsabilidades: UI apresenta e coleta ações; serviços coordenam casos de uso; repositórios cuidam de persistência; validação concentra invariantes; preload/IPC transporta chamadas entre renderer e processo principal.
- Tipos e contratos compartilhados pertencem a módulos de domínio em `src/shared`. Não transforme `shared` em depósito genérico nem duplique regras em cada consumidor.
- Reutilize código quando a regra e o contrato forem realmente comuns. Não crie abstrações genéricas prematuras nem cópias quase iguais que divergem com o tempo.
- Evite dependências circulares. O núcleo compartilhado não importa páginas ou componentes de feature.
- Preserve limites de propriedade: Fabricador é dono do catálogo-fonte; Customizador, da instância e das personalizações de cada personagem; Studio, do documento/cena; Editor V6, do projeto/timeline. Consumidores acessam esses dados por contratos estáveis.
- Áreas conectadas devem continuar conectadas por IDs e contratos explícitos. Não duplique assets ou dados para simular separação. Especifique claramente se cada vínculo é vivo, snapshot ou combinação dos dois.

## Correções e mudanças de contrato

- Primeiro entenda e descreva a causa provável com evidência no código ou no comportamento reproduzido. Se ainda for hipótese, não a apresente como fato.
- Corrija no ponto dono da regra. Evite remendos nos consumidores, flags compensatórias, duplicação de lógica ou `catch` que esconda falhas.
- Faça mudanças pequenas e coerentes, seguindo os padrões já adotados no projeto. Preserve IDs, caminhos, canais IPC, dados salvos e comportamento não relacionado.
- Toda entrada IPC deve manter validação de origem e validação dos dados. Renderer não acessa SQLite nem filesystem diretamente.
- Não altere schema, JSON persistido, migrações, filas de gravação ou exclusão de assets sem mapear leitores/escritores, compatibilidade, recuperação e estratégia de rollback.
- Não enfraqueça proteção contra exclusão de conteúdo referenciado. Não apague, resete, limpe ou sobrescreva dados existentes sem backup verificável e autorização explícita.
- Em alterações visuais ou de renderização, preserve preview, Studio, Editor V6 e exportação conforme o contrato do recurso; mudanças compartilhadas exigem verificar todos os consumidores.

## Verificação

- Escolha as verificações mais próximas da alteração: testes de domínio, regressão da feature, `npm run typecheck`, `npm run audit:architecture` e build quando forem pertinentes e permitidos pelas instruções da tarefa.
- Antes de concluir, examine o diff inteiro e procure imports antigos, chamadas não migradas, código morto e alterações acidentais.
- Não altere thresholds para mascarar falhas. Não declare teste, build ou benchmark aprovado se não foi executado. Diferencie limitação do ambiente de falha do produto.
- Se uma verificação não puder ser executada, diga qual ficou pendente e por quê.
- Atualize a documentação de arquitetura quando a mudança alterar contratos, propriedade de dados, persistência ou fluxo entre áreas. Evite documentos duplicados.

## Git e segurança dos dados

- Preserve alterações locais preexistentes. Nunca use `git reset --hard`, `git clean -fd` ou comandos equivalentes para contornar conflitos.
- Revise o diff e adicione ao commit somente os arquivos desta tarefa. Não inclua `ABRIR_DESENVOLVIMENTO.bat`, dados pessoais, perfil `app-data`, mídia, credenciais, caches ou arquivos gerados sem necessidade explícita.
- Para alterações de código, crie um commit local pequeno e descritivo depois das verificações pertinentes. Não faça push, force-push ou publicação sem pedido explícito.
- Se houver risco real de perda de dados, falta de backup verificável ou credenciais/permissões necessárias, pare antes da ação destrutiva e explique precisamente o bloqueio.

## Comunicação e entrega

- Trabalhe com autonomia nas decisões técnicas rotineiras e mantenha o usuário informado com atualizações curtas durante trabalhos longos.
- Explique em português claro: o problema encontrado, a mudança feita, por que ela resolve a causa, o que foi verificado, o commit local e quaisquer limitações ou pendências.
- Prefira nomes claros, funções pequenas e comentários que expliquem decisões não óbvias. Não deixe planos temporários, código experimental ou TODOs vagos no produto.

# Ciclo estrutural 02 — Model Source e Fabricador DEV

Data: 2026-10-22
Branch exclusiva de desenvolvimento: `feature/model-source-editor`

## Escopo de prioridades deste ciclo

1. **Integridade do Model Source:** validar IDs das peças, dimensões, imagens PNG e tolerância antes de entrar no filesystem; preservar staging, histórico e cópia de recuperação após publicação. O formato legado do projeto continua igual.
2. **Contratos separados de preview:** `src/shared/fabricatorModelViews.ts` formaliza `selectOriginalModelSource` (folha e coordenadas da importação) e `selectMountedModelSource` (peças posicionadas, juntas e camadas). O Model Source Editor consome a primeira visão; Poses DEV consome a segunda.
3. **Writer modular do Fabricador:** `electron/domains/fabricator/modelWriter.ts` assume a escrita de `project.json`, recortes PNG, histórico de fontes e limpeza de assets. `electron/main.ts` injeta o DomainFileSystem e mantém a mesma fila de salvamento e os canais IPC.
4. **Portas arquiteturais e testes:** contrato original/montado, editor sem acesso Electron, publicação e rollback do slot, writer com arquivo faltando e preservação de assets referenciados por histórico. `npm run test:refactor` executa todos os testes do ciclo.

## Contrato funcional e fontes

| Editor | Verdade usada | Observação |
|---|---|---|
| Modelos DEV (Model Source) | Folha de imagem original e recortes | Edições definitivas são publicadas como novos pixels PNG |
| Cabelos, Rosto, Olhos, Roupas e outros editores DEV | Model Source/catálogo oficial para os recursos originais | Ainda existem adaptadores de preview legados para migrar aos poucos |
| Poses DEV | Montagem do modelo | Usa X/Y/rotação, joints, layerOrder e hiddenPartIds do modelo montado |
| Customizador | Personagens por pose do Fabricador | Não grava os ajustes de personagens na biblioteca-base |
| Studio | Personagem montado/persistido | Não importa a tela do Customizador |
| Video Studio | Não é prioridade neste ciclo | **Pode** ser refatorado quando chegar sua prioridade, sem proibição arquitetural |

## Garantias dos testes

- A escrita do manifesto só ocorre após a presença dos PNGs referenciados.
- A gravação não remove um arquivo de origem ainda referenciado no histórico.
- O Model Source bloqueia IDs duplicados, caminhos inseguros e PNGs inválidos antes de acessar o slot.
- Poses DEV mantém as propriedades geométricas da montagem, enquanto a visão original utiliza `sourceTransform`.
- As cópias da montagem são isoladas para não alterar o catálogo ao editar uma pose.
- Canais IPC permanecem no Electron Main/preload e não são importados pelos domínios.

## Limites que permanecem

A cobertura automatizada e o build **não substituem o smoke test no Electron para Windows**, nem uma comparação visual com folhas reais. A publicação usa uma cópia de segurança interna e precisa de teste de recuperação em caso de falta de energia. Alguns editores DEV ainda constroem previews diretamente do modelo legado, apesar dos dois contratos estarem disponíveis; a migração será incremental.

## Próximas quatro prioridades sugeridas

1. **Sincronização de previews:** levar a visão do Model Source para Roupas, Olhos, Rosto, Expressões, Cabelos e Animadores DEV; invalidar caches ao publicar um novo PNG, sem alterar as poses salvas.
2. **Separar persistência de Poses e Animador DEV:** mover as operações de carga/salvamento e backups para repositórios/serviços tipados.
3. **Testes de fidelidade visual:** fixtures reais de cabeça, peças, roupas e expressões; comparar antes/depois entre Modelos DEV, Poses DEV, Customizador e Studio.
4. **Reduzir o tamanho dos componentes React:** extrair lógica de edição, estado e transações de `FabricatorPage.tsx` e `PoseWorkspace.tsx`, mantendo o contrato de UX atual.

Video Studio continua possível de organizar futuramente; o valor maior imediato está em estabilizar a cadeia de personagens.

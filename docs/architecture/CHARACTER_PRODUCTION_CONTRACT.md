# Contrato de produção de personagens — Native Gacha

## Fonte de verdade

- A exclusão de um segmento recém-dividido na folha transfere a identidade original ao único segmento sobrevivente. Roupas legadas com vínculo perdido por essa operação são conciliadas em memória na leitura do catálogo: exige-se um backup de publicação com o ID antigo, os demais membros estáveis do mesmo rig e um único sobrevivente com o nome de divisão. Não há gravação automática, e casos ambíguos continuam sendo rejeitados pela validação.

- **Fabricador DEV** produz e armazena modelos, poses, roupas, cabelos e peças faciais. Catálogos não são alterados por operações de personalização.
- **Duplicar modelo** cria um snapshot independente em um slot vazio a partir do manifesto e dos arquivos salvos do modelo. A publicação usa uma pasta temporária validada; o slot de origem e os demais catálogos permanecem intactos, e a cópia começa com histórico de edição vazio.
- Cada `project.json` pode guardar `modelSkinTone` e `modelOutlineColor` como cores padrão daquele slot. Para pele removida, o preview preenche interiores transparentes fechados com a base Porcelana (`#f5ddcb`) e aplica as cores a todas as peças anatômicas sem regravar os PNGs originais.
- Em todas as áreas do Fabricador DEV, os controles de pele e contorno apontam para o modelo-base selecionado pela área. Os previews usam as mesmas cores salvas no slot de Modelos e refletem alterações sem gravar imagens coloridas nos PNGs de origem.
- Cada peça anatômica pode guardar `fakeSkinContours`: traços-guia normalizados que fecham aberturas intencionais no algoritmo de preenchimento. Eles são metadados opcionais da peça, não alteram o PNG nem aparecem na imagem final. Os previews de modelo desativam o preenchimento genérico por scanline para as guias limitarem a pele às aberturas desejadas. O Fabricador permite editar esses traços por peça; o renderer compartilhado os aplica no Customizador, Studio e Editor V6. Modelos e snapshots antigos sem esse campo continuam válidos.
- O rig reconhece segmentos nomeados e seus lados para ligar antebraço ao braço superior e canela à coxa, antes de usar posição como fallback. Na cópia de Poses, vínculos cruzados entre braços e pernas são corrigidos preservando ID e estado fixado; em Modelos, “Conectar / corrigir automaticamente” grava a correção no modelo.
- Em Roupas DEV, “Juntar juntas” só desloca canelas até coxas e antebraços até braços superiores na prévia; tronco, cabeça, coxas, braços superiores, mãos e pés ficam nas posições originais. Usa âncoras do rig; modelos antigos sem juntas usam a inferência comum. A operação não grava no modelo, na folha original nem nos PNGs. Importações 3×4 marcam mangas/calças longas com o metadado opcional `sleeveJointSplit`; o usuário posiciona a peça inteira e confirma a divisão na junta, que cria recortes RGBA vinculados aos dois segmentos no rascunho da roupa. Registros antigos continuam legíveis sem migração. `tests/wardrobe-joint-assembly.test.mjs` cobre alinhamento, seleção de junta, preservação dos pixels, rotação e compatibilidade.
- O Model Source Editor gira os pixels da peça em quartos de volta no rascunho. A publicação atualiza os PNGs e o retângulo na folha, preserva IDs e gira os pivôs/contornos artificiais junto com a imagem; a operação é recusada se sair dos limites da folha ou invadir outra peça.
- **Customizador** guarda somente as referências de catálogo e ajustes específicos de cada personagem: pose, roupa, cabelo, cores, corpo, rosto e transformações.
- O Customizador usa as cores padrão do modelo quando o personagem não tem substituições em `customization.modelSkinTone` e `customization.modelOutlineColor`; as escolhas do personagem continuam sendo propriedade do Customizador.
- Cabelo, roupas e acessórios usam os papéis fixos de contorno, sombra, base, cor secundária e detalhe/acessório. A detecção da secundária aceita a amostra cinza antiga `#E2E2E2` e a amostra ciano `#55C5D4` usada nas folhas novas; ambas seguem para o mesmo papel. As demais amostras de origem são `#2B2B2B`, `#6B6B6B`, `#A8A8A8` e `#8C7BFF`; as cores iniciais aplicadas são `#2B2B2B`, `#6B6B6B`, `#A8A8A8`, `#55C5D4` e `#8C7BFF`. O papel secundário mantém a chave salva `light` para compatibilidade, e as novas escolhas ficam na personalização do personagem. Olhos e rosto continuam no recoloridor anterior; pele mantém seu recoloridor próprio. Nenhum desses caminhos grava cores nos PNGs do Fabricador.
- **Studio** consome o personagem persistido e o renderer compartilhado em `src/renderer/src/characters/characterRenderer.ts`. Não pode importar a tela `CustomizerPage.tsx`.
- **Video Studio** está congelado. Caminhos de importação legados são mantidos como fachadas; não reescrever o renderer de vídeo durante esta refatoração.

## Fronteiras estabelecidas

```text
electron/domains/fabricator/       biblioteca e acesso ao disco
electron/domains/customizer/       persistência de personagens
src/shared/                       modelos, regras e geometria pura
src/renderer/src/characters/       renderização e composição de personagens
src/renderer/src/features/         telas de Fabricador, Customizador e Studio
```

Dependências entre features não devem aumentar. A auditoria em `scripts/architecture/check-boundaries.cjs` fixa zero imports runtime do Studio para o Customizador e vice-versa entre Fabricador e Customizador.

## Não quebrar

1. Manter nomes e respostas dos canais IPC existentes.
2. Manter compatibilidade de `characters.json`, arquivos `project.json`, dados de poses/roupas e seus backups.
3. Não salvar personalizações de volta no catálogo do Fabricador.
4. Não introduzir um novo backend remoto para acessar dados locais.
5. Testar fluxos de criação e reabertura com dados antigos antes de qualquer migração.

## Validação automatizada

```bash
npm ci
npm run audit:architecture
npm run test:refactor
npm run test:geometry
npm run typecheck
npm run build
```

A suíte de integração em `tests/character-production-flow.test.mjs` cria dados temporários; não modifica o perfil real do usuário. A suíte de catálogo de roupas cobre a leitura imutável, as regras de filtragem e a autorização IPC.

## Pendências que exigem validação real

- Abrir o desktop no Windows e comparar visualmente um personagem com múltiplas roupas, cabeças e poses antes/depois.
- Confirmar a resolução de caminhos de arquivos, PNG, assets legados, zoom e salvamento/reabertura de uma sessão real.
- Extrair progressivamente operações de gravação do Fabricador, mantendo queues, atomicidade, backups e contratos intactos.
- Consolidar um resolvedor único para personagens no Studio e um conjunto de fixtures visuais de regressão. Nenhuma dessas duas tarefas foi concluída nesta etapa.

**Estado:** refatoração em pull request; não é aprovação para uso em produção sem validação visual do Electron.

# Contrato de produção de personagens — Native Gacha

## Fonte de verdade

- **Fabricador DEV** produz e armazena modelos, poses, roupas, cabelos e peças faciais. Catálogos não são alterados por operações de personalização.
- **Customizador** guarda somente as referências de catálogo e ajustes específicos de cada personagem: pose, roupa, cabelo, cores, corpo, rosto e transformações.
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
